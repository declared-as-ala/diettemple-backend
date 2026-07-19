import mongoose, { Schema, Document } from 'mongoose';

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

export interface IPlanDivision {
  _id?: mongoose.Types.ObjectId;
  name: string;
  order: number;
  description?: string;
}

const PlanDivisionSchema = new Schema(
  {
    name: { type: String, required: true },
    order: { type: Number, required: true, default: 0 },
    description: { type: String },
  },
  { _id: true }
);

const SessionPlacementSchema = new Schema(
  {
    sessionTemplateId: {
      type: Schema.Types.ObjectId,
      ref: 'SessionTemplate',
      required: true,
    },
    note: { type: String },
    order: { type: Number, default: 0 },
    divisionId: { type: Schema.Types.ObjectId },
  },
  { _id: false }
);

const WeekTemplateSchema = new Schema(
  {
    weekNumber: { type: Number, required: true, min: 1, max: 100 },
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

export interface ISessionPlacement {
  sessionTemplateId: mongoose.Types.ObjectId;
  note?: string;
  order?: number;
  divisionId?: mongoose.Types.ObjectId;
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
  gender?: 'M' | 'F' | null;
  level: 'INITIATE' | 'FIGHTER' | 'WARRIOR' | 'CHAMPION' | 'ELITE';
  weeks: IWeekTemplate[];
  durationWeeks: number;
  minimumSessionsPerWeek?: number;
  maximumSessionsPerWeek?: number;
  divisions: IPlanDivision[];
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
    name: { type: String, required: true, trim: true, index: true },
    gender: { type: String, enum: ['M', 'F'], default: 'M' },
    level: {
      type: String,
      enum: ['INITIATE', 'FIGHTER', 'WARRIOR', 'CHAMPION', 'ELITE'],
      required: true,
      index: true,
    },
    description: { type: String },
    imageUrl: { type: String },
    isActive: { type: Boolean, default: true, index: true },
    durationWeeks: { type: Number, default: 5, required: true, min: 1 },
    minimumSessionsPerWeek: { type: Number },
    maximumSessionsPerWeek: { type: Number },
    divisions: { type: [PlanDivisionSchema], default: [] },
    weeks: {
      type: [WeekTemplateSchema],
      default: defaultWeeks,
      validate: {
        validator(v: IWeekTemplate[]) {
          if (!Array.isArray(v)) return false;
          const nums = new Set<number>();
          for (const w of v) {
            if (w.weekNumber < 1) return false;
            if (nums.has(w.weekNumber)) return false;
            nums.add(w.weekNumber);
          }
          return true;
        },
        message: 'Must have unique weekNumbers starting from 1',
      },
    },
  },
  { timestamps: true }
);

LevelTemplateSchema.index({ name: 1, gender: 1 });

export default mongoose.model<ILevelTemplate>('LevelTemplate', LevelTemplateSchema);
