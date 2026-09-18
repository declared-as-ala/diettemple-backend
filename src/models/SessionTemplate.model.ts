import mongoose, { Schema, Document } from 'mongoose';

// Embedded progression rule (no _id)
const ProgressionRuleSchema = new Schema(
  {
    condition: {
      type: String,
      enum: ['reps_above', 'reps_below', 'reps_in_range'],
      required: true,
    },
    value: { type: Schema.Types.Mixed, required: true },
    action: {
      type: String,
      enum: ['increase_weight', 'decrease_weight', 'maintain_weight'],
      required: true,
    },
    weightChange: { type: Number },
    message: { type: String },
  },
  { _id: false }
);

// Embedded session exercise config (order by array position)
const SessionTemplateItemSchema = new Schema(
  {
    exerciseId: {
      type: Schema.Types.ObjectId,
      ref: 'Exercise',
      required: true,
    },
    alternatives: [{ type: Schema.Types.ObjectId, ref: 'Exercise' }],
    sets: { type: Number, required: true, min: 1 },
    targetReps: { type: Schema.Types.Mixed, required: true },
    recommendedStartingWeightKg: { type: Number },
    progressionRules: [ProgressionRuleSchema],
    instruction: { type: String, trim: true },
    message: { type: String, trim: true },
    notes: { type: String, trim: true },
    clientInstruction: { type: String, trim: true },
    order: { type: Number, default: 0 },
  },
  { _id: true }
);

const WarmupItemSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    durationSeconds: { type: Number, min: 0 },
    reps: { type: Number, min: 0 },
    notes: { type: String },
    order: { type: Number, default: 0 },
  },
  { _id: true }
);

const WarmupSchema = new Schema(
  {
    title: { type: String, trim: true, default: 'Échauffement' },
    notes: { type: String },
    items: [WarmupItemSchema],
  },
  { _id: false }
);

SessionTemplateItemSchema.pre('save', function (next) {
  if (this.alternatives && this.alternatives.length > 3) {
    return next(new Error('Maximum 3 alternatives per exercise'));
  }
  next();
});

export interface ISessionTemplateItem {
  exerciseId: mongoose.Types.ObjectId;
  alternatives: mongoose.Types.ObjectId[];
  sets: number;
  targetReps: number | { min: number; max: number };
  recommendedStartingWeightKg?: number;
  progressionRules?: Array<{
    condition: string;
    value: number | { min: number; max: number };
    action: string;
    weightChange?: number;
    message?: string;
  }>;
  instruction?: string;
  message?: string;
  notes?: string;
  clientInstruction?: string;
  order: number;
}

export interface ISessionTemplate extends Document {
  title: string;
  internalName?: string;
  displayName?: string;
  folderId?: mongoose.Types.ObjectId;
  description?: string;
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  durationMinutes?: number;
  items: mongoose.Types.DocumentArray<ISessionTemplateItem & mongoose.Types.Subdocument>;
  tags?: string[];
  warmup?: {
    title?: string;
    notes?: string;
    items: Array<{
      title: string;
      durationSeconds?: number;
      reps?: number;
      notes?: string;
      order?: number;
    }>;
  };
  createdAt: Date;
  updatedAt: Date;
}

const SessionTemplateSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, index: true },
    internalName: { type: String, trim: true, index: true },
    displayName: { type: String, trim: true, index: true },
    folderId: { type: Schema.Types.ObjectId, ref: 'Folder', default: null, index: true },
    description: { type: String },
    difficulty: {
      type: String,
      enum: ['beginner', 'intermediate', 'advanced'],
    },
    durationMinutes: { type: Number, min: 0 },
    items: [SessionTemplateItemSchema],
    tags: [{ type: String, trim: true }],
    warmup: { type: WarmupSchema, default: undefined },
  },
  { timestamps: true }
);

SessionTemplateSchema.pre('save', function (next) {
  if (!this.displayName && this.title) {
    this.displayName = this.title;
  }
  if (!this.internalName && this.title) {
    this.internalName = this.title;
  }
  if (this.displayName && !this.title) {
    this.title = this.displayName;
  }
  next();
});

export default mongoose.model<ISessionTemplate>('SessionTemplate', SessionTemplateSchema);
