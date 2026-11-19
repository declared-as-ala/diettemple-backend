/**
 * Recipe catalogue sync — the safe replacement procedure.
 *
 * Order of operations (the previous catalogue stays available until the new one is fully ready):
 *   1. validate the dataset            → any error: stop, database untouched
 *   2. upload photos (idempotent)      → any failure: stop, database untouched
 *   3. stage the new recipes hidden    → inserted/updated with status "review" (or kept as they are)
 *   4. publish the new recipes         → makes the dataset visible
 *   5. archive legacy recipes          → hidden but KEPT (favorites and history keep resolving)
 *   6. verify; on any failure → restore the legacy recipes and hide the dataset again
 *
 * MongoDB here is a standalone server (no transactions), so safety comes from this ordering, from archiving
 * instead of deleting, and from the pre-deploy backup + `--rollback`.
 */
import { DATASET_ID, LEGACY_CUTOFF, type SeedRecipe } from './recipeTypes';
import { validateRecipes, type ValidationIssue } from './recipeValidation';
import { planSync, toRecipeDocFields, type RecipeDocFields, type StoredRecipeRef } from './recipeSync';
import { ensureImageUploaded, imageFileExists, type ImageStorage } from './recipeImages';

export interface RecipeStore {
  findDataset(datasetId: string): Promise<StoredRecipeRef[]>;
  /** Insert a new dataset recipe with the given (hidden) status. */
  insert(doc: RecipeDocFields, status: 'review' | 'published'): Promise<void>;
  /** Update dataset content; an archived recipe coming back is staged hidden. Never changes a published recipe's status. */
  update(doc: RecipeDocFields): Promise<void>;
  /** Make the given dataset recipes public. Returns how many changed. */
  publish(datasetId: string, slugs: string[]): Promise<number>;
  /** Hide dataset recipes from the public catalogue (status "review"). Returns how many changed. */
  hide(datasetId: string, slugs: string[]): Promise<number>;
  countLegacyActive(cutoff: Date): Promise<number>;
  archiveLegacy(cutoff: Date, batchId: string, now: Date): Promise<number>;
  restoreLegacy(batchId: string): Promise<number>;
  countPublishedDataset(datasetId: string): Promise<number>;
}

export interface SeedOptions {
  apply: boolean;
  now?: Date;
  batchId?: string;
}

export interface SeedReport {
  mode: 'dry-run' | 'apply';
  batchId: string;
  expectedPublished: number;
  imported: number;
  updated: number;
  unchanged: number;
  published: number;
  archivedLegacy: number;
  legacyActiveBefore: number;
  imagesUploaded: number;
  imagesReused: number;
  failed: Array<{ slug: string; reason: string }>;
  warnings: ValidationIssue[];
  rolledBack: boolean;
  ok: boolean;
}

export const defaultBatchId = (datasetVersion: number) => `${DATASET_ID}-v${datasetVersion}`;

export async function runRecipeSeed(
  recipes: SeedRecipe[],
  deps: { store: RecipeStore; storage: ImageStorage | null; datasetVersion: number },
  options: SeedOptions
): Promise<SeedReport> {
  const now = options.now ?? new Date();
  const batchId = options.batchId ?? defaultBatchId(deps.datasetVersion);
  const wantedPublic = recipes.filter((r) => r.status === 'published').map((r) => r.slug);
  const report: SeedReport = {
    mode: options.apply ? 'apply' : 'dry-run',
    batchId,
    expectedPublished: wantedPublic.length,
    imported: 0, updated: 0, unchanged: 0, published: 0, archivedLegacy: 0, legacyActiveBefore: 0,
    imagesUploaded: 0, imagesReused: 0,
    failed: [], warnings: [], rolledBack: false, ok: false,
  };

  // 1) validation — nothing touches the database if the dataset is not valid
  const issues = validateRecipes(recipes, { imageExists: imageFileExists });
  report.warnings = issues.filter((i) => i.level === 'warning');
  const errors = issues.filter((i) => i.level === 'error');
  if (errors.length) {
    report.failed = errors.map((e) => ({ slug: e.slug, reason: e.message }));
    return report;
  }

  // 2) images — uploaded before any database change; a failure here leaves production untouched
  const imageUrls = new Map<string, string>();
  if (options.apply) {
    if (!deps.storage) {
      report.failed.push({ slug: '*', reason: 'stockage des images indisponible' });
      return report;
    }
    for (const r of recipes) {
      if (!r.image) continue;
      try {
        const up = await ensureImageUploaded(deps.storage, r.image);
        imageUrls.set(r.slug, up.url);
        up.uploaded ? report.imagesUploaded++ : report.imagesReused++;
      } catch (e) {
        report.failed.push({ slug: r.slug, reason: `upload image: ${(e as Error).message}` });
      }
    }
    if (report.failed.length) return report;
  }

  // Plan (in dry-run image URLs are unknown: use a placeholder so hashes are comparable per image presence only)
  const desired = recipes.map((r) => toRecipeDocFields(r, options.apply ? imageUrls.get(r.slug) : r.image ? `/media/recipes/${r.image}` : undefined));
  const existing = await deps.store.findDataset(DATASET_ID);
  const plan = planSync(existing, desired);
  report.legacyActiveBefore = await deps.store.countLegacyActive(LEGACY_CUTOFF);
  report.imported = plan.toInsert.length;
  report.updated = plan.toUpdate.length;
  report.unchanged = plan.unchanged.length;

  if (!options.apply) {
    report.ok = true;
    return report;
  }

  try {
    // 3) stage — new recipes hidden until everything is in place
    const statusBySlug = new Map(recipes.map((r) => [r.slug, r.status]));
    for (const d of plan.toInsert) await deps.store.insert(d, 'review');
    for (const d of plan.toUpdate) await deps.store.update(d);

    // 4) publish
    report.published = await deps.store.publish(DATASET_ID, wantedPublic);
    const shouldBeHidden = recipes.filter((r) => statusBySlug.get(r.slug) === 'review').map((r) => r.slug);
    if (shouldBeHidden.length) await deps.store.hide(DATASET_ID, shouldBeHidden);

    // 5) archive legacy — only once the new catalogue is verifiably complete
    const publicNow = await deps.store.countPublishedDataset(DATASET_ID);
    if (publicNow !== wantedPublic.length) {
      throw new Error(`catalogue incomplet : ${publicNow}/${wantedPublic.length} recettes publiées, anciennes recettes conservées`);
    }
    report.archivedLegacy = await deps.store.archiveLegacy(LEGACY_CUTOFF, batchId, now);

    // 6) verify
    if ((await deps.store.countLegacyActive(LEGACY_CUTOFF)) !== 0) throw new Error('des anciennes recettes sont encore actives');
    report.ok = true;
  } catch (e) {
    report.failed.push({ slug: '*', reason: (e as Error).message });
    // keep the previous catalogue available: restore legacy, hide the dataset again
    try {
      await deps.store.restoreLegacy(batchId);
      await deps.store.hide(DATASET_ID, wantedPublic);
      report.rolledBack = true;
    } catch (rollbackError) {
      report.failed.push({ slug: '*', reason: `ÉCHEC DU ROLLBACK: ${(rollbackError as Error).message}` });
    }
  }
  return report;
}

/** Manual rollback (CLI --rollback): bring the archived legacy recipes back and hide the dataset. */
export async function rollbackRecipeSeed(
  recipes: SeedRecipe[],
  store: RecipeStore,
  batchId: string
): Promise<{ restored: number; hidden: number }> {
  const restored = await store.restoreLegacy(batchId);
  const hidden = await store.hide(DATASET_ID, recipes.map((r) => r.slug));
  return { restored, hidden };
}
