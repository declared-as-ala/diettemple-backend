import mongoose, { Schema, Document } from 'mongoose';

export interface IWeeklySummary extends Document {
  userId: mongoose.Types.ObjectId;
  levelTemplateId: mongoose.Types.ObjectId;
  planAssignmentId?: mongoose.Types.ObjectId;
  weekStart: Date;
  weekEnd: Date;
  nutritionSuccessfulDays: number;
  completedSessions: number;
  minimumSessions: number;
  maximumSessions: number;
  status: 'VALIDATED' | 'NOT_VALIDATED';
  failureReasons: string[];
  calculatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const WeeklySummarySchema: Schema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    levelTemplateId: {
      type: Schema.Types.ObjectId,
      ref: 'LevelTemplate',
      required: true,
      index: true,
    },
    planAssignmentId: {
      type: Schema.Types.ObjectId,
      ref: 'PlanAssignment',
      index: true,
    },
    weekStart: {
      type: Date,
      required: true,
      index: true,
    },
    weekEnd: {
      type: Date,
      required: true,
      index: true,
    },
    nutritionSuccessfulDays: {
      type: Number,
      required: true,
      min: 0,
      max: 7,
    },
    completedSessions: {
      type: Number,
      required: true,
      min: 0,
    },
    minimumSessions: {
      type: Number,
      required: true,
      min: 0,
    },
    maximumSessions: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ['VALIDATED', 'NOT_VALIDATED'],
      required: true,
      index: true,
    },
    failureReasons: {
      type: [String],
      default: [],
    },
    calculatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for fast queries of a user's week
WeeklySummarySchema.index({ userId: 1, weekStart: 1 }, { unique: true });

export default mongoose.model<IWeeklySummary>('WeeklySummary', WeeklySummarySchema);
