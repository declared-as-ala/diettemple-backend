/**
 * Pure helpers for the recipe sync: content hashing, document mapping and the change plan.
 * Nothing here touches the database, so the logic is unit-tested without one.
 */
import crypto from 'crypto';
import { normalizeIngredientName } from '../../services/recipeFilter.service';
import { DATASET_ID, DATASET_VERSION, type SeedRecipe } from './recipeTypes';
import { atwaterGapPercent } from './recipeValidation';

/** The fields of a Recipe document that the dataset owns (what the seed writes). */
export interface RecipeDocFields {
  slug: string;
  datasetId: string;
  datasetVersion: number;
  contentHash: string;
  sourceRef: string;
  title: string;
  calories: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  fiber?: number;
  macrosApproximate: boolean;
  nutritionOriginal?: string;
  imageUrl?: string;
  images: string[];
  tags: string[];
  servings: number;
  servingLabel: string;
  preparationTimeMinutes: number | null;
  preparationTimeLabel?: string;
  ingredients: Array<{ name: string; normalizedName: string; quantity?: number; unit?: string }>;
  instructions: string[];
  notes: string[];
  reviewFlags: string[];
}

function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

export function toRecipeDocFields(r: SeedRecipe, imageUrl: string | undefined): RecipeDocFields {
  const reviewFlags = [...(r.reviewFlags || [])];
  const gap = atwaterGapPercent(r);
  if (gap !== null && gap > 15) reviewFlags.push(`Calories incohérentes avec les macros (écart ${gap} %) : valeurs de la source conservées.`);

  const base: Omit<RecipeDocFields, 'contentHash'> = {
    slug: r.slug,
    datasetId: DATASET_ID,
    datasetVersion: DATASET_VERSION,
    sourceRef: r.sourceRef,
    title: r.title.trim(),
    calories: r.calories,
    ...(r.protein !== undefined ? { protein: r.protein } : {}),
    ...(r.carbs !== undefined ? { carbs: r.carbs } : {}),
    ...(r.fat !== undefined ? { fat: r.fat } : {}),
    ...(r.fiber !== undefined ? { fiber: r.fiber } : {}),
    macrosApproximate: !!r.macrosApproximate,
    ...(r.nutritionOriginal ? { nutritionOriginal: r.nutritionOriginal } : {}),
    ...(imageUrl ? { imageUrl } : {}),
    images: imageUrl ? [imageUrl] : [],
    tags: r.tags,
    servings: r.servings,
    servingLabel: r.servingLabel,
    preparationTimeMinutes: r.preparationTimeMinutes ?? null,
    ...(r.preparationTimeLabel ? { preparationTimeLabel: r.preparationTimeLabel } : {}),
    ingredients: r.ingredients.map((i) => ({
      name: i.name.trim(),
      normalizedName: normalizeIngredientName(i.name),
      ...(i.quantity !== undefined ? { quantity: i.quantity } : {}),
      ...(i.unit ? { unit: i.unit } : {}),
    })),
    instructions: r.instructions,
    notes: r.notes || [],
    reviewFlags,
  };
  // datasetVersion is deliberately NOT part of the hash: bumping it alone must not rewrite unchanged recipes.
  const { datasetVersion: _v, ...hashed } = base;
  void _v;
  const contentHash = crypto.createHash('sha256').update(stableStringify(hashed)).digest('hex').slice(0, 24);
  return { ...base, contentHash };
}

export interface StoredRecipeRef {
  slug: string;
  status?: string;
  contentHash?: string;
}

export interface SyncPlan {
  toInsert: RecipeDocFields[];
  toUpdate: RecipeDocFields[];
  unchanged: string[];
}

/** Compares the desired documents with what the database already holds for this dataset. */
export function planSync(existing: StoredRecipeRef[], desired: RecipeDocFields[]): SyncPlan {
  const bySlug = new Map(existing.map((e) => [e.slug, e]));
  const plan: SyncPlan = { toInsert: [], toUpdate: [], unchanged: [] };
  for (const d of desired) {
    const cur = bySlug.get(d.slug);
    if (!cur) plan.toInsert.push(d);
    else if (cur.contentHash !== d.contentHash) plan.toUpdate.push(d);
    else plan.unchanged.push(d.slug);
  }
  return plan;
}
