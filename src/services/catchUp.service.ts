/**
 * Generalized catch-up detection: walks a plan's sessions for the CURRENT program week
 * and reports which ones are overdue/missed.
 *
 * Critical rules:
 * 1. Completed sessions must NEVER appear as rattrapage.
 * 2. Rattrapage is strictly valid ONLY during the same program week (missedSession.programWeek === currentProgramWeek).
 *    Never carry over rattrapages into subsequent weeks.
 * 3. Multiple rattrapages are sorted in chronological order (oldest first). The first is actionable.
 * 4. A single session entity is maintained (never duplicate session documents).
 */
import WorkoutSession from '../models/WorkoutSession.model';
import { resolveWeekSessions } from './planSchedule.service';
import {
  utcDateKey,
  tunisiaDateKey,
  getPlanDayPosition,
  getProgramWeekDates,
  getPlanDayKeyForDate,
  MS_PER_DAY,
} from '../utils/scheduleDate';
import { loadEffectiveLevel } from './clientSchedule.service';
import type { ILevelTemplate } from '../models/LevelTemplate.model';
import { resolveWorkoutAssignment } from './workoutAssignment.service';
import { businessDateAsUtcCalendarDate, businessDateKey } from '../utils/businessDate';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export interface OverdueSession {
  sessionTemplateId: string;
  weekNumber: number;
  sessionOrder: number;
  recommendedDayOffset: number;
  originalDate: string;
  dayName: string;
  recommendedAt: Date;
  dueAt: Date;
}

async function loadCompletionKeys(
  userId: unknown,
  from: Date,
  to: Date
): Promise<{ onTimeKeys: Set<string>; catchUpOriginalKeys: Set<string> }> {
  const docs = await WorkoutSession.find({
    userId,
    status: 'completed',
    $or: [
      { date: { $gte: from, $lte: to } },
      { originalScheduledDate: { $gte: from, $lte: to } },
    ],
  })
    .select('sessionId date completionType originalScheduledDate')
    .lean();

  const onTimeKeys = new Set<string>();
  const catchUpOriginalKeys = new Set<string>();
  for (const doc of docs as Array<{
    sessionId?: unknown;
    date: Date;
    completionType?: string;
    originalScheduledDate?: Date;
  }>) {
    if (!doc.sessionId) continue;
    const sid = String(doc.sessionId);
    const d = new Date(doc.date);
    onTimeKeys.add(`${sid}|${utcDateKey(d)}`);
    onTimeKeys.add(`${sid}|${tunisiaDateKey(d)}`);

    if (doc.originalScheduledDate) {
      const orig = new Date(doc.originalScheduledDate);
      catchUpOriginalKeys.add(`${sid}|${utcDateKey(orig)}`);
      catchUpOriginalKeys.add(`${sid}|${tunisiaDateKey(orig)}`);
    }
  }
  return { onTimeKeys, catchUpOriginalKeys };
}

/**
 * Returns all currently-overdue sessions for the CURRENT program week.
 * Enforces chronological order (oldest first: a.recommendedAt - b.recommendedAt).
 * Never returns sessions from past program weeks (Requirement 4).
 * Never returns completed sessions (Requirement 2).
 */
export async function findOverdueSessions(params: {
  userId: unknown;
  levelDoc: Pick<ILevelTemplate, 'weeks' | 'catchUpWindowHours'> | null | undefined;
  planStart: Date;
  durationWeeks: number;
  now: Date;
  lookbackDays?: number;
}): Promise<OverdueSession[]> {
  const { userId, levelDoc, planStart, durationWeeks, now } = params;
  if (!levelDoc?.weeks?.length) return [];

  // Determine the current program week (1-indexed)
  const { weekIndex } = getPlanDayPosition(now, planStart);
  if (weekIndex < 0 || weekIndex >= durationWeeks) return [];
  const currentWeekN = weekIndex + 1;

  // Query completed sessions from planStart through end of current week
  const weekDates = getProgramWeekDates(planStart, currentWeekN);
  if (weekDates.length === 0) return [];

  const { onTimeKeys, catchUpOriginalKeys } = await loadCompletionKeys(
    userId,
    planStart,
    new Date(now.getTime() + 7 * MS_PER_DAY)
  );

  const catchUpWindowHours = levelDoc.catchUpWindowHours ?? 48;
  const results: OverdueSession[] = [];

  const week = (levelDoc.weeks as any[]).find((w) => w.weekNumber === currentWeekN) ?? null;
  const orderedSessions = resolveWeekSessions(week);

  const nowBusinessKey = businessDateKey(now);

  for (const date of weekDates) {
    const dateTunisiaKey = tunisiaDateKey(date);
    const dateUtcKey = utcDateKey(date);

    // Only days strictly before "today" in the business timezone can be overdue/missed
    if (dateUtcKey >= nowBusinessKey) {
      continue;
    }

    const dayKey = getPlanDayKeyForDate(date);
    const placements = (week?.days as any)?.[dayKey] || [];

    for (const placement of placements) {
      if (!placement?.sessionTemplateId) continue;
      const sid = String(placement.sessionTemplateId);

      // Check if this session was completed either on-time or via catch-up (Requirement 1 & 2)
      const isCompleted =
        onTimeKeys.has(`${sid}|${dateTunisiaKey}`) ||
        onTimeKeys.has(`${sid}|${dateUtcKey}`) ||
        catchUpOriginalKeys.has(`${sid}|${dateTunisiaKey}`) ||
        catchUpOriginalKeys.has(`${sid}|${dateUtcKey}`);

      if (isCompleted) continue;

      const matchedOrdered = orderedSessions.find((s) => String(s.sessionTemplateId) === sid);
      const recommendedAt = date;
      const dueAt = new Date(recommendedAt.getTime() + catchUpWindowHours * 60 * 60 * 1000);

      results.push({
        sessionTemplateId: sid,
        weekNumber: currentWeekN,
        sessionOrder: matchedOrdered?.sessionOrder ?? 1,
        recommendedDayOffset: matchedOrdered?.recommendedDayOffset ?? 0,
        originalDate: dateTunisiaKey,
        dayName: DAY_NAMES[date.getUTCDay()],
        recommendedAt,
        dueAt,
      });
    }
  }

  // Canonical program order: by scheduled day, then by the week's sessionOrder for same-day ties.
  results.sort(
    (a, b) =>
      a.recommendedAt.getTime() - b.recommendedAt.getTime() || a.sessionOrder - b.sessionOrder
  );
  return results;
}

/**
 * Returns the single actionable overdue session (first missed session of the current week in
 * program order). The client never chooses: the server decides. When this session is completed it
 * disappears and the next one in order becomes actionable.
 */
export async function findMostRecentOverdueSession(
  params: Parameters<typeof findOverdueSessions>[0]
): Promise<OverdueSession | null> {
  const all = await findOverdueSessions(params);
  return all[0] ?? null;
}

/**
 * Server-side resolution of THE eligible rattrapage for a user right now (null if none).
 * Same inputs as /me/today so the card the client sees and the validation here always agree.
 */
export async function resolveEligibleRattrapage(
  userId: unknown,
  now: Date = new Date()
): Promise<OverdueSession | null> {
  const assignment = await resolveWorkoutAssignment(userId as any);
  if (!assignment || !(assignment as any).levelTemplateId) return null;
  const { level: levelDoc } = await loadEffectiveLevel(userId, (assignment as any).levelTemplateId);
  if (!levelDoc) return null;
  return findMostRecentOverdueSession({
    userId,
    levelDoc: levelDoc as any,
    planStart: businessDateAsUtcCalendarDate(new Date((assignment as any).startDate)),
    durationWeeks: Number((assignment as any).durationWeeks),
    now,
  });
}

/** True only when the requested session (and original date, if given) is exactly the eligible one. */
export function matchesEligibleRattrapage(
  eligible: OverdueSession | null,
  sessionTemplateId: unknown,
  originalScheduledDate?: unknown
): boolean {
  if (!eligible) return false;
  if (String(sessionTemplateId) !== eligible.sessionTemplateId) return false;
  if (originalScheduledDate) {
    const requested = String(originalScheduledDate).slice(0, 10);
    if (requested !== eligible.originalDate) return false;
  }
  return true;
}
