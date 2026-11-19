import mongoose, { Schema, Document } from 'mongoose';

export interface IRecipeIngredient {
  name: string;
  normalizedName: string;
  quantity?: number;
  unit?: string;
}

export type RecipeStatus = 'published' | 'review' | 'archived';

export interface IRecipe extends Document {
  /** Stable identifier of a managed (dataset) recipe, e.g. "riz-poisson-haricots-verts". Absent on legacy/admin recipes. */
  slug?: string;
  /** Managed dataset this recipe belongs to (e.g. "diettemple-nutrition-projet"). Absent on legacy/admin recipes. */
  datasetId?: string;
  datasetVersion?: number;
  /** published = visible in the public catalogue; review = imported but incomplete/inconsistent, hidden; archived = replaced, hidden but kept (favorites keep resolving). */
  status?: RecipeStatus;
  archivedAt?: Date;
  /** Id of the seed run that archived it, so a rollback can restore exactly those recipes. */
  archivedBatch?: string;
  /** Hash of the managed content: lets the seed skip unchanged recipes (idempotent, no needless writes). */
  contentHash?: string;
  /** Slide/page of the source document this recipe comes from. */
  sourceRef?: string;
  /** Step-by-step preparation. */
  instructions?: string[];
  fiber?: number;
  /** True when the source values are approximate (~, ≈) or ranges. */
  macrosApproximate?: boolean;
  /** Macros exactly as written in the source (ranges, "≈"), kept next to the numeric values. */
  nutritionOriginal?: string;
  /** What one serving is (e.g. "1 chapati garni", "Recette complète"). */
  servingLabel?: string;
  /** Free-form notes from the source (nutrition advice, variations). */
  notes?: string[];
  /** Why a recipe needs human review (missing data, inconsistencies). Never shown to end users. */
  reviewFlags?: string[];
  title: string;
  calories: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  imageUrl?: string;
  /** Multiple image URLs (first is used as primary if imageUrl not set) */
  images?: string[];
  tags: string[];
  /** upload | youtube */
  videoSource?: 'upload' | 'youtube';
  videoUrl?: string;
  /** Optional poster image for video */
  posterUrl?: string;
  /** Ingredients are stored as objects; legacy string arrays are normalized on write/read. */
  ingredients: IRecipeIngredient[];
  preparationTimeMinutes?: number | null;
  preparationTimeLabel?: string;
  mealPrepDays?: number[];
  isBatchCookingFriendly?: boolean;
  servings?: number;
  storageInstructions?: string;
  createdAt: Date;
  updatedAt: Date;
}

const RecipeSchema = new Schema(
  {
    slug: { type: String, trim: true },
    datasetId: { type: String, trim: true },
    datasetVersion: { type: Number },
    status: { type: String, enum: ['published', 'review', 'archived'], default: 'published' },
    archivedAt: { type: Date },
    archivedBatch: { type: String },
    contentHash: { type: String },
    sourceRef: { type: String },
    instructions: { type: [String], default: undefined },
    fiber: { type: Number },
    macrosApproximate: { type: Boolean },
    nutritionOriginal: { type: String },
    servingLabel: { type: String },
    notes: { type: [String], default: undefined },
    reviewFlags: { type: [String], default: undefined },
    title: { type: String, required: true, trim: true },
    calories: { type: Number, required: true },
    protein: { type: Number },
    carbs: { type: Number },
    fat: { type: Number },
    imageUrl: { type: String },
    images: { type: [String], default: [] },
    tags: [{ type: String, trim: true }],
    videoSource: { type: String, enum: ['upload', 'youtube'] },
    videoUrl: { type: String },
    posterUrl: { type: String },
    preparationTimeMinutes: { type: Number, default: null },
    preparationTimeLabel: { type: String, trim: true },
    mealPrepDays: { type: [Number], default: [] },
    isBatchCookingFriendly: { type: Boolean, default: false },
    servings: { type: Number },
    storageInstructions: { type: String, trim: true },
    ingredients: {
      type: [
        new Schema(
          {
            name: { type: String, required: true, trim: true },
            normalizedName: { type: String, required: true, trim: true },
            quantity: { type: Number },
            unit: { type: String, trim: true },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
  },
  { timestamps: true }
);

// Stable identity of managed recipes: one slug per dataset, enforced by the database (sparse: legacy recipes have none).
RecipeSchema.index({ datasetId: 1, slug: 1 }, { unique: true, partialFilterExpression: { slug: { $type: 'string' } } });
RecipeSchema.index({ status: 1 });
RecipeSchema.index({ preparationTimeMinutes: 1 });
RecipeSchema.index({ mealPrepDays: 1 });
RecipeSchema.index({ 'ingredients.normalizedName': 1 });

export default mongoose.model<IRecipe>('Recipe', RecipeSchema);
