import mongoose, { Schema, Document } from 'mongoose';
import { IExercise } from './Exercise.model';

import { ISessionExerciseConfig } from './SessionExerciseConfig.model';

export interface ISession extends Document {
  title: string;
  description?: string;
  duration?: number; // in minutes
  exercises: mongoose.Types.ObjectId[] | IExercise[]; // Legacy: simple exercise list
  exerciseConfigs?: mongoose.Types.ObjectId[] | ISessionExerciseConfig[]; // New: exercise configurations with alternatives
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  createdAt: Date;
  updatedAt: Date;
}

const SessionSchema: Schema = new Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
    },
    duration: {
      type: Number, // in minutes
    },
    exercises: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Exercise',
      },
    ],
    exerciseConfigs: [
      {
        type: Schema.Types.ObjectId,
        ref: 'SessionExerciseConfig',
      },
    ],
    difficulty: {
      type: String,
      enum: ['beginner', 'intermediate', 'advanced'],
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<ISession>('Session', SessionSchema);

