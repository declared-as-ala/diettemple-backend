import mongoose, { Schema, Document } from 'mongoose';
import { IExercise } from './Exercise.model';

export interface ISetLog {
  setNumber: number;
  weight: number; // in kg
  reps: number;
  completed: boolean;
  completedAt: Date;
}

export interface IExerciseHistory extends Document {
  userId: mongoose.Types.ObjectId;
  exerciseId: mongoose.Types.ObjectId | IExercise;
  lastWeight: number; // Last weight used in kg
  lastReps: number[]; // Array of reps for each set [12, 11, 10, 9]
  lastSets: ISetLog[]; // Full set logs from last session
  lastCompletedAt?: Date;
  recommendedNextWeight?: number; // Coach recommendation
  progressionStatus: 'stable' | 'eligible' | 'failed'; // Progression eligibility
  totalVolume?: number; // Total kg × reps
  createdAt: Date;
  updatedAt: Date;
}

const SetLogSchema: Schema = new Schema(
  {
    setNumber: {
      type: Number,
      required: true,
    },
    weight: {
      type: Number,
      required: true,
    },
    reps: {
      type: Number,
      required: true,
    },
    completed: {
      type: Boolean,
      default: true,
    },
    completedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const ExerciseHistorySchema: Schema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    exerciseId: {
      type: Schema.Types.ObjectId,
      ref: 'Exercise',
      required: true,
      index: true,
    },
    lastWeight: {
      type: Number,
      required: true,
      default: 0,
    },
    lastReps: {
      type: [Number],
      default: [],
    },
    lastSets: {
      type: [SetLogSchema],
      default: [],
    },
    lastCompletedAt: {
      type: Date,
    },
    recommendedNextWeight: {
      type: Number,
    },
    progressionStatus: {
      type: String,
      enum: ['stable', 'eligible', 'failed'],
      default: 'stable',
    },
    totalVolume: {
      type: Number,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to ensure one history per user per exercise
ExerciseHistorySchema.index({ userId: 1, exerciseId: 1 }, { unique: true });

export default mongoose.model<IExerciseHistory>('ExerciseHistory', ExerciseHistorySchema);






