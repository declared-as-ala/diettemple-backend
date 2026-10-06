/**
 * Server-side lifecycle of an in-progress workout: the 20-hour continuation window and the
 * "no future sessions" guard. The server clock is the only source of truth.
 *
 * States (derived): IN_PROGRESS (status 'active' inside the window), COMPLETED ('completed'),
 * EXPIRED ('expired': started but not finished within 20h — never auto-validated; the session
 * then follows the normal missed/rattrapage rules since only 'completed' docs count).
 */
import WorkoutSession from '../models/WorkoutSession.model';
import { loadEffectiveLevel } from './clientSchedule.service';
import { resolveWorkoutAssignment } from './workoutAssignment.service';
import { businessDateAsUtcCalendarDate } from '../utils/businessDate';
import {
  getPlanDayPosition,
  getProgramWeekDates,
  getSlotKeyForDate,
  utcDateKey,
  tunisiaDateKey,
} from '../utils/scheduleDate';

export const WORKOUT_RESUME_WINDOW_MS = 20 * 60 * 60 * 1000;

export type WorkoutSessionState = 'IN_PROGRESS' | 'COMPLETED' | 'EXPIRED';

export function computeExpiresAt(startedAt: Date | string | number): Date {
  return new Date(new Date(startedAt).getTime() + WORKOUT_RESUME_WINDOW_MS);
}

export function deriveSessionState(
  doc: { status: string; startedAt: Date | string },
  now: Date = new Date()
): WorkoutSessionState {
  if (doc.status === 'completed') return 'COMPLETED';
  if (doc.status === 'active' && computeExpiresAt(doc.startedAt).getTime() > now.getTime()) {
    return 'IN_PROGRESS';
  }
  return 'EXPIRED';
}

/**
 * Idempotently closes every active session older than 20h as 'expired' (expiredAt = startedAt+20h,
 * deterministic regardless of when the sweep runs). Safe to call on every request.
 */
export async function expireStaleWorkoutSessions(userId: unknown, now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - WORKOUT_RESUME_WINDOW_MS);
  const res: any = await (WorkoutSession as any).updateMany(
    { userId, status: 'active', startedAt: { $lte: cutoff } },
    [{ $set: { status: 'expired', expiredAt: { $add: ['$startedAt', WORKOUT_RESUME_WINDOW_MS] } } }]
  );
  return res?.modifiedCount ?? 0;
}

/** Plain-object view with server-computed lifecycle fields the client must reflect, not invent. */
export function serializeWorkoutSession(doc: any, now: Date = new Date()) {
  const obj = typeof doc?.toObject === 'function' ? doc.toObject() : { ...doc };
  return {
    ...obj,
    state: deriveSessionState(obj, now),
    expiresAt: computeExpiresAt(obj.startedAt),
    serverNow: now,
  };
}

/**
 * True when the template is scheduled in the CURRENT program week ONLY on days after today,
 * i.e. starting it would jump ahead of the program. Sessions outside the plan are not blocked.
 */
export async function isFutureOnlySession(
  userId: unknown,
  sessionTemplateId: string,
  now: Date = new Date(),
  clientDateKey?: string
): Promise<boolean> {
  const assignment: any = await resolveWorkoutAssignment(userId as any);
  if (!assignment?.levelTemplateId) return false;
  const { level }: { level: any } = await loadEffectiveLevel(userId, assignment.levelTemplateId);
  if (!level?.weeks?.length) return false;
  const planStart = businessDateAsUtcCalendarDate(new Date(assignment.startDate));
  const { weekIndex } = getPlanDayPosition(now, planStart, assignment.scheduleMode);
  if (weekIndex < 0 || weekIndex >= Number(assignment.durationWeeks)) return false;
  const weekNumber = weekIndex + 1;
  const week = level.weeks.find((w: any) => w.weekNumber === weekNumber);
  if (!week) return false;

  // The latest "today" any clock/client believes in — never block on a day that is "today" anywhere.
  const todayMax = [utcDateKey(now), tunisiaDateKey(now), clientDateKey || ''].sort().pop() as string;
  const sid = String(sessionTemplateId);
  const scheduledDates: string[] = [];
  for (const date of getProgramWeekDates(planStart, weekNumber, assignment.scheduleMode)) {
    const placements = week.days?.[getSlotKeyForDate(date, planStart, assignment.scheduleMode)] || [];
    if (placements.some((p: any) => String(p?.sessionTemplateId) === sid)) {
      scheduledDates.push(utcDateKey(date));
    }
  }
  if (scheduledDates.length === 0) return false;
  return scheduledDates.every((d) => d > todayMax);
}
