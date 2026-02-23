import mongoose, { Schema, Document } from 'mongoose';

export interface IUserNutritionPlan extends Document {
  userId: mongoose.Types.ObjectId;
  nutritionPlanTemplateId: mongoose.Types.ObjectId;
  startAt: Date;
  endAt: Date;
  status: 'ACTIVE' | 'EXPIRED' | 'PAUSED';
  adjustments?: {
    dailyCalories?: number;
    proteinG?: number;
    carbsG?: number;
    fatG?: number;
    notes?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const UserNutritionPlanSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    nutritionPlanTemplateId: { type: Schema.Types.ObjectId, ref: 'NutritionPlanTemplate', required: true },
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
    status: {
      type: String,
      enum: ['ACTIVE', 'EXPIRED', 'PAUSED'],
      default: 'ACTIVE',
      index: true,
    },
    adjustments: {
      dailyCalories: Number,
      proteinG: Number,
      carbsG: Number,
      fatG: Number,
      notes: String,
    },
  },
  { timestamps: true }
);

UserNutritionPlanSchema.index({ userId: 1, status: 1 });

export default mongoose.model<IUserNutritionPlan>('UserNutritionPlan', UserNutritionPlanSchema);
