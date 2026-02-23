import mongoose, { Schema, Document } from 'mongoose';

const ProgressionRuleSchema = new Schema(
  {
    condition: { type: String, enum: ['reps_above', 'reps_below', 'reps_in_range'], required: true },
    value: { type: Schema.Types.Mixed, required: true },
    action: { type: String, enum: ['increase_weight', 'decrease_weight', 'maintain_weight'], required: true },
    weightChange: Number,
    message: String,
  },
  { _id: false }
);

const SessionOverrideItemSchema = new Schema(
  {
    exerciseId: { type: Schema.Types.ObjectId, ref: 'Exercise', required: true },
    alternatives: [{ type: Schema.Types.ObjectId, ref: 'Exercise' }],
    sets: { type: Number, required: true, min: 1 },
    targetReps: { type: Schema.Types.Mixed, required: true },
    restTimeSeconds: { type: Number, required: true, default: 60 },
    recommendedStartingWeightKg: Number,
    progressionRules: [ProgressionRuleSchema],
    order: { type: Number, default: 0 },
  },
  { _id: true }
);

export interface ISessionOverrideItem {
  exerciseId: mongoose.Types.ObjectId;
  alternatives: mongoose.Types.ObjectId[];
  sets: number;
  targetReps: number | { min: number; max: number };
  restTimeSeconds: number;
  recommendedStartingWeightKg?: number;
  progressionRules?: Array<Record<string, unknown>>;
  order: number;
}

export interface ISessionOverride extends Document {
  userId: mongoose.Types.ObjectId;
  sessionTemplateId: mongoose.Types.ObjectId;
  items: mongoose.Types.DocumentArray<ISessionOverrideItem & mongoose.Types.Subdocument>;
  createdAt: Date;
  updatedAt: Date;
}

const SessionOverrideSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    sessionTemplateId: { type: Schema.Types.ObjectId, ref: 'SessionTemplate', required: true, index: true },
    items: [SessionOverrideItemSchema],
  },
  { timestamps: true }
);

SessionOverrideSchema.index({ userId: 1, sessionTemplateId: 1 }, { unique: true });

export default mongoose.model<ISessionOverride>('SessionOverride', SessionOverrideSchema);
