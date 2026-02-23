import mongoose, { Schema, Document } from 'mongoose';
import { IExercise } from './Exercise.model';

export interface IProgressionRule extends Document {
  condition: 'reps_above' | 'reps_below' | 'reps_in_range';
  value: number | { min: number; max: number };
  action: 'increase_weight' | 'decrease_weight' | 'maintain_weight';
  weightChange?: number; // in kg, e.g., 2.5 for +2.5kg
  message?: string; // Coach-defined message
}

export interface ISessionExerciseConfig extends Document {
  exerciseId: mongoose.Types.ObjectId | IExercise;
  alternatives: mongoose.Types.ObjectId[] | IExercise[]; // 1-3 max alternatives
  sets: number;
  targetReps: number | { min: number; max: number };
  restTime: number; // in seconds
  recommendedStartingWeight?: number; // in kg
  progressionRules?: IProgressionRule[];
  order: number; // Order in session
  createdAt: Date;
  updatedAt: Date;
}

const ProgressionRuleSchema: Schema = new Schema(
  {
    condition: {
      type: String,
      enum: ['reps_above', 'reps_below', 'reps_in_range'],
      required: true,
    },
    value: {
      type: Schema.Types.Mixed, // Can be number or {min, max}
      required: true,
    },
    action: {
      type: String,
      enum: ['increase_weight', 'decrease_weight', 'maintain_weight'],
      required: true,
    },
    weightChange: {
      type: Number, // in kg
    },
    message: {
      type: String,
    },
  },
  { _id: false }
);

const SessionExerciseConfigSchema: Schema = new Schema(
  {
    exerciseId: {
      type: Schema.Types.ObjectId,
      ref: 'Exercise',
      required: true,
    },
    alternatives: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Exercise',
      },
    ],
    sets: {
      type: Number,
      required: true,
      min: 1,
    },
    targetReps: {
      type: Schema.Types.Mixed, // Can be number or {min, max}
      required: true,
    },
    restTime: {
      type: Number,
      required: true,
      default: 60, // in seconds
    },
    recommendedStartingWeight: {
      type: Number, // in kg
    },
    progressionRules: [ProgressionRuleSchema],
    order: {
      type: Number,
      required: true,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Validate alternatives max 3
SessionExerciseConfigSchema.pre('save', function (next) {
  if (this.alternatives && Array.isArray(this.alternatives) && this.alternatives.length > 3) {
    return next(new Error('Maximum 3 alternatives allowed per exercise'));
  }
  next();
});

export default mongoose.model<ISessionExerciseConfig>('SessionExerciseConfig', SessionExerciseConfigSchema);
