/**
 * Validation of the managed recipe dataset. Pure (no database, no network): the seed refuses to touch production
 * when any ERROR is reported; WARNINGS are informational (they are also kept in the recipe's reviewFlags).
 */
import type { SeedRecipe } from './recipeTypes';

export interface ValidationIssue {
  slug: string;
  level: 'error' | 'warning';
  message: string;
}

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Gap between the stated calories and the calories implied by the macros (4/4/9 kcal per gram). */
export function atwaterGapPercent(r: Pick<SeedRecipe, 'calories' | 'protein' | 'carbs' | 'fat'>): number | null {
  if (!isNum(r.protein) || !isNum(r.carbs) || !isNum(r.fat) || !isNum(r.calories) || r.calories <= 0) return null;
  const implied = r.protein * 4 + r.carbs * 4 + r.fat * 9;
  return Math.round((Math.abs(implied - r.calories) / r.calories) * 1000) / 10;
}

export function validateRecipes(
  recipes: SeedRecipe[],
  opts: { imageExists: (imageName: string) => boolean }
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const err = (slug: string, message: string) => issues.push({ slug, level: 'error', message });
  const warn = (slug: string, message: string) => issues.push({ slug, level: 'warning', message });

  const seenSlug = new Set<string>();
  const seenTitle = new Map<string, string>();

  for (const r of recipes) {
    const s = r.slug || '(sans slug)';
    if (!r.slug || !SLUG_RE.test(r.slug)) err(s, 'slug invalide (kebab-case attendu)');
    if (seenSlug.has(r.slug)) err(s, 'slug en double');
    seenSlug.add(r.slug);

    const title = (r.title || '').trim();
    if (!title) err(s, 'titre manquant');
    const key = title.toLowerCase();
    if (title && seenTitle.has(key)) err(s, `titre en double avec « ${seenTitle.get(key)} »`);
    if (title) seenTitle.set(key, r.slug);

    if (!r.sourceRef) err(s, 'sourceRef manquant');
    if (!['published', 'review'].includes(r.status)) err(s, `statut invalide: ${r.status}`);

    if (!isNum(r.calories) || r.calories <= 0 || r.calories > 5000) err(s, `calories invalides: ${r.calories}`);
    for (const k of ['protein', 'carbs', 'fat', 'fiber'] as const) {
      const v = r[k];
      if (v !== undefined && (!isNum(v) || v < 0 || v > 1000)) err(s, `${k} invalide: ${v}`);
    }
    if (r.status === 'published') {
      const missing = (['protein', 'carbs', 'fat'] as const).filter((k) => r[k] === undefined);
      if (missing.length && !r.partialMacros) err(s, `macros manquantes (${missing.join(', ')}) sans partialMacros`);
      if (missing.length && r.partialMacros && !(r.reviewFlags && r.reviewFlags.length)) {
        err(s, 'macros partielles sans reviewFlags expliquant ce qui manque');
      }
      if (r.ingredients.length === 0) err(s, 'aucun ingrédient');
      if (r.instructions.length === 0) err(s, 'aucune étape de préparation');
    }
    if (r.status === 'review' && !(r.reviewFlags && r.reviewFlags.length)) err(s, 'recette en revue sans reviewFlags');

    if (!isNum(r.servings) || r.servings < 1) err(s, 'servings invalide');
    if (!r.servingLabel) err(s, 'servingLabel manquant');
    if (r.preparationTimeMinutes !== undefined && (!isNum(r.preparationTimeMinutes) || r.preparationTimeMinutes <= 0)) {
      err(s, 'temps de préparation invalide');
    }
    for (const i of r.ingredients) {
      if (!i.name || !i.name.trim()) err(s, 'ingrédient sans nom');
      if (i.quantity !== undefined && (!isNum(i.quantity) || i.quantity <= 0)) err(s, `quantité invalide pour « ${i.name} »`);
    }

    if (r.image === null) {
      if (r.status === 'published') warn(s, 'recette publiée sans photo (aucune photo dans la source)');
    } else if (!opts.imageExists(r.image)) {
      err(s, `image introuvable: ${r.image}`);
    }

    const gap = atwaterGapPercent(r);
    if (gap !== null && gap > 15) warn(s, `calories incohérentes avec les macros (écart ${gap} %)`);
    if (isNum(r.fiber) && isNum(r.carbs) && r.fiber > r.carbs) warn(s, 'fibres supérieures aux glucides');
  }
  return issues;
}
