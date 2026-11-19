/**
 * Managed recipe dataset — types.
 *
 * The dataset is a VERSIONED import of the official DietTemple "nutrition projet" PowerPoint.
 * Nothing in it is invented: values are copied from the slides. Whatever the slide does not say
 * (missing macros, ambiguous quantities, inconsistencies) is recorded in `reviewFlags` instead of being "fixed".
 */

export const DATASET_ID = 'diettemple-nutrition-projet';
/** Bump when the content of the dataset changes. The seed updates changed recipes and leaves the others alone. */
export const DATASET_VERSION = 1;

/**
 * Recipes created BEFORE this instant (and not part of the dataset) are "legacy" and get archived by the import.
 * Recipes an admin creates later are never touched by the seed.
 */
export const LEGACY_CUTOFF = new Date('2026-11-21T00:00:00.000Z');

export interface SeedIngredient {
  name: string;
  quantity?: number;
  unit?: string;
}

export interface SeedRecipe {
  /** Stable identifier (kebab-case, unique within the dataset). Never change it once published. */
  slug: string;
  title: string;
  /** Where it comes from in the source document. */
  sourceRef: string;
  /** published → public catalogue; review → stored but hidden until a human completes/validates it. */
  status: 'published' | 'review';
  calories: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  fiber?: number;
  /** Source values contain "~", "≈" or ranges. */
  macrosApproximate?: boolean;
  /** Macros exactly as written on the slide. */
  nutritionOriginal?: string;
  /** Some macros are absent from the source (allowed only when explicitly flagged). */
  partialMacros?: boolean;
  servings: number;
  servingLabel: string;
  preparationTimeMinutes?: number;
  preparationTimeLabel?: string;
  ingredients: SeedIngredient[];
  instructions: string[];
  notes?: string[];
  tags: string[];
  /** File name (without extension) in ./recipeImages, or null when the source has no photo for this recipe. */
  image: string | null;
  /** Reasons a human should look at this recipe. Never shown to end users. */
  reviewFlags?: string[];
}

/** A slide that only contains a photo: kept for review, NOT published and NOT stored in the recipe collection. */
export interface ReviewCandidate {
  sourceRef: string;
  image: string;
  reason: string;
}
