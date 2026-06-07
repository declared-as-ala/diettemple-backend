import mongoose, { Schema, Document } from 'mongoose';

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type PlanAssignmentStatus = 'active' | 'completed' | 'paused' | 'archived';
export type CompletionType = 'normal' | 'rattrapage';

export interface IPlanAssignment extends Document {
  userId: mongoose.Types.ObjectId;
  levelTemplateId: mongoose.Types.ObjectId;
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
  assignedBy?: mongoose.Types.ObjectId;
  assignedAt: Date;
  note?: string;
  archivedAt?: Date;
  replacedByAssignmentId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const MS_PER_DAY = 24 * 60 * 60 * 1_000;
const PLAN_DURATION_DAYS = 35; // 5 weeks x 7 days
const PLAN_DURATION_WEEKS = 5;

function defaultOverrides() {
  return [1, 2, 3, 4, 5].map((n) => ({
    weekNumber: n,
    days: { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] },
  }));
}

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
    overridesByWeek: {
      type: [{
        weekNumber: { type: Number, required: true, min: 1, max: 5 },
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
      default: defaultOverrides,
    },
    status: {
      type: String,
      enum: ['active', 'completed', 'paused', 'archived'],
      default: 'active',
      index: true,
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date },
    durationWeeks: { type: Number, default: PLAN_DURATION_WEEKS, immutable: true },
    assignedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    assignedAt: { type: Date, default: Date.now },
    note: { type: String },
    archivedAt: { type: Date },
    replacedByAssignmentId: { type: Schema.Types.ObjectId, ref: 'PlanAssignment' },
  },
  { timestamps: true }
);

PlanAssignmentSchema.pre('save', function (next) {
  if (this.isModified('startDate') || this.isNew) {
    const start = new Date(this.startDate as unknown as string);
    start.setHours(0, 0, 0, 0);
    this.startDate = start as any;
    this.endDate = new Date(start.getTime() + PLAN_DURATION_DAYS * MS_PER_DAY);
    this.durationWeeks = PLAN_DURATION_WEEKS;
  }
  if ((this.durationWeeks as unknown as number) !== PLAN_DURATION_WEEKS) {
    this.durationWeeks = PLAN_DURATION_WEEKS;
  }
  next();
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