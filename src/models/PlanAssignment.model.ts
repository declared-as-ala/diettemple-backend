import mongoose, { Schema, Document } from 'mongoose';

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type PlanAssignmentStatus = 'scheduled' | 'active' | 'completed' | 'cancelled' | 'replaced' | 'paused' | 'archived';
export type CompletionType = 'normal' | 'rattrapage';

export interface IPlanAssignment extends Document {
  userId: mongoose.Types.ObjectId;
  levelTemplateId: mongoose.Types.ObjectId;
  sourceSubscriptionId?: mongoose.Types.ObjectId;
  overridesByWeek?: Array<{
    weekNumber: number;
    days: Record<(typeof DAY_KEYS)[number], Array<{
      sessionTemplateId: mongoose.Types.ObjectId;
      overrideSessionConfigId?: mongoose.Types.ObjectId;
      note?: string;
      order?: number;
    }>>;
  }>;
  status: PlanAssignmentStatus;
  startDate: Date;
  endDate: Date;
  durationWeeks: number;
  durationWeeksSnapshot?: number;
  durationDaysSnapshot?: number;
  legacyAccessPreserved?: boolean;
  assignedBy?: mongoose.Types.ObjectId;
  assignedAt: Date;
  note?: string;
  archivedAt?: Date;
  replacedByAssignmentId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export const PLAN_DURATION_DAYS = 35; // Legacy export only; never use for new assignments.
export const PLAN_DURATION_WEEKS = 5; // Legacy export only; never use for new assignments.

const PlanAssignmentSchema: Schema = new Schema(
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
    },
    sourceSubscriptionId: {
      type: Schema.Types.ObjectId,
      ref: 'Subscription',
      index: true,
    },
    overridesByWeek: {
      type: [{
        weekNumber: { type: Number, required: true, min: 1, max: 100 },
        days: {
          mon: [new Schema({ sessionTemplateId: { type: Schema.Types.ObjectId, ref: 'SessionTemplate' }, note: String, order: Number }, { _id: false })],
          tue: [new Schema({ sessionTemplateId: { type: Schema.Types.ObjectId, ref: 'SessionTemplate' }, note: String, order: Number }, { _id: false })],
          wed: [new Schema({ sessionTemplateId: { type: Schema.Types.ObjectId, ref: 'SessionTemplate' }, note: String, order: Number }, { _id: false })],
          thu: [new Schema({ sessionTemplateId: { type: Schema.Types.ObjectId, ref: 'SessionTemplate' }, note: String, order: Number }, { _id: false })],
          fri: [new Schema({ sessionTemplateId: { type: Schema.Types.ObjectId, ref: 'SessionTemplate' }, note: String, order: Number }, { _id: false })],
          sat: [new Schema({ sessionTemplateId: { type: Schema.Types.ObjectId, ref: 'SessionTemplate' }, note: String, order: Number }, { _id: false })],
          sun: [new Schema({ sessionTemplateId: { type: Schema.Types.ObjectId, ref: 'SessionTemplate' }, note: String, order: Number }, { _id: false })],
        },
      }],
      default: () => [],
    },
    status: {
      type: String,
      enum: ['scheduled', 'active', 'completed', 'cancelled', 'replaced', 'paused', 'archived'],
      default: 'active',
      index: true,
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date },
    durationWeeks: { type: Number, required: true, min: 1 },
    durationWeeksSnapshot: { type: Number, min: 1 },
    durationDaysSnapshot: { type: Number, min: 7 },
    legacyAccessPreserved: { type: Boolean, default: false },
    assignedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    assignedAt: { type: Date, default: Date.now },
    note: { type: String },
    archivedAt: { type: Date },
    replacedByAssignmentId: { type: Schema.Types.ObjectId, ref: 'PlanAssignment' },
  },
  { timestamps: true }
);

PlanAssignmentSchema.pre('validate', async function (next) {
  try {
    if (this.isModified('startDate') || this.isNew) {
      const { addBusinessDays, parseBusinessDate } = await import('../utils/businessDate');
      const start = parseBusinessDate(new Date(this.startDate as unknown as string));
      this.startDate = start as any;

      let durationWeeks = Number(this.durationWeeksSnapshot || this.durationWeeks);
      if (!Number.isInteger(durationWeeks) || durationWeeks < 1) {
        const LevelTemplate = mongoose.model('LevelTemplate');
        const template = await LevelTemplate.findById(this.levelTemplateId).lean();
        const weeks = Array.isArray((template as any)?.weeks) ? (template as any).weeks.length : 0;
        durationWeeks = weeks || Number((template as any)?.durationWeeks);
      }
      if (!Number.isInteger(durationWeeks) || durationWeeks < 1) {
        throw new Error('Plan template has no valid duration');
      }

      this.durationWeeks = durationWeeks;
      this.durationWeeksSnapshot = durationWeeks;
      this.durationDaysSnapshot = durationWeeks * 7;
      this.endDate = addBusinessDays(start, durationWeeks * 7);
    }
    next();
  } catch (err: any) {
    next(err);
  }
});

PlanAssignmentSchema.index({ userId: 1, status: 1 });
PlanAssignmentSchema.index(
  { userId: 1 },
  { unique: true, partialFilterExpression: { status: 'active' } }
);

export default mongoose.model<IPlanAssignment>('PlanAssignment', PlanAssignmentSchema);

export const PLAN_DAYS_PER_WEEK = 7;
export const PLAN_TOTAL_DAYS = PLAN_DURATION_DAYS;
export const PLAN_TOTAL_WEEKS = PLAN_DURATION_WEEKS;
