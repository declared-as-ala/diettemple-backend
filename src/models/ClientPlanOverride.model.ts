import mongoose, { Schema, Document } from 'mongoose';

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

const SessionPlacementOverrideSchema = new Schema(
  {
    sessionTemplateId: { type: Schema.Types.ObjectId, ref: 'SessionTemplate', required: true },
    overrideSessionConfigId: { type: Schema.Types.ObjectId, ref: 'SessionOverride' },
    note: String,
    order: { type: Number, default: 0 },
  },
  { _id: false }
);

const WeekOverrideSchema = new Schema(
  {
    weekNumber: { type: Number, required: true, min: 1, max: 5 },
    days: {
      mon: [SessionPlacementOverrideSchema],
      tue: [SessionPlacementOverrideSchema],
      wed: [SessionPlacementOverrideSchema],
      thu: [SessionPlacementOverrideSchema],
      fri: [SessionPlacementOverrideSchema],
      sat: [SessionPlacementOverrideSchema],
      sun: [SessionPlacementOverrideSchema],
    },
  },
  { _id: false }
);

export interface ISessionPlacementOverride {
  sessionTemplateId: mongoose.Types.ObjectId;
  overrideSessionConfigId?: mongoose.Types.ObjectId;
  note?: string;
  order?: number;
}

export interface IWeekOverride {
  weekNumber: number;
  days: Record<(typeof DAY_KEYS)[number], ISessionPlacementOverride[]>;
}

export interface IClientPlanOverride extends Document {
  userId: mongoose.Types.ObjectId;
  baseLevelTemplateId: mongoose.Types.ObjectId;
  overridesByWeek: IWeekOverride[];
  status: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
}

function defaultWeekOverrides(): IWeekOverride[] {
  return [1, 2, 3, 4, 5].map((weekNumber) => ({
    weekNumber,
    days: {
      mon: [],
      tue: [],
      wed: [],
      thu: [],
      fri: [],
      sat: [],
      sun: [],
    },
  }));
}

const ClientPlanOverrideSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true, unique: true },
    baseLevelTemplateId: { type: Schema.Types.ObjectId, ref: 'LevelTemplate', required: true },
    overridesByWeek: {
      type: [WeekOverrideSchema],
      default: defaultWeekOverrides,
      validate: {
        validator(v: IWeekOverride[]) {
          if (!Array.isArray(v) || v.length !== 5) return false;
          const nums = new Set<number>();
          for (const w of v) {
            if (w.weekNumber < 1 || w.weekNumber > 5) return false;
            if (nums.has(w.weekNumber)) return false;
            nums.add(w.weekNumber);
          }
          return true;
        },
        message: 'Must have exactly 5 weeks with unique weekNumber 1–5',
      },
    },
    status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
  },
  { timestamps: true }
);

export default mongoose.model<IClientPlanOverride>('ClientPlanOverride', ClientPlanOverrideSchema);
