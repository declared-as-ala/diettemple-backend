import mongoose, { Schema, Document } from 'mongoose';

export interface IRecipeFavorite extends Document {
  userId: mongoose.Types.ObjectId;
  recipeId: mongoose.Types.ObjectId;
  createdAt: Date;
}

const RecipeFavoriteSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    recipeId: { type: Schema.Types.ObjectId, ref: 'Recipe', required: true, index: true },
  },
  { timestamps: true }
);

RecipeFavoriteSchema.index({ userId: 1, recipeId: 1 }, { unique: true });

export default mongoose.model<IRecipeFavorite>('RecipeFavorite', RecipeFavoriteSchema);
