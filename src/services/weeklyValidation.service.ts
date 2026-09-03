import mongoose from 'mongoose';
import DailyNutritionLog from '../models/DailyNutritionLog.model';
import WorkoutSession from '../models/WorkoutSession.model';
import WeeklySummary from '../models/WeeklySummary.model';
import { getCurrentWeekNumber, getWeekWindow, resolveWeekSessions } from './planSchedule.service';
import { utcDateKey } from '../utils/scheduleDate';
import { businessDateAsUtcCalendarDate } from '../utils/businessDate';

const DAY_LABELS_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

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
 * Centralized Weekly validation, relative to the client's PlanAssignment.startDate
 * (NOT a real calendar Monday — see scheduleDate.ts / planSchedule.service.ts).
 * Formula: nutritionSuccessfulDays >= 6 AND completedSessions >= minSessions AND completedSessions <= maxSessions
 */
export async function calculateWeeklyValidation(
  userId: unknown,
  date?: string | Date
): Promise<WeeklyValidationResponse> {
  const ref = parseDateInput(date);
  const todayKey = utcDateKey(new Date());

  const PlanAssignment = mongoose.model('PlanAssignment');
  const LevelTemplate = mongoose.model('LevelTemplate');

  // Find the plan assignment covering `ref` (relative week is derived from ITS startDate).
  const assignment = await PlanAssignment.findOne({
    userId,
    startDate: { $lte: ref },
    endDate: { $gte: ref },
    status: { $in: ['active', 'completed', 'archived'] },
  }).sort({ createdAt: -1 });

  let minimumSessions = 3; // safe fallback
  let maximumSessions = 5; // safe fallback
  let planId: any = null;
  let weekNumber = 1;
  let weekStart: Date;
  let weekEnd: Date;
  const failureReasons: string[] = [];

  if (assignment) {
    const assignmentStart = businessDateAsUtcCalendarDate(new Date((assignment as any).startDate));
    weekNumber = getCurrentWeekNumber(assignmentStart, (assignment as any).durationWeeks || 5, ref);
    ({ weekStart, weekEnd } = getWeekWindow(assignmentStart, weekNumber));

    planId = assignment.levelTemplateId;
    const plan = await LevelTemplate.findById(assignment.levelTemplateId).lean();
    if (plan) {
      const week = (plan as any).weeks?.find((w: any) => w.weekNumber === weekNumber);
      const orderedSessions = resolveWeekSessions(week);
      if (week?.minimumCompletedSessions != null) {
        minimumSessions = week.minimumCompletedSessions;
      } else if ((plan as any).minimumSessionsPerWeek !== undefined) {
        minimumSessions = (plan as any).minimumSessionsPerWeek;
      }
      if ((plan as any).maximumSessionsPerWeek !== undefined) {
        maximumSessions = (plan as any).maximumSessionsPerWeek;
      } else if (orderedSessions.length > 0) {
        maximumSessions = orderedSessions.length;
      }
      if (week?.minimumCompletedSessions == null && (plan as any).minimumSessionsPerWeek === undefined) {
        failureReasons.push("Le programme d'entraînement assigné est incomplet (sessions min/max non configurées).");
      }
    } else {
      failureReasons.push("Le programme d'entraînement assigné est introuvable.");
    }
  } else {
    // No assignment covers `ref` — fall back to a `ref`-anchored single week window.
    weekStart = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate()));
    weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
    failureReasons.push("Aucun programme d'entraînement assigné pour cette semaine.");
  }

  // Count nutrition completed days (status === 'complete')
  const nutritionLogs = await DailyNutritionLog.find({
    userId,
    date: { $gte: weekStart, $lt: weekEnd },
    status: 'complete',
  })
    .select('date')
    .lean();
  const nutritionDateKeys = new Set(
    (nutritionLogs as Array<{ date: Date }>).map((doc) => utcDateKey(new Date(doc.date)))
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
    date: { $gte: weekStart, $lt: weekEnd },
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
    workoutDateKeys.add(utcDateKey(new Date(session.date)));
  }
  const completedSessionsCount = completedSessionIds.size;
  const workoutCompleted = completedSessionsCount >= minimumSessions && completedSessionsCount <= maximumSessions;

  if (completedSessionsCount < minimumSessions) {
    failureReasons.push(`Nombre de séances insuffisant (${completedSessionsCount} réalisées, minimum requis : ${minimumSessions}).`);
  } else if (completedSessionsCount > maximumSessions) {
    failureReasons.push(`Nombre de séances maximum dépassé (${completedSessionsCount} réalisées, maximum autorisé : ${maximumSessions}).`);
  }

  // Build days list for display — label reflects each day's REAL weekday (Mon..Sun),
  // since the relative week window need not itself start on a Monday.
  const days: WeeklyValidationDay[] = [];
  for (let i = 0; i < 7; i++) {
    const dayDate = new Date(weekStart.getTime() + i * 24 * 60 * 60 * 1000);
    const dateKey = utcDateKey(dayDate);
    const dayWorkout = workoutDateKeys.has(dateKey);
    const dayNutrition = nutritionDateKeys.has(dateKey);
    const utcDow = dayDate.getUTCDay(); // 0 Sun … 6 Sat
    days.push({
      date: dateKey,
      label: DAY_LABELS_FR[utcDow === 0 ? 6 : utcDow - 1],
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
        planAssignmentId: assignment ? (assignment as any)._id : undefined,
        weekNumber,
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
    weekStart: utcDateKey(weekStart),
    weekEnd: utcDateKey(new Date(weekEnd.getTime() - 24 * 60 * 60 * 1000)),
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
