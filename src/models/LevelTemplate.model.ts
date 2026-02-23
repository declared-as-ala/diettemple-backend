import mongoose, { Schema, Document } from 'mongoose';

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

const SessionPlacementSchema = new Schema(
  {
    sessionTemplateId: {
      type: Schema.Types.ObjectId,
      ref: 'SessionTemplate',
      required: true,
    },
    note: { type: String },
    order: { type: Number, default: 0 },
  },
  { _id: false }
);

const WeekTemplateSchema = new Schema(
  {
    weekNumber: { type: Number, required: true, min: 1, max: 5 },
    days: {
      mon: [SessionPlacementSchema],
      tue: [SessionPlacementSchema],
      wed: [SessionPlacementSchema],
      thu: [SessionPlacementSchema],
      fri: [SessionPlacementSchema],
      sat: [SessionPlacementSchema],
      sun: [SessionPlacementSchema],
    },
  },
  { _id: false }
);

function countWeekSessions(week: { days: Record<string, unknown[]> }): number {
  return DAY_KEYS.reduce((sum, d) => sum + (week.days?.[d]?.length ?? 0), 0);
}

export interface ISessionPlacement {
  sessionTemplateId: mongoose.Types.ObjectId;
  note?: string;
  order?: number;
}

export interface IWeekTemplate {
  weekNumber: number;
  days: Record<(typeof DAY_KEYS)[number], ISessionPlacement[]>;
}

export interface ILevelTemplate extends Document {
  name: string;
  description?: string;
  imageUrl?: string;
  isActive: boolean;
  weeks: IWeekTemplate[];
  createdAt: Date;
  updatedAt: Date;
}

const defaultWeeks = (): IWeekTemplate[] =>
  [1, 2, 3, 4, 5].map((weekNumber) => ({
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

const LevelTemplateSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, unique: true, index: true },
    description: { type: String },
    imageUrl: { type: String },
    isActive: { type: Boolean, default: true, index: true },
    weeks: {
      type: [WeekTemplateSchema],
      default: defaultWeeks,
      validate: {
        validator(v: IWeekTemplate[]) {
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
  },
  { timestamps: true }
);

export default mongoose.model<ILevelTemplate>('LevelTemplate', LevelTemplateSchema);
