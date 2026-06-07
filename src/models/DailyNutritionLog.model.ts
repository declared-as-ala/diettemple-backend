import mongoose, { Schema, Document } from 'mongoose';

export interface ILogEntryItem {
  foodId?: mongoose.Types.ObjectId;
  name: string;
  grams: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface ILogEntry {
  entryId: mongoose.Types.ObjectId;
  source: 'scan' | 'manual';
  photoUrl?: string;
  items: ILogEntryItem[];
  createdAt: Date;
}

export interface IDailyNutritionLog extends Document {
  userId: mongoose.Types.ObjectId;
  date: Date;
  consumedCalories?: number;
  consumedMacros?: { proteinG: number; carbsG: number; fatG: number };
  waterMl?: number;
  completedMealsIds?: mongoose.Types.ObjectId[];
  notes?: string;
  status: 'incomplete' | 'complete';
  entries?: ILogEntry[];
  createdAt: Date;
  updatedAt: Date;
}

const LogEntryItemSchema = new Schema(
  {
    foodId: { type: Schema.Types.ObjectId, ref: 'Food' },
    name: { type: String, required: true },
    grams: { type: Number, required: true },
    kcal: { type: Number, required: true },
    protein: { type: Number, required: true },
    carbs: { type: Number, required: true },
    fat: { type: Number, required: true },
  },
  { _id: false }
);

const LogEntrySchema = new Schema(
  {
    entryId: { type: Schema.Types.ObjectId, required: true, default: () => new mongoose.Types.ObjectId() },
    source: { type: String, enum: ['scan', 'manual'], default: 'scan' },
    photoUrl: String,
    items: [LogEntryItemSchema],
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const DailyNutritionLogSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    date: { type: Date, required: true, index: true },
    consumedCalories: Number,
    consumedMacros: {
      proteinG: Number,
      carbsG: Number,
      fatG: Number,
    },
    waterMl: Number,
    completedMealsIds: [{ type: Schema.Types.ObjectId }],
    notes: String,
    status: {
      type: String,
      enum: ['incomplete', 'complete'],
      default: 'incomplete',
    },
    entries: [LogEntrySchema],
  },
  { timestamps: true }
);

DailyNutritionLogSchema.index({ userId: 1, date: 1 }, { unique: true });

export default mongoose.model<IDailyNutritionLog>('DailyNutritionLog', DailyNutritionLogSchema);
