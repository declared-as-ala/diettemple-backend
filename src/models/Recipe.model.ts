import mongoose, { Schema, Document } from 'mongoose';

export interface IRecipe extends Document {
  title: string;
  calories: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  imageUrl?: string;
  tags: string[];
  /** upload | youtube */
  videoSource?: 'upload' | 'youtube';
  videoUrl?: string;
  /** Optional poster image for video */
  posterUrl?: string;
  /** Short ingredients list for preview */
  ingredients?: string[];
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
    tags: [{ type: String, trim: true }],
    videoSource: { type: String, enum: ['upload', 'youtube'] },
    videoUrl: { type: String },
    posterUrl: { type: String },
    ingredients: { type: [String], default: [] },
  },
  { timestamps: true }
);

export default mongoose.model<IRecipe>('Recipe', RecipeSchema);
