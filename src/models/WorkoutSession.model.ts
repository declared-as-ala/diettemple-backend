import mongoose, { Schema, Document } from 'mongoose';
import { IExercise } from './Exercise.model';

export interface IExerciseSession extends Document {
  exerciseId: mongoose.Types.ObjectId | IExercise;
  exerciseName?: string;     // denormalized for display
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  sets: {
    setNumber: number;
    weight?: number; // in kg
    repsCompleted?: number;
    notes?: string; // Optional notes for this set
    completed?: boolean;
    completedAt?: Date;
  }[];
  totalVolumeKg?: number;   // sum of (repsCompleted * weight) across all sets
  startedAt?: Date;
  completedAt?: Date;
}

export interface IWorkoutSession extends Document {
  userId: mongoose.Types.ObjectId;
  sessionId: mongoose.Types.ObjectId; // Reference to Session template (or SessionTemplate)
  date: Date;
  workoutType?: string;
  exercises: IExerciseSession[];
  gymPhotoUrl?: string; // Optional gym check-in photo
  startedAt: Date;
  completedAt?: Date;
  durationSeconds?: number;          // total duration in seconds
  totalSessionVolumeKg?: number;     // sum of all exercise volumes
  xpGained: number;
  status: 'active' | 'completed' | 'abandoned';
  createdAt: Date;
  updatedAt: Date;
}

const ExerciseSessionSchema: Schema = new Schema(
  {
    exerciseId: {
      type: Schema.Types.ObjectId,
      ref: 'Exercise',
      required: true,
    },
    exerciseName: {
      type: String,
    },
    status: {
      type: String,
      enum: ['pending', 'in_progress', 'completed', 'skipped'],
      default: 'pending',
    },
    sets: [
      {
        setNumber: {
          type: Number,
          required: true,
        },
        weight: {
          type: Number, // in kg
        },
        repsCompleted: {
          type: Number,
        },
        notes: {
          type: String,
        },
        completed: {
          type: Boolean,
          default: false,
        },
        completedAt: {
          type: Date,
        },
      },
    ],
    totalVolumeKg: {
      type: Number,
      default: 0,
    },
    startedAt: {
      type: Date,
    },
    completedAt: {
      type: Date,
    },
  },
  { _id: false }
);

const WorkoutSessionSchema: Schema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    sessionId: {
      type: Schema.Types.ObjectId,
      ref: 'Session',
      required: true,
    },
    date: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    workoutType: {
      type: String,
    },
    exercises: [ExerciseSessionSchema],
    gymPhotoUrl: {
      type: String,
    },
    startedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    completedAt: {
      type: Date,
    },
    durationSeconds: {
      type: Number,
    },
    totalSessionVolumeKg: {
      type: Number,
      default: 0,
    },
    xpGained: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['active', 'completed', 'abandoned'],
      default: 'active',
    },
  },
  {
    timestamps: true,
  }
);

// Add indexes for efficient queries
WorkoutSessionSchema.index({ userId: 1, date: -1 });
WorkoutSessionSchema.index({ userId: 1, status: 1 });

export default mongoose.model<IWorkoutSession>('WorkoutSession', WorkoutSessionSchema);

