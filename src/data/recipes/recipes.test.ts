import fs from 'fs';
import path from 'path';
import { RECIPES, REVIEW_CANDIDATES } from './recipes';
import { DATASET_ID, DATASET_VERSION, LEGACY_CUTOFF, type SeedRecipe } from './recipeTypes';
import { atwaterGapPercent, validateRecipes } from './recipeValidation';
import { planSync, toRecipeDocFields, type RecipeDocFields } from './recipeSync';
import { imageFileExists, type ImageStorage } from './recipeImages';
import { rollbackRecipeSeed, runRecipeSeed, type RecipeStore } from './recipeSeed';

const bySlug = (slug: string) => RECIPES.find((r) => r.slug === slug)!;

// ───────────────────────── in-memory stand-ins (no database, no MinIO) ─────────────────────────
type Doc = {
  id: string; title: string; createdAt: Date; status?: string;
  slug?: string; datasetId?: string; contentHash?: string; archivedBatch?: string; fields?: RecipeDocFields;
};

function fakeStore(initial: Doc[], opts: { publishFails?: boolean; publishShort?: boolean } = {}): RecipeStore & { docs: Doc[]; writes: number } {
  const docs = [...initial];
  const s = {
    docs, writes: 0,
    async findDataset(datasetId: string) {
      return docs.filter((d) => d.datasetId === datasetId).map((d) => ({ slug: d.slug!, status: d.status, contentHash: d.contentHash }));
    },
    async insert(doc: RecipeDocFields, status: 'review' | 'published') {
      s.writes++;
      docs.push({ id: `n-${doc.slug}`, title: doc.title, createdAt: new Date(), status, slug: doc.slug, datasetId: doc.datasetId, contentHash: doc.contentHash, fields: doc });
    },
    async update(doc: RecipeDocFields) {
      s.writes++;
      const d = docs.find((x) => x.datasetId === doc.datasetId && x.slug === doc.slug)!;
      d.contentHash = doc.contentHash; d.fields = doc; d.title = doc.title;
      if (d.status === 'archived') d.status = 'review';
    },
    async publish(datasetId: string, slugs: string[]) {
      if (opts.publishFails) throw new Error('boom publish');
      let n = 0;
      for (const d of docs) {
        if (d.datasetId === datasetId && slugs.includes(d.slug!) && d.status !== 'published') {
          if (opts.publishShort && n >= slugs.length - 1) continue; // simulate a partial publish
          d.status = 'published'; n++; s.writes++;
        }
      }
      return n;
    },
    async hide(datasetId: string, slugs: string[]) {
      let n = 0;
      for (const d of docs) if (d.datasetId === datasetId && slugs.includes(d.slug!) && d.status !== 'review') { d.status = 'review'; n++; s.writes++; }
      return n;
    },
    async countLegacyActive(cutoff: Date) {
      return docs.filter((d) => !d.datasetId && d.status !== 'archived' && d.createdAt < cutoff).length;
    },
    async archiveLegacy(cutoff: Date, batchId: string) {
      let n = 0;
      for (const d of docs) if (!d.datasetId && d.status !== 'archived' && d.createdAt < cutoff) { d.status = 'archived'; d.archivedBatch = batchId; n++; s.writes++; }
      return n;
    },
    async restoreLegacy(batchId: string) {
      let n = 0;
      for (const d of docs) if (!d.datasetId && d.archivedBatch === batchId) { d.status = 'published'; delete d.archivedBatch; n++; }
      return n;
    },
    async countPublishedDataset(datasetId: string) {
      return docs.filter((d) => d.datasetId === datasetId && d.status === 'published').length;
    },
  };
  return s;
}

function fakeStorage(failOn?: string): ImageStorage & { objects: Map<string, number>; puts: number } {
  const objects = new Map<string, number>();
  const st = {
    objects, puts: 0,
    async exists(key: string) { return objects.has(key); },
    async put(key: string, data: Buffer) {
      if (failOn && key.includes(failOn)) throw new Error('minio down');
      st.puts++; objects.set(key, data.length);
    },
  };
  return st;
}

const legacy = (id: string, createdAt = '2025-01-01T00:00:00Z'): Doc => ({ id, title: `Ancienne ${id}`, createdAt: new Date(createdAt) });
const run = (store: RecipeStore, storage: ImageStorage | null, apply: boolean, recipes = RECIPES) =>
  runRecipeSeed(recipes, { store, storage, datasetVersion: DATASET_VERSION }, { apply });

// ───────────────────────── the dataset itself ─────────────────────────
describe('official recipe dataset (nutrition projet.pptx)', () => {
  it('is valid: no validation error', () => {
    const errors = validateRecipes(RECIPES, { imageExists: imageFileExists }).filter((i) => i.level === 'error');
    expect(errors).toEqual([]);
  });

  it('covers the 26 slides: 23 published + 1 under review + 2 photo-only candidates', () => {
    expect(RECIPES.filter((r) => r.status === 'published')).toHaveLength(23);
    expect(RECIPES.filter((r) => r.status === 'review')).toHaveLength(1);
    expect(REVIEW_CANDIDATES).toHaveLength(2);
    expect(23 + 1 + 2).toBe(26);
  });

  it('every slide number is accounted for exactly once', () => {
    const slides = [...RECIPES.map((r) => r.sourceRef), ...REVIEW_CANDIDATES.map((c) => c.sourceRef)].map((s) => Number(s.replace(/\D/g, '')));
    expect([...slides].sort((a, b) => a - b)).toEqual(Array.from({ length: 26 }, (_, i) => i + 1));
  });

  it('has stable unique slugs and no duplicate titles', () => {
    expect(new Set(RECIPES.map((r) => r.slug)).size).toBe(RECIPES.length);
    expect(new Set(RECIPES.map((r) => r.title.toLowerCase())).size).toBe(RECIPES.length);
  });

  it('keeps the slide values exactly as written (spot checks)', () => {
    const r1 = bySlug('riz-poisson-haricots-verts');
    expect([r1.calories, r1.protein, r1.carbs, r1.fat]).toEqual([720, 62, 58, 24]);
    const r21 = bySlug('chapatis-riches-en-proteines');
    expect([r21.calories, r21.protein, r21.carbs, r21.fat, r21.servings]).toEqual([260, 27, 26, 3.5, 8]);
    expect(bySlug('cotelette-de-veau-sauce-champignons-salades').calories).toBe(1120);
    const sauce = bySlug('sauce-fromage');
    expect([sauce.calories, sauce.protein, sauce.carbs, sauce.fat, sauce.fiber]).toEqual([430, 20, 14, 34, 0.3]);
    expect(sauce.notes!.join(' ')).toMatch(/22 kcal/);
    expect(bySlug('houria-poisson-brocoli-riz').calories).toBe(617);
    expect(bySlug('tajine-riche-en-proteines').calories).toBe(520);
  });

  it('pizza: per-serving values only, carbs/fat are NOT invented', () => {
    const pizza = bySlug('pizza-ble-dur-complet');
    expect(pizza.servings).toBe(2);
    expect(pizza.calories).toBe(800);
    expect(pizza.carbs).toBeUndefined();
    expect(pizza.fat).toBeUndefined();
    expect(pizza.partialMacros).toBe(true);
    expect(pizza.reviewFlags!.join(' ')).toMatch(/Glucides et lipides non fournis/);
  });

  it('only the cheese sauce is published without a photo (the slide has none)', () => {
    const noPhoto = RECIPES.filter((r) => r.status === 'published' && !r.image).map((r) => r.slug);
    expect(noPhoto).toEqual(['sauce-fromage']);
  });

  it('the pancake slide is held back for review (whey quantity inconsistent with its macros)', () => {
    const p = bySlug('petit-dejeuner-pancake');
    expect(p.status).toBe('review');
    expect(p.reviewFlags!.join(' ')).toMatch(/whey/i);
  });

  it('flags source inconsistencies instead of silently fixing them', () => {
    expect(bySlug('saumon-grille-pomme-de-terre-champignons-epinards').reviewFlags!.join(' ')).toMatch(/fromage fondu/);
    expect(bySlug('poisson-blanc-chakchouka-salade-de-betterave').reviewFlags!.join(' ')).toMatch(/piment/i);
    expect(atwaterGapPercent(bySlug('riz-poisson-haricots-verts'))).toBeLessThan(15);
  });

  it('ranges are stored as the middle value with the original text preserved', () => {
    const k = bySlug('kafteji-blanc-de-poulet-grille');
    expect(k.protein).toBe(70);
    expect(k.nutritionOriginal).toMatch(/68–72/);
    expect(k.macrosApproximate).toBe(true);
  });
});

describe('validation', () => {
  const ok = (): SeedRecipe => ({ ...bySlug('tajine-de-poulet') });
  const errs = (rs: SeedRecipe[]) => validateRecipes(rs, { imageExists: () => true }).filter((i) => i.level === 'error').map((i) => i.message);

  it('rejects duplicate slugs and titles', () => {
    const a = ok();
    const b = { ...ok() };
    expect(errs([a, b]).join('|')).toMatch(/slug en double/);
    expect(errs([a, b]).join('|')).toMatch(/titre en double/);
  });
  it('rejects missing macros unless explicitly flagged as partial', () => {
    const r = { ...ok(), carbs: undefined };
    expect(errs([r]).join('|')).toMatch(/macros manquantes/);
    expect(errs([{ ...r, partialMacros: true, reviewFlags: ['x'] }])).toEqual([]);
    expect(errs([{ ...r, partialMacros: true, reviewFlags: [] }]).join('|')).toMatch(/reviewFlags/);
  });
  it('rejects invalid numbers, empty steps and missing images', () => {
    expect(errs([{ ...ok(), calories: -5 }]).join('|')).toMatch(/calories/);
    expect(errs([{ ...ok(), instructions: [] }]).join('|')).toMatch(/étape/);
    expect(errs([{ ...ok(), slug: 'Bad Slug' }]).join('|')).toMatch(/slug invalide/);
    expect(validateRecipes([ok()], { imageExists: () => false }).some((i) => i.message.startsWith('image introuvable'))).toBe(true);
  });
});

// ───────────────────────── the replacement procedure ─────────────────────────
describe('catalogue replacement', () => {
  it('dry run writes nothing (no DB write, no upload)', async () => {
    const store = fakeStore([legacy('a'), legacy('b')]);
    const storage = fakeStorage();
    const rep = await run(store, storage, false);
    expect(rep.ok).toBe(true);
    expect(rep.mode).toBe('dry-run');
    expect(rep.imported).toBe(RECIPES.length);
    expect(store.writes).toBe(0);
    expect(storage.puts).toBe(0);
    expect(store.docs.every((d) => d.status !== 'archived')).toBe(true);
  });

  it('applies: publishes the dataset and archives (never deletes) the legacy recipes', async () => {
    const store = fakeStore([legacy('a'), legacy('b'), legacy('c')]);
    const storage = fakeStorage();
    const rep = await run(store, storage, true);
    expect(rep.ok).toBe(true);
    expect(rep.imported).toBe(24);
    expect(rep.published).toBe(23);
    expect(rep.archivedLegacy).toBe(3);
    expect(rep.imagesUploaded).toBe(23); // 22 published photos + the pancake photo
    const published = store.docs.filter((d) => d.status === 'published');
    expect(published).toHaveLength(23);
    expect(published.every((d) => d.datasetId === DATASET_ID)).toBe(true);
    expect(store.docs.find((d) => d.slug === 'petit-dejeuner-pancake')!.status).toBe('review');
    // nothing was removed: the 3 legacy recipes are still there, archived
    expect(store.docs.filter((d) => !d.datasetId && d.status === 'archived')).toHaveLength(3);
    expect(store.docs).toHaveLength(3 + 24);
    // images are stored with persistent /media URLs, never external links
    for (const d of published.filter((x) => x.slug !== 'sauce-fromage')) expect(d.fields!.imageUrl).toMatch(/^\/media\/recipes\/.+-[0-9a-f]{10}\.jpg$/);
  });

  it('is idempotent: a second run changes nothing and uploads nothing', async () => {
    const store = fakeStore([legacy('a')]);
    const storage = fakeStorage();
    await run(store, storage, true);
    const writesAfterFirst = store.writes;
    const putsAfterFirst = storage.puts;
    const snapshot = JSON.stringify(store.docs);
    const rep2 = await run(store, storage, true);
    expect(rep2.ok).toBe(true);
    expect([rep2.imported, rep2.updated, rep2.published, rep2.archivedLegacy]).toEqual([0, 0, 0, 0]);
    expect(rep2.unchanged).toBe(24);
    expect(rep2.imagesUploaded).toBe(0);
    expect(rep2.imagesReused).toBe(23);
    expect(store.writes).toBe(writesAfterFirst);
    expect(storage.puts).toBe(putsAfterFirst);
    expect(JSON.stringify(store.docs)).toBe(snapshot);
  });

  it('only touches legacy recipes created before the cutoff (a later admin recipe survives every run)', async () => {
    const later = legacy('admin-new', new Date(LEGACY_CUTOFF.getTime() + 86_400_000).toISOString());
    const store = fakeStore([legacy('old'), later]);
    await run(store, fakeStorage(), true);
    await run(store, fakeStorage(), true);
    expect(store.docs.find((d) => d.id === 'admin-new')!.status).toBeUndefined();
    expect(store.docs.find((d) => d.id === 'old')!.status).toBe('archived');
  });

  it('updates only the recipe whose content changed', async () => {
    const store = fakeStore([]);
    const storage = fakeStorage();
    await run(store, storage, true);
    const changed = RECIPES.map((r) => (r.slug === 'tajine-de-poulet' ? { ...r, calories: 660 } : r));
    const rep = await run(store, storage, true, changed);
    expect(rep.updated).toBe(1);
    expect(rep.imported).toBe(0);
    expect(rep.unchanged).toBe(23);
    expect(store.docs.find((d) => d.slug === 'tajine-de-poulet')!.fields!.calories).toBe(660);
  });

  it('INVALID dataset: stops before any database write or upload (previous catalogue untouched)', async () => {
    const store = fakeStore([legacy('a')]);
    const storage = fakeStorage();
    const broken = RECIPES.map((r, i) => (i === 0 ? { ...r, calories: -1 } : r));
    const rep = await run(store, storage, true, broken);
    expect(rep.ok).toBe(false);
    expect(rep.failed.length).toBeGreaterThan(0);
    expect(store.writes).toBe(0);
    expect(storage.puts).toBe(0);
    expect(store.docs[0].status).toBeUndefined(); // legacy still visible
  });

  it('IMAGE upload failure: stops before touching the database', async () => {
    const store = fakeStore([legacy('a')]);
    const rep = await run(store, fakeStorage('tajine-de-poulet'), true);
    expect(rep.ok).toBe(false);
    expect(rep.failed.some((f) => f.slug === 'tajine-de-poulet')).toBe(true);
    expect(store.writes).toBe(0);
    expect(store.docs).toHaveLength(1);
    expect(store.docs[0].status).toBeUndefined();
  });

  it('PUBLISH failure: rolls back, the legacy catalogue is still available', async () => {
    const store = fakeStore([legacy('a'), legacy('b')], { publishFails: true });
    const rep = await run(store, fakeStorage(), true);
    expect(rep.ok).toBe(false);
    expect(rep.rolledBack).toBe(true);
    expect(store.docs.filter((d) => !d.datasetId && d.status !== 'archived')).toHaveLength(2);
    expect(store.docs.filter((d) => d.datasetId && d.status === 'published')).toHaveLength(0);
  });

  it('INCOMPLETE publish: legacy recipes are NOT archived and the run fails', async () => {
    const store = fakeStore([legacy('a')], { publishShort: true });
    const rep = await run(store, fakeStorage(), true);
    expect(rep.ok).toBe(false);
    expect(rep.archivedLegacy).toBe(0);
    expect(store.docs.find((d) => d.id === 'a')!.status).not.toBe('archived');
  });

  it('manual rollback restores the archived legacy recipes and hides the dataset', async () => {
    const store = fakeStore([legacy('a'), legacy('b')]);
    await run(store, fakeStorage(), true);
    const res = await rollbackRecipeSeed(RECIPES, store, `${DATASET_ID}-v${DATASET_VERSION}`);
    expect(res.restored).toBe(2);
    expect(store.docs.filter((d) => !d.datasetId && d.status === 'published')).toHaveLength(2);
    expect(store.docs.filter((d) => d.datasetId && d.status === 'published')).toHaveLength(0);
  });
});

describe('sync plan', () => {
  it('hash is stable and ignores the dataset version', () => {
    const a = toRecipeDocFields(RECIPES[0], '/media/recipes/x.jpg');
    const b = toRecipeDocFields(RECIPES[0], '/media/recipes/x.jpg');
    expect(a.contentHash).toBe(b.contentHash);
    expect(toRecipeDocFields(RECIPES[0], '/media/recipes/y.jpg').contentHash).not.toBe(a.contentHash);
    expect(planSync([{ slug: a.slug, contentHash: a.contentHash }], [a]).unchanged).toEqual([a.slug]);
  });
  it('normalises ingredient names for the existing ingredient search', () => {
    const d = toRecipeDocFields(bySlug('riz-omelette-carottes-brocoli'), undefined);
    expect(d.ingredients.find((i) => i.name === 'Œufs')!.normalizedName).toBe('oeuf');
  });
});

describe('manifest (used by the production verification gate)', () => {
  it('always matches the dataset, so the CI gate can never drift from the data', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'));
    const published = RECIPES.filter((r) => r.status === 'published');
    expect(manifest.datasetId).toBe(DATASET_ID);
    expect(manifest.datasetVersion).toBe(DATASET_VERSION);
    expect(manifest.publishedCount).toBe(published.length);
    expect(manifest.withImageCount).toBe(published.filter((r) => r.image).length);
    expect(manifest.publishedTitles).toEqual(published.map((r) => r.title));
  });
});
