/**
 * Centralized relative-cycle scheduling. Every route (mobile-facing and
 * admin-facing) that needs "which week/day/session is this" must go through
 * this service instead of hand-rolling date math, so there is exactly one
 * implementation of the scheduling rules.
 */
import {
  MS_PER_DAY,
  PLAN_DAY_KEYS,
  PlanDayKey,
  addDaysUtc,
  getPlanDayPosition,
  getWeekWindow,
  legacyDayKeyFromOffset,
  utcStartOfCalendarDate,
} from '../utils/scheduleDate';
import type { IWeekTemplate, IPlannedWeekSession } from '../models/LevelTemplate.model';

export { getPlanDayPosition, getWeekWindow, legacyDayKeyFromOffset };

export const DEFAULT_CATCH_UP_WINDOW_HOURS = 48;
export const DEFAULT_MIN_REST_HOURS_BETWEEN_SESSIONS = 24;
export const DEFAULT_CARRY_OVER_MISSED_SESSIONS = false;

export type SessionStatus =
  | 'UPCOMING'
  | 'AVAILABLE'
  | 'OVERDUE'
  | 'COMPLETED'
  | 'MISSED'
  | 'SKIPPED'
  | 'EXCUSED';

export type WeekStatus =
  | 'UPCOMING'
  | 'IN_PROGRESS'
  | 'CATCH_UP'
  | 'PASSED'
  | 'PASSED_LATE'
  | 'FAILED'
  | 'REST_WEEK';

/**
 * Returns the week's ordered sessions. If `week.sessions` is already
 * populated (new model), it is used as-is (sorted by sessionOrder). Otherwise
 * it is derived from the legacy `days.mon..sun` positional map, so templates
 * that haven't run the migration script still schedule correctly.
 */
export function resolveWeekSessions(week: IWeekTemplate | null | undefined): IPlannedWeekSession[] {
  if (!week) return [];
  if (Array.isArray(week.sessions) && week.sessions.length > 0) {
    return [...week.sessions].sort((a, b) => a.sessionOrder - b.sessionOrder);
  }
  const derived: IPlannedWeekSession[] = [];
  let order = 1;
  for (let offset = 0; offset < PLAN_DAY_KEYS.length; offset++) {
    const dayKey = PLAN_DAY_KEYS[offset] as PlanDayKey;
    const placements = week.days?.[dayKey] || [];
    for (const placement of placements) {
      if (!placement?.sessionTemplateId) continue;
      derived.push({
        sessionTemplateId: placement.sessionTemplateId,
        sessionOrder: order++,
        recommendedDayOffset: offset,
      });
    }
  }
  return derived;
}

/** Which week number (1-indexed, clamped to [1, durationWeeks]) `now` falls on for a plan starting at `planStart`. */
export function getCurrentWeekNumber(planStart: Date, durationWeeks: number, now: Date): number {
  const { weekIndex } = getPlanDayPosition(now, planStart);
  return Math.min(durationWeeks, Math.max(1, weekIndex + 1));
}

export function computeSessionSchedule(
  planStart: Date,
  weekNumber: number,
  session: Pick<IPlannedWeekSession, 'recommendedDayOffset'>,
  opts: { catchUpWindowHours?: number } = {}
): { recommendedAt: Date; dueAt: Date } {
  const catchUpWindowHours = opts.catchUpWindowHours ?? DEFAULT_CATCH_UP_WINDOW_HOURS;
  const { weekStart } = getWeekWindow(planStart, weekNumber);
  const recommendedAt = addDaysUtc(utcStartOfCalendarDate(weekStart), session.recommendedDayOffset);
  const dueAt = new Date(recommendedAt.getTime() + catchUpWindowHours * 60 * 60 * 1000);
  return { recommendedAt, dueAt };
}

export function computeSessionStatus(params: {
  recommendedAt: Date;
  dueAt: Date;
  now: Date;
  isCompleted: boolean;
  isSkipped?: boolean;
  isExcused?: boolean;
  lastCompletedAt?: Date | null;
  minimumRestHoursBetweenSessions?: number;
}): SessionStatus {
  const {
    recommendedAt,
    dueAt,
    now,
    isCompleted,
    isSkipped,
    isExcused,
    lastCompletedAt,
    minimumRestHoursBetweenSessions = DEFAULT_MIN_REST_HOURS_BETWEEN_SESSIONS,
  } = params;

  if (isCompleted) return 'COMPLETED';
  if (isExcused) return 'EXCUSED';
  if (isSkipped) return 'SKIPPED';

  if (now.getTime() < recommendedAt.getTime()) return 'UPCOMING';

  const restBlockedUntilMs = lastCompletedAt
    ? lastCompletedAt.getTime() + minimumRestHoursBetweenSessions * 60 * 60 * 1000
    : null;
  const restBlocked = restBlockedUntilMs != null && now.getTime() < restBlockedUntilMs;

  const recommendedDayEnd = new Date(recommendedAt.getTime() + MS_PER_DAY);
  if (now.getTime() < recommendedDayEnd.getTime()) {
    return restBlocked ? 'UPCOMING' : 'AVAILABLE';
  }

  if (now.getTime() < dueAt.getTime()) {
    return restBlocked ? 'UPCOMING' : 'OVERDUE';
  }

  return 'MISSED';
}
