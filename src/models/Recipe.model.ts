import mongoose, { Schema, Document } from 'mongoose';

export interface IRecipeIngredient {
  name: string;
  normalizedName: string;
  quantity?: number;
  unit?: string;
}

export interface IRecipe extends Document {
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

RecipeSchema.index({ preparationTimeMinutes: 1 });
RecipeSchema.index({ mealPrepDays: 1 });
RecipeSchema.index({ 'ingredients.normalizedName': 1 });

export default mongoose.model<IRecipe>('Recipe', RecipeSchema);
