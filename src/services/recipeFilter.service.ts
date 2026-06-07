import type { IRecipeIngredient } from '../models/Recipe.model';

export type IngredientMatchMode = 'all' | 'partial';

export interface RecipeFilterParams {
  maxPreparationTime?: number;
  mealPrepDays?: number;
  ingredients?: string[];
  matchMode?: IngredientMatchMode;
  page?: number;
  limit?: number;
}

export interface IngredientMatchInfo {
  availableCount: number;
  totalRequired: number;
  missingCount: number;
  missingIngredients: string[];
  matchPercentage: number;
}

export function normalizeIngredientName(name: string): string {
  return name
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b(oeufs|oeuf)\b/g, 'oeuf')
    .replace(/\b(tomates|tomate)\b/g, 'tomate')
    .replace(/\b(legumes|legume)\b/g, 'legume')
    .replace(/\b(pommes?)\b/g, 'pomme')
    .replace(/\b(bananes?)\b/g, 'banane');
}

export function calculateIngredientMatch(
  recipeIngredients: IRecipeIngredient[],
  userIngredients: string[]
): IngredientMatchInfo {
  const available = new Set(userIngredients.map(normalizeIngredientName).filter(Boolean));
  const required = recipeIngredients
    .map((ing) => normalizeIngredientName(ing.normalizedName || ing.name || ''))
    .filter(Boolean);
  const uniqueRequired = Array.from(new Set(required));
  const present = uniqueRequired.filter((ing) => available.has(ing));
  const missing = uniqueRequired.filter((ing) => !available.has(ing));
  const totalRequired = uniqueRequired.length;
  const availableCount = present.length;
  const missingCount = missing.length;
  const matchPercentage = totalRequired > 0 ? Math.round((availableCount / totalRequired) * 100) : 0;
  return {
    availableCount,
    totalRequired,
    missingCount,
    missingIngredients: missing,
    matchPercentage,
  };
}

export function buildRecipeQuery(filters: RecipeFilterParams): Record<string, unknown> {
  const query: Record<string, unknown> = {};
  if (filters.maxPreparationTime != null && Number.isFinite(filters.maxPreparationTime)) {
    query.preparationTimeMinutes = { $lte: filters.maxPreparationTime };
  }
  if (filters.mealPrepDays != null && Number.isFinite(filters.mealPrepDays)) {
    query.mealPrepDays = filters.mealPrepDays;
  }
  return query;
}

