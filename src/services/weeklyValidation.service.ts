import DailyNutritionLog from '../models/DailyNutritionLog.model';
import WorkoutSession from '../models/WorkoutSession.model';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DAY_LABELS_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

function utcStartOfCalendarDate(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function utcMondayStartOfWeekContaining(d: Date): number {
  const ms = utcStartOfCalendarDate(d);
  const dow = new Date(ms).getUTCDay(); // 0 Sun … 6 Sat
  const daysSinceMonday = dow === 0 ? 6 : dow - 1;
  return ms - daysSinceMonday * MS_PER_DAY;
}

function dateToKeyUtc(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDateInput(date?: string | Date): Date {
  if (!date) return new Date();
  const parsed = date instanceof Date ? date : new Date(date);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export interface WeeklyValidationDay {
  date: string;
  label: string;
  workoutCompleted: boolean;
  nutritionGoalCompleted: boolean;
  isValidated: boolean;
  isToday: boolean;
}

export interface WeeklyValidationResponse {
  weekStart: string;
  weekEnd: string;
  validatedDaysCount: number;
  totalDays: 7;
  today: {
    date: string;
    workoutCompleted: boolean;
    nutritionGoalCompleted: boolean;
    isValidated: boolean;
    statusLabel: 'Journée validée' | 'Journée non validée';
    missing: Array<'workout' | 'nutrition'>;
  };
  days: WeeklyValidationDay[];
}

/**
 * Weekly validation for dashboard:
 * A day is validated only when workout and nutrition are both complete.
 */
export async function calculateWeeklyValidation(
  userId: unknown,
  date?: string | Date
): Promise<WeeklyValidationResponse> {
  const ref = parseDateInput(date);
  const weekStartMs = utcMondayStartOfWeekContaining(ref);
  const weekStart = new Date(weekStartMs);
  const weekEnd = new Date(weekStartMs + 7 * MS_PER_DAY - 1);
  const todayKey = dateToKeyUtc(new Date());

  const completedSessions = await WorkoutSession.find({
    userId,
    status: 'completed',
    date: { $gte: weekStart, $lte: weekEnd },
  })
    .select('date')
    .lean();
  const workoutDateKeys = new Set(
    (completedSessions as Array<{ date: Date }>).map((doc) => dateToKeyUtc(new Date(doc.date)))
  );

  const nutritionLogs = await DailyNutritionLog.find({
    userId,
    date: { $gte: weekStart, $lte: weekEnd },
    status: 'complete',
  })
    .select('date status')
    .lean();
  const nutritionDateKeys = new Set(
    (nutritionLogs as Array<{ date: Date }>).map((doc) => dateToKeyUtc(new Date(doc.date)))
  );

  const days: WeeklyValidationDay[] = [];
  for (let i = 0; i < 7; i++) {
    const dayDate = new Date(weekStartMs + i * MS_PER_DAY);
    const dateKey = dateToKeyUtc(dayDate);
    const workoutCompleted = workoutDateKeys.has(dateKey);
    const nutritionGoalCompleted = nutritionDateKeys.has(dateKey);
    const isValidated = workoutCompleted && nutritionGoalCompleted;
    days.push({
      date: dateKey,
      label: DAY_LABELS_FR[i],
      workoutCompleted,
      nutritionGoalCompleted,
      isValidated,
      isToday: dateKey === todayKey,
    });
  }

  const validatedDaysCount = days.filter((d) => d.isValidated).length;
  const today = days.find((d) => d.isToday) || days[0];
  const missing: Array<'workout' | 'nutrition'> = [];
  if (!today.workoutCompleted) missing.push('workout');
  if (!today.nutritionGoalCompleted) missing.push('nutrition');

  return {
    weekStart: dateToKeyUtc(weekStart),
    weekEnd: dateToKeyUtc(new Date(weekStartMs + 6 * MS_PER_DAY)),
    validatedDaysCount,
    totalDays: 7,
    today: {
      date: today.date,
      workoutCompleted: today.workoutCompleted,
      nutritionGoalCompleted: today.nutritionGoalCompleted,
      isValidated: today.isValidated,
      statusLabel: today.isValidated ? 'Journée validée' : 'Journée non validée',
      missing,
    },
    days,
  };
}

