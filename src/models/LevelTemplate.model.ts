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

/**
 * Ordered, relative-cycle session slot (source of truth for scheduling).
 * recommendedDayOffset is 0-6, relative to the client's plan-assignment start date
 * for this week — NOT a real weekday. offset % 7 maps 1:1 onto the legacy
 * `days.mon..sun` positional keys (mon = offset 0), so `days{}` stays derivable.
 */
const PlannedWeekSessionSchema = new Schema(
  {
    sessionTemplateId: {
      type: Schema.Types.ObjectId,
      ref: 'SessionTemplate',
      required: true,
    },
    sessionOrder: { type: Number, required: true, min: 1 },
    recommendedDayOffset: { type: Number, required: true, min: 0, max: 6 },
    restDaysAfterPrevious: { type: Number, min: 0 },
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
    sessions: { type: [PlannedWeekSessionSchema], default: undefined },
    minimumCompletedSessions: { type: Number, min: 0 },
    isRestWeek: { type: Boolean, default: false },
  },
  { _id: false }
);

export interface ISessionPlacement {
  sessionTemplateId: mongoose.Types.ObjectId;
  note?: string;
  order?: number;
  divisionId?: mongoose.Types.ObjectId;
}

export interface IPlannedWeekSession {
  sessionTemplateId: mongoose.Types.ObjectId;
  sessionOrder: number;
  recommendedDayOffset: number;
  restDaysAfterPrevious?: number;
}

export interface IWeekTemplate {
  weekNumber: number;
  days: Record<(typeof DAY_KEYS)[number], ISessionPlacement[]>;
  sessions?: IPlannedWeekSession[];
  minimumCompletedSessions?: number;
  isRestWeek?: boolean;
}

export interface ILevelTemplate extends Document {
  name: string;
  clientDisplayName?: string;
  description?: string;
  imageUrl?: string;
  isActive: boolean;
  gender?: 'M' | 'F' | null;
  level: 'INITIATE' | 'FIGHTER' | 'WARRIOR' | 'CHAMPION' | 'ELITE';
  weeks: IWeekTemplate[];
  durationWeeks: number;
  minimumSessionsPerWeek?: number;
  maximumSessionsPerWeek?: number;
  /** Hours after the catch-up window opens (week end) during which a late completion still counts. Default 48. */
  catchUpWindowHours?: number;
  /** Minimum hours required between two completed sessions. Default 24. */
  minimumRestHoursBetweenSessions?: number;
  /** Whether missed sessions roll into the following week. Default false. */
  carryOverMissedSessions?: boolean;
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
    clientDisplayName: { type: String, trim: true, index: true },
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
    catchUpWindowHours: { type: Number, min: 0 },
    minimumRestHoursBetweenSessions: { type: Number, min: 0 },
    carryOverMissedSessions: { type: Boolean },
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
            const sessionCount = w.sessions?.length ?? 0;
            if (w.isRestWeek) {
              if (sessionCount > 0) return false;
              if (w.minimumCompletedSessions != null && w.minimumCompletedSessions !== 0) return false;
            } else if (w.sessions !== undefined) {
              if (sessionCount === 0) return false; // active week must not be silently empty
              if (
                w.minimumCompletedSessions != null &&
                (w.minimumCompletedSessions < 1 || w.minimumCompletedSessions > sessionCount)
              ) {
                return false;
              }
            }
          }
          return true;
        },
        message:
          'Weeks must have unique weekNumbers starting from 1; minimumCompletedSessions must be between 1 and sessions.length (0 only for isRestWeek); a non-rest week with a sessions[] array must not be empty',
      },
    },
  },
  { timestamps: true }
);

LevelTemplateSchema.index({ name: 1, gender: 1 });

export default mongoose.model<ILevelTemplate>('LevelTemplate', LevelTemplateSchema);
