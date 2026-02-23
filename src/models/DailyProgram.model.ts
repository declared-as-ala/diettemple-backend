import mongoose, { Schema, Document } from 'mongoose';
import { ISession } from './Session.model';

export interface IDailyProgram extends Document {
  date: Date;
  userId: mongoose.Types.ObjectId;
  weekNumber?: number; // 1-6
  waterTarget?: number; // in ml
  calorieTarget?: number; // in kcal
  dailyGoal?: string; // e.g., "Lose fat", "Gain muscle", "Maintain weight"
  sessionId?: mongoose.Types.ObjectId | ISession | null;
  sessionTemplateId?: mongoose.Types.ObjectId | null; // When set, /me/today uses this for todaySession
  completed?: boolean; // Whether the workout is completed
  mainObjective?: {
    title: string;
    description?: string;
    videoUrl?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const DailyProgramSchema: Schema = new Schema(
  {
    date: {
      type: Date,
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    weekNumber: {
      type: Number,
      min: 1,
      max: 6,
    },
    waterTarget: {
      type: Number, // in ml
    },
    calorieTarget: {
      type: Number, // in kcal
    },
    dailyGoal: {
      type: String,
      trim: true,
    },
    sessionId: {
      type: Schema.Types.ObjectId,
      ref: 'Session',
      default: null,
    },
    sessionTemplateId: {
      type: Schema.Types.ObjectId,
      ref: 'SessionTemplate',
      default: null,
    },
    completed: {
      type: Boolean,
      default: false,
    },
    mainObjective: {
      title: {
        type: String,
        required: true,
      },
      description: {
        type: String,
      },
      videoUrl: {
        type: String,
      },
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient queries
DailyProgramSchema.index({ userId: 1, date: 1 }, { unique: true });

export default mongoose.model<IDailyProgram>('DailyProgram', DailyProgramSchema);

