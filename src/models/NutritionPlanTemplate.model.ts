import mongoose, { Schema, Document } from 'mongoose';

const MealItemTemplateSchema = new Schema(
  {
    name: { type: String, required: true },
    calories: { type: Number, required: true },
    proteinG: { type: Number },
    carbsG: { type: Number },
    fatG: { type: Number },
    notes: { type: String },
  },
  { _id: true }
);

const MealTemplateSchema = new Schema(
  {
    title: { type: String, required: true },
    targetCalories: { type: Number, required: true },
    items: [MealItemTemplateSchema],
  },
  { _id: true }
);

export interface IMealItemTemplate {
  name: string;
  calories: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  notes?: string;
}

export interface IMealTemplate {
  title: string;
  targetCalories: number;
  items: IMealItemTemplate[];
}

export interface INutritionPlanTemplate extends Document {
  name: string;
  description?: string;
  goalType: 'lose_weight' | 'maintain' | 'gain_muscle';
  dailyCalories: number;
  macros: { proteinG: number; carbsG: number; fatG: number };
  mealsTemplate: IMealTemplate[];
  recommendations?: string[];
  createdAt: Date;
  updatedAt: Date;
}

const NutritionPlanTemplateSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String },
    goalType: {
      type: String,
      enum: ['lose_weight', 'maintain', 'gain_muscle'],
      required: true,
    },
    dailyCalories: { type: Number, required: true },
    macros: {
      proteinG: { type: Number, required: true },
      carbsG: { type: Number, required: true },
      fatG: { type: Number, required: true },
    },
    mealsTemplate: [MealTemplateSchema],
    recommendations: [String],
  },
  { timestamps: true }
);

export default mongoose.model<INutritionPlanTemplate>('NutritionPlanTemplate', NutritionPlanTemplateSchema);
