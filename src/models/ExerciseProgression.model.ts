import mongoose, { Schema, Document } from 'mongoose';
import { IExercise } from './Exercise.model';

export interface IExerciseProgression extends Document {
  userId: mongoose.Types.ObjectId;
  exerciseId: mongoose.Types.ObjectId | IExercise;
  currentWeight: number; // in kg
  targetReps: number;
  lastCompletedAt?: Date;
  progressionHistory: {
    date: Date;
    weight: number;
    reps: number;
    sets: number;
  }[];
  createdAt: Date;
  updatedAt: Date;
}

const ExerciseProgressionSchema: Schema = new Schema(
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
    currentWeight: {
      type: Number,
      required: true,
      default: 0, // in kg
    },
    targetReps: {
      type: Number,
      default: 12,
    },
    lastCompletedAt: {
      type: Date,
    },
    progressionHistory: [
      {
        date: {
          type: Date,
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
        sets: {
          type: Number,
          required: true,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Compound index to ensure one progression per user per exercise
ExerciseProgressionSchema.index({ userId: 1, exerciseId: 1 }, { unique: true });

export default mongoose.model<IExerciseProgression>('ExerciseProgression', ExerciseProgressionSchema);






