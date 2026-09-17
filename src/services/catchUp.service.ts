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
import type { ILevelTemplate } from '../models/LevelTemplate.model';

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

  const nowTunisiaKey = tunisiaDateKey(now);
  const nowUtcKey = utcDateKey(now);

  for (const date of weekDates) {
    const dateTunisiaKey = tunisiaDateKey(date);
    const dateUtcKey = utcDateKey(date);

    // Only past days in the current week can be overdue/missed (Requirement 3)
    if (dateTunisiaKey >= nowTunisiaKey && dateUtcKey >= nowUtcKey) {
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

  // Enforce chronological order (oldest first) (Requirement 5)
  results.sort((a, b) => a.recommendedAt.getTime() - b.recommendedAt.getTime());
  return results;
}

/**
 * Returns the single actionable overdue session (oldest missed session of the current week).
 * When this session is completed, it immediately disappears and the next oldest becomes actionable.
 */
export async function findMostRecentOverdueSession(
  params: Parameters<typeof findOverdueSessions>[0]
): Promise<OverdueSession | null> {
  const all = await findOverdueSessions(params);
  return all[0] ?? null;
}
