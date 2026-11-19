/**
 * Replaces the public recipe catalogue with the official DietTemple recipes (managed dataset).
 *
 *   npm run seed:recipes                      dry run (default): validates and prints the plan, writes nothing
 *   npm run seed:recipes -- --apply           applies: uploads photos, publishes the new recipes, archives legacy ones
 *   npm run seed:recipes -- --verify [--check-storage] [--base-url http://localhost:5000]
 *                                             checks the database, the photos in MinIO (--check-storage) and the recipes API (--base-url)
 *   npm run seed:recipes -- --rollback        restores the archived legacy recipes and hides the dataset
 *
 * Production (inside the backend container): node dist/scripts/seedRecipes.js --apply
 * Idempotent: running it twice changes nothing the second time. It never deletes a recipe, a food, a log or a user.
 */
import Recipe from '../models/Recipe.model';
import { runSeed } from './runSeed';
import { RECIPES } from '../data/recipes/recipes';
import { DATASET_ID, DATASET_VERSION, LEGACY_CUTOFF } from '../data/recipes/recipeTypes';
import { createMinioImageStorage } from '../data/recipes/recipeImages';
import { defaultBatchId, rollbackRecipeSeed, runRecipeSeed, type RecipeStore } from '../data/recipes/recipeSeed';

// Legacy = not part of the dataset, not archived yet, created before the cutoff (or without any creation date).
const legacyFilter = (cutoff: Date) => ({
  datasetId: { $exists: false },
  status: { $ne: 'archived' },
  $or: [{ createdAt: { $lt: cutoff } }, { createdAt: { $exists: false } }],
});

export const mongoRecipeStore: RecipeStore = {
  async findDataset(datasetId) {
    const rows = await Recipe.find({ datasetId }).select('slug status contentHash').lean();
    return rows.map((r: any) => ({ slug: r.slug, status: r.status, contentHash: r.contentHash }));
  },
  async insert(doc, status) {
    await Recipe.create({ ...doc, status });
  },
  async update(doc) {
    const { slug, datasetId, ...fields } = doc;
    // Content only. A published recipe stays published; an archived one coming back is staged hidden.
    await Recipe.updateOne({ datasetId, slug }, { $set: fields });
    await Recipe.updateOne({ datasetId, slug, status: 'archived' }, { $set: { status: 'review' }, $unset: { archivedAt: '', archivedBatch: '' } });
  },
  async publish(datasetId, slugs) {
    const res = await Recipe.updateMany({ datasetId, slug: { $in: slugs }, status: { $ne: 'published' } }, { $set: { status: 'published' } });
    return res.modifiedCount;
  },
  async hide(datasetId, slugs) {
    const res = await Recipe.updateMany({ datasetId, slug: { $in: slugs }, status: { $ne: 'review' } }, { $set: { status: 'review' } });
    return res.modifiedCount;
  },
  countLegacyActive: (cutoff) => Recipe.countDocuments(legacyFilter(cutoff)),
  async archiveLegacy(cutoff, batchId, now) {
    const res = await Recipe.updateMany(legacyFilter(cutoff), { $set: { status: 'archived', archivedAt: now, archivedBatch: batchId } });
    return res.modifiedCount;
  },
  async restoreLegacy(batchId) {
    const res = await Recipe.updateMany(
      { datasetId: { $exists: false }, archivedBatch: batchId },
      { $set: { status: 'published' }, $unset: { archivedAt: '', archivedBatch: '' } }
    );
    return res.modifiedCount;
  },
  countPublishedDataset: (datasetId) => Recipe.countDocuments({ datasetId, status: 'published' }),
};

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function verify(baseUrl?: string, checkStorage = false): Promise<boolean> {
  const problems: string[] = [];
  const published = RECIPES.filter((r) => r.status === 'published');
  const expectedImages = published.filter((r) => r.image).length;

  const docs: any[] = await Recipe.find({ datasetId: DATASET_ID, status: 'published' }).lean();
  if (docs.length !== published.length) problems.push(`recettes publiées en base: ${docs.length}, attendu ${published.length}`);
  const slugs = docs.map((d) => d.slug);
  if (new Set(slugs).size !== slugs.length) problems.push('slugs en double en base');
  const titles = docs.map((d) => String(d.title).toLowerCase());
  if (new Set(titles).size !== titles.length) problems.push('titres en double en base');
  const withImage = docs.filter((d) => d.imageUrl).length;
  if (withImage !== expectedImages) problems.push(`recettes avec photo: ${withImage}, attendu ${expectedImages}`);
  const legacy = await Recipe.countDocuments(legacyFilter(LEGACY_CUTOFF));
  if (legacy !== 0) problems.push(`anciennes recettes encore actives: ${legacy}`);
  const noIngredients = docs.filter((d) => !d.ingredients?.length || !d.instructions?.length).length;
  if (noIngredients) problems.push(`${noIngredients} recette(s) sans ingrédients/étapes`);
  console.log(`DB: ${docs.length} publiées, ${withImage} avec photo, ${legacy} anciennes actives.`);

  if (checkStorage) {
    // Every published photo must really exist in the media bucket (not only be referenced in the database).
    const storage = await createMinioImageStorage();
    let present = 0;
    for (const d of docs) {
      if (!d.imageUrl) continue;
      if (await storage.exists(String(d.imageUrl).replace(/^\/media\//, ''))) present++;
      else problems.push(`photo absente du stockage: ${d.imageUrl}`);
    }
    console.log(`Stockage: ${present}/${expectedImages} photos présentes.`);
  }

  if (baseUrl) {
    const base = baseUrl.replace(/\/$/, '');
    const res = await fetch(`${base}/api/recipes?limit=100`);
    if (!res.ok) problems.push(`API /api/recipes → HTTP ${res.status}`);
    else {
      const body: any = await res.json();
      const list: any[] = body.recipes || [];
      console.log(`API: ${list.length} recettes (total=${body.total}).`);
      if (body.total !== published.length || list.length !== published.length) {
        problems.push(`API: ${list.length} recettes (total ${body.total}), attendu ${published.length}`);
      }
      const apiTitles = new Set(list.map((r) => String(r.title).toLowerCase()));
      for (const r of published) if (!apiTitles.has(r.title.toLowerCase())) problems.push(`API: recette absente « ${r.title} »`);
      // Photos are served by MinIO through the reverse proxy, so they are checked over HTTP only when asked
      // (public check) — the in-container check uses --check-storage instead.
      if (process.argv.includes('--check-photos-http')) {
        let okImages = 0;
        for (const r of list) {
          if (!r.imageUrl) continue;
          const head = await fetch(`${base}${r.imageUrl}`, { method: 'HEAD' });
          const type = head.headers.get('content-type') || '';
          if (head.ok && type.startsWith('image/')) okImages++;
          else problems.push(`photo inaccessible: ${r.imageUrl} (HTTP ${head.status})`);
        }
        console.log(`Photos accessibles (HTTP): ${okImages}/${expectedImages}.`);
      }
    }
  }

  if (problems.length) {
    console.error('❌ VÉRIFICATION ÉCHOUÉE:\n - ' + problems.join('\n - '));
    return false;
  }
  console.log('✅ Vérification réussie.');
  return true;
}

async function main(): Promise<void> {
  const batchId = arg('--batch') ?? defaultBatchId(DATASET_VERSION);

  if (process.argv.includes('--verify')) {
    if (!(await verify(arg('--base-url'), process.argv.includes('--check-storage')))) process.exitCode = 1;
    return;
  }

  if (process.argv.includes('--rollback')) {
    const r = await rollbackRecipeSeed(RECIPES, mongoRecipeStore, batchId);
    console.log(`↩️  Rollback: ${r.restored} ancienne(s) recette(s) restaurée(s), ${r.hidden} recette(s) du jeu masquée(s).`);
    return;
  }

  const apply = process.argv.includes('--apply');
  const storage = apply ? await createMinioImageStorage() : null;
  const report = await runRecipeSeed(RECIPES, { store: mongoRecipeStore, storage, datasetVersion: DATASET_VERSION }, { apply, batchId });

  console.log(JSON.stringify({ ...report, warnings: report.warnings.length }, null, 2));
  for (const w of report.warnings) console.log(`  ⚠️  ${w.slug}: ${w.message}`);
  if (!report.ok) {
    console.error('❌ Import échoué :', report.failed);
    process.exitCode = 1;
  } else {
    console.log(
      `✅ ${apply ? 'Import appliqué' : 'Simulation (rien écrit)'} : ${report.imported} importée(s), ${report.updated} mise(s) à jour, ` +
        `${report.unchanged} inchangée(s), ${report.archivedLegacy} ancienne(s) archivée(s).`
    );
  }
}

if (require.main === module) {
  runSeed('recipes', main)
    .then(() => process.exit(process.exitCode ?? 0))
    .catch(() => process.exit(1));
}

