import mongoose, { Schema, Document } from 'mongoose';

export interface IWeeklySummary extends Document {
  userId: mongoose.Types.ObjectId;
  levelTemplateId: mongoose.Types.ObjectId;
  planAssignmentId?: mongoose.Types.ObjectId;
  /** Relative-cycle week number (1-indexed), when this summary was computed by WeeklyProgressService. */
  weekNumber?: number;
  weekStart: Date;
  weekEnd: Date;
  nutritionSuccessfulDays: number;
  completedSessions: number;
  minimumSessions: number;
  maximumSessions: number;
  status: 'VALIDATED' | 'NOT_VALIDATED';
  /** Granular training-only status from WeeklyProgressService (PASSED/PASSED_LATE/FAILED/REST_WEEK/...). */
  trainingStatus?: 'UPCOMING' | 'IN_PROGRESS' | 'CATCH_UP' | 'PASSED' | 'PASSED_LATE' | 'FAILED' | 'REST_WEEK';
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
    weekNumber: {
      type: Number,
      min: 1,
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
    trainingStatus: {
      type: String,
      enum: ['UPCOMING', 'IN_PROGRESS', 'CATCH_UP', 'PASSED', 'PASSED_LATE', 'FAILED', 'REST_WEEK'],
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
