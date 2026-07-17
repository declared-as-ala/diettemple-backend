import mongoose from 'mongoose';
import DailyNutritionLog from '../models/DailyNutritionLog.model';
import WorkoutSession from '../models/WorkoutSession.model';
import WeeklySummary from '../models/WeeklySummary.model';

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
  clientId: string;
  weekStart: string;
  weekEnd: string;
  nutrition: {
    successfulDays: number;
    requiredDays: number;
    totalDays: number;
    completed: boolean;
  };
  training: {
    completedSessions: number;
    minimumRequired: number;
    maximumAllowed: number;
    completed: boolean;
  };
  status: 'IN_PROGRESS' | 'VALIDATED' | 'NOT_VALIDATED';
  failureReasons: string[];
  days: WeeklyValidationDay[];
}

/**
 * Centalized Weekly validation:
 * Formula: nutritionSuccessfulDays >= 6 AND completedSessions >= minSessions AND completedSessions <= maxSessions
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

  const PlanAssignment = mongoose.model('PlanAssignment');
  const LevelTemplate = mongoose.model('LevelTemplate');

  // Find the plan assignment active during this week
  const assignment = await PlanAssignment.findOne({
    userId,
    startDate: { $lte: weekEnd },
    endDate: { $gte: weekStart },
    status: { $in: ['active', 'completed', 'archived'] },
  }).sort({ createdAt: -1 });

  let minimumSessions = 3; // safe fallback
  let maximumSessions = 5; // safe fallback
  let planId: any = null;
  const planAssignmentId = assignment ? assignment._id : null;
  const failureReasons: string[] = [];

  if (assignment) {
    planId = assignment.levelTemplateId;
    const plan = await LevelTemplate.findById(assignment.levelTemplateId).lean();
    if (plan) {
      if ((plan as any).minimumSessionsPerWeek !== undefined) {
        minimumSessions = (plan as any).minimumSessionsPerWeek;
      }
      if ((plan as any).maximumSessionsPerWeek !== undefined) {
        maximumSessions = (plan as any).maximumSessionsPerWeek;
      }
      if ((plan as any).minimumSessionsPerWeek === undefined || (plan as any).maximumSessionsPerWeek === undefined) {
        failureReasons.push("Le programme d'entraînement assigné est incomplet (sessions min/max non configurées).");
      }
    } else {
      failureReasons.push("Le programme d'entraînement assigné est introuvable.");
    }
  } else {
    failureReasons.push("Aucun programme d'entraînement assigné pour cette semaine.");
  }

  // Count nutrition completed days (status === 'complete')
  const nutritionLogs = await DailyNutritionLog.find({
    userId,
    date: { $gte: weekStart, $lte: weekEnd },
    status: 'complete',
  })
    .select('date')
    .lean();
  const nutritionDateKeys = new Set(
    (nutritionLogs as Array<{ date: Date }>).map((doc) => dateToKeyUtc(new Date(doc.date)))
  );
  const nutritionSuccessfulDays = nutritionDateKeys.size;
  const nutritionCompleted = nutritionSuccessfulDays >= 6;

  if (nutritionSuccessfulDays < 6) {
    failureReasons.push(`Objectif nutrition non atteint (${nutritionSuccessfulDays}/7 jours complétés, minimum 6 requis).`);
  }

  // Count completed training sessions (status === 'completed')
  const completedSessionsDocs = await WorkoutSession.find({
    userId,
    status: 'completed',
    date: { $gte: weekStart, $lte: weekEnd },
  })
    .select('sessionId date')
    .lean();

  // Prevent duplicate completion events by keeping unique sessions templates completed
  const completedSessionIds = new Set<string>();
  const workoutDateKeys = new Set<string>();
  for (const session of completedSessionsDocs) {
    if (session.sessionId) {
      completedSessionIds.add(session.sessionId.toString());
    }
    workoutDateKeys.add(dateToKeyUtc(new Date(session.date)));
  }
  const completedSessionsCount = completedSessionIds.size;
  const workoutCompleted = completedSessionsCount >= minimumSessions && completedSessionsCount <= maximumSessions;

  if (completedSessionsCount < minimumSessions) {
    failureReasons.push(`Nombre de séances insuffisant (${completedSessionsCount} réalisées, minimum requis : ${minimumSessions}).`);
  } else if (completedSessionsCount > maximumSessions) {
    failureReasons.push(`Nombre de séances maximum dépassé (${completedSessionsCount} réalisées, maximum autorisé : ${maximumSessions}).`);
  }

  // Build days list for display
  const days: WeeklyValidationDay[] = [];
  for (let i = 0; i < 7; i++) {
    const dayDate = new Date(weekStartMs + i * MS_PER_DAY);
    const dateKey = dateToKeyUtc(dayDate);
    const dayWorkout = workoutDateKeys.has(dateKey);
    const dayNutrition = nutritionDateKeys.has(dateKey);
    days.push({
      date: dateKey,
      label: DAY_LABELS_FR[i],
      workoutCompleted: dayWorkout,
      nutritionGoalCompleted: dayNutrition,
      isValidated: dayWorkout && dayNutrition,
      isToday: dateKey === todayKey,
    });
  }

  // Determine final status
  let status: 'VALIDATED' | 'NOT_VALIDATED' | 'IN_PROGRESS' = 'IN_PROGRESS';
  const isAllConditionsMet = nutritionCompleted && workoutCompleted;

  if (isAllConditionsMet) {
    status = 'VALIDATED';
  } else {
    // If the week is completed (past week)
    if (new Date() > weekEnd) {
      status = 'NOT_VALIDATED';
    } else {
      status = 'IN_PROGRESS';
    }
  }

  // Save finalized past week summary to DB (idempotent)
  if (new Date() > weekEnd && planId) {
    await WeeklySummary.findOneAndUpdate(
      { userId, weekStart },
      {
        userId,
        levelTemplateId: planId,
        planAssignmentId: planAssignmentId || undefined,
        weekStart,
        weekEnd,
        nutritionSuccessfulDays,
        completedSessions: completedSessionsCount,
        minimumSessions,
        maximumSessions,
        status: status === 'VALIDATED' ? 'VALIDATED' : 'NOT_VALIDATED',
        failureReasons,
        calculatedAt: new Date(),
      },
      { upsert: true, new: true }
    );
  }

  return {
    clientId: String(userId),
    weekStart: dateToKeyUtc(weekStart),
    weekEnd: dateToKeyUtc(new Date(weekStartMs + 6 * MS_PER_DAY)),
    nutrition: {
      successfulDays: nutritionSuccessfulDays,
      requiredDays: 6,
      totalDays: 7,
      completed: nutritionCompleted,
    },
    training: {
      completedSessions: completedSessionsCount,
      minimumRequired: minimumSessions,
      maximumAllowed: maximumSessions,
      completed: workoutCompleted,
    },
    status,
    failureReasons,
    days,
  };
}

