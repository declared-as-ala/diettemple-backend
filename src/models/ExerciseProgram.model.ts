import mongoose, { Schema, Document } from 'mongoose';
import { IExercise } from './Exercise.model';

export interface IExerciseProgram extends Document {
  exerciseId: mongoose.Types.ObjectId | IExercise;
  targetSets: number;
  targetReps: number | { min: number; max: number }; // Can be single number or range
  baseWeight: number; // Initial weight in kg
  restSeconds: number;
  createdAt: Date;
  updatedAt: Date;
}

const ExerciseProgramSchema: Schema = new Schema(
  {
    exerciseId: {
      type: Schema.Types.ObjectId,
      ref: 'Exercise',
      required: true,
      index: true,
    },
    targetSets: {
      type: Number,
      required: true,
      min: 1,
    },
    targetReps: {
      type: Schema.Types.Mixed, // Can be number or {min, max}
      required: true,
    },
    baseWeight: {
      type: Number,
      required: true,
      min: 0,
    },
    restSeconds: {
      type: Number,
      default: 60,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index
ExerciseProgramSchema.index({ exerciseId: 1 }, { unique: true });

export default mongoose.model<IExerciseProgram>('ExerciseProgram', ExerciseProgramSchema);






