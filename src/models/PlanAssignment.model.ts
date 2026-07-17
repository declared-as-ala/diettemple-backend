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
export const PLAN_DURATION_DAYS = 35;
export const PLAN_DURATION_WEEKS = 5;

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
      enum: ['active', 'completed', 'paused', 'archived'],
      default: 'active',
      index: true,
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date },
    durationWeeks: { type: Number, default: 5 },
    assignedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    assignedAt: { type: Date, default: Date.now },
    note: { type: String },
    archivedAt: { type: Date },
    replacedByAssignmentId: { type: Schema.Types.ObjectId, ref: 'PlanAssignment' },
  },
  { timestamps: true }
);

PlanAssignmentSchema.pre('save', async function (next) {
  try {
    if (this.isModified('startDate') || this.isNew) {
      const start = new Date(this.startDate as unknown as string);
      start.setHours(0, 0, 0, 0);
      this.startDate = start as any;
      
      const LevelTemplate = mongoose.model('LevelTemplate');
      const template = await LevelTemplate.findById(this.levelTemplateId).lean();
      const durationWeeks = template && typeof (template as any).durationWeeks === 'number'
        ? (template as any).durationWeeks
        : 5;
        
      this.durationWeeks = durationWeeks;
      this.endDate = new Date(start.getTime() + (durationWeeks * 7) * MS_PER_DAY);
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