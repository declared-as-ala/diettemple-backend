/**
 * Generalized catch-up detection: walks a plan's ORDERED sessions (current +
 * recent weeks) and reports which ones are overdue. A catch-up session is
 * always the SAME planned session (same sessionTemplateId / weekNumber /
 * sessionOrder identity) with an OVERDUE status — this service never creates
 * a new "rattrapage session" document; it only reads WorkoutSession history.
 */
import WorkoutSession from '../models/WorkoutSession.model';
import { resolveWeekSessions, computeSessionSchedule, computeSessionStatus } from './planSchedule.service';
import { utcDateKey, MS_PER_DAY } from '../utils/scheduleDate';
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
    date: { $gte: from, $lte: to },
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
    if (doc.completionType === 'rattrapage' && doc.originalScheduledDate) {
      catchUpOriginalKeys.add(`${sid}|${utcDateKey(new Date(doc.originalScheduledDate))}`);
    } else {
      onTimeKeys.add(`${sid}|${utcDateKey(new Date(doc.date))}`);
    }
  }
  return { onTimeKeys, catchUpOriginalKeys };
}

/**
 * Returns all currently-overdue sessions (most recent first), scanning back
 * `lookbackDays` from `now`, never before the plan start and never past
 * `durationWeeks`.
 */
export async function findOverdueSessions(params: {
  userId: unknown;
  levelDoc: Pick<ILevelTemplate, 'weeks' | 'catchUpWindowHours'> | null | undefined;
  planStart: Date;
  durationWeeks: number;
  now: Date;
  lookbackDays?: number;
}): Promise<OverdueSession[]> {
  const { userId, levelDoc, planStart, durationWeeks, now, lookbackDays = 14 } = params;
  if (!levelDoc?.weeks?.length) return [];

  const lookbackStart = new Date(now.getTime() - lookbackDays * MS_PER_DAY);
  const { onTimeKeys, catchUpOriginalKeys } = await loadCompletionKeys(userId, lookbackStart, now);
  const catchUpWindowHours = levelDoc.catchUpWindowHours;

  const results: OverdueSession[] = [];
  const weekCache = new Map<number, ReturnType<typeof resolveWeekSessions>>();

  for (let back = 0; back <= lookbackDays; back++) {
    const dayMs = new Date(now.getTime() - back * MS_PER_DAY);
    if (dayMs.getTime() < planStart.getTime()) break;

    const diffDays = Math.floor((dayMs.getTime() - planStart.getTime()) / MS_PER_DAY);
    const weekN = Math.floor(diffDays / 7) + 1;
    if (weekN < 1 || weekN > durationWeeks) continue;
    const dayOffset = ((diffDays % 7) + 7) % 7;

    if (!weekCache.has(weekN)) {
      const week = (levelDoc.weeks as any[]).find((w) => w.weekNumber === weekN) ?? null;
      weekCache.set(weekN, resolveWeekSessions(week));
    }
    const weekSessions = weekCache.get(weekN)!;
    const sessionsForDay = weekSessions.filter((s) => s.recommendedDayOffset === dayOffset);

    for (const session of sessionsForDay) {
      const sid = String(session.sessionTemplateId);
      const { recommendedAt, dueAt } = computeSessionSchedule(planStart, weekN, session, {
        catchUpWindowHours,
      });
      const dateKey = utcDateKey(recommendedAt);
      const key = `${sid}|${dateKey}`;
      const isCompleted = onTimeKeys.has(key) || catchUpOriginalKeys.has(key);
      if (isCompleted) continue;

      const status = computeSessionStatus({ recommendedAt, dueAt, now, isCompleted: false });
      if (status !== 'OVERDUE') continue;

      results.push({
        sessionTemplateId: sid,
        weekNumber: weekN,
        sessionOrder: session.sessionOrder,
        recommendedDayOffset: session.recommendedDayOffset,
        originalDate: dateKey,
        dayName: DAY_NAMES[recommendedAt.getUTCDay()],
        recommendedAt,
        dueAt,
      });
    }
  }

  // Most recent first (matches legacy findMostRecentMissedSession behavior).
  results.sort((a, b) => b.recommendedAt.getTime() - a.recommendedAt.getTime());
  return results;
}

/** Convenience wrapper for the single-session legacy fields (missedSession/rattrapageSession). */
export async function findMostRecentOverdueSession(
  params: Parameters<typeof findOverdueSessions>[0]
): Promise<OverdueSession | null> {
  const all = await findOverdueSessions(params);
  return all[0] ?? null;
}
