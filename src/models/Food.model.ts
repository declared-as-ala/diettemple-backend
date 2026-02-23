import mongoose, { Schema, Document } from 'mongoose';

export interface IFood extends Document {
  nameFr: string;
  synonyms: string[];
  macrosPer100g: {
    kcal: number;
    protein: number;
    carbs: number;
    fat: number;
  };
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

const FoodSchema = new Schema(
  {
    nameFr: { type: String, required: true, index: true },
    synonyms: [{ type: String }],
    macrosPer100g: {
      kcal: { type: Number, required: true },
      protein: { type: Number, required: true },
      carbs: { type: Number, required: true },
      fat: { type: Number, required: true },
    },
    tags: [{ type: String, index: true }],
  },
  { timestamps: true }
);

FoodSchema.index({ nameFr: 'text', synonyms: 'text' });

export default mongoose.model<IFood>('Food', FoodSchema);
