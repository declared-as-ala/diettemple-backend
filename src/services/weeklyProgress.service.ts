/**
 * Centralized weekly training-progress calculation, relative to the client's
 * PlanAssignment.startDate (never a real calendar Monday). Used by both the
 * mobile-facing /me/* endpoints and the admin dashboard so there is exactly
 * one implementation of "did this week pass".
 */
import LevelTemplate from '../models/LevelTemplate.model';
import PlanAssignment from '../models/PlanAssignment.model';
import WorkoutSession from '../models/WorkoutSession.model';
import { utcDateKey, getWeekWindow } from '../utils/scheduleDate';
import { businessDateAsUtcCalendarDate } from '../utils/businessDate';
import {
  resolveWeekSessions,
  computeSessionSchedule,
  computeSessionStatus,
  DEFAULT_CATCH_UP_WINDOW_HOURS,
  DEFAULT_MIN_REST_HOURS_BETWEEN_SESSIONS,
  SessionStatus,
  WeekStatus,
} from './planSchedule.service';

export interface WeeklyProgressSession {
  sessionTemplateId: string;
  sessionOrder: number;
  recommendedDayOffset: number;
  recommendedAt: Date;
  dueAt: Date;
  status: SessionStatus;
  completedAt: Date | null;
  completedLate: boolean;
}

export interface WeeklyProgressResult {
  weekNumber: number;
  weekStart: Date;
  weekEnd: Date;
  plannedSessions: number;
  minimumRequired: number;
  completedSessions: number;
  status: WeekStatus;
  sessions: WeeklyProgressSession[];
}

/**
 * Given a set of completed-session docs, returns:
 *  - onTimeIds: sessionTemplateId set completed with `date` inside [weekStart, weekEnd)
 *  - catchUpIds: sessionTemplateId set completed as rattrapage for an originalScheduledDate inside the week
 *  - firstCompletionByTemplateId: earliest completedAt per sessionTemplateId (for per-session display)
 */
async function loadWeekCompletions(
  userId: unknown,
  weekStart: Date,
  weekEnd: Date,
  catchUpDeadline: Date
) {
  const docs = await WorkoutSession.find({
    userId,
    status: 'completed',
    $or: [
      { date: { $gte: weekStart, $lt: weekEnd } },
      {
        completionType: 'rattrapage',
        originalScheduledDate: { $gte: weekStart, $lt: weekEnd },
        date: { $lt: catchUpDeadline },
      },
    ],
  })
    .select('sessionId date completionType originalScheduledDate completedAt')
    .lean();

  const onTimeIds = new Set<string>();
  const catchUpIds = new Set<string>();
  const completionByTemplateId = new Map<string, { completedAt: Date; late: boolean }>();

  for (const doc of docs as Array<{
    sessionId?: unknown;
    date: Date;
    completionType?: string;
    originalScheduledDate?: Date;
    completedAt?: Date;
  }>) {
    if (!doc.sessionId) continue;
    const sid = String(doc.sessionId);
    const isCatchUp = !!(
      doc.completionType === 'rattrapage' &&
      doc.originalScheduledDate &&
      doc.originalScheduledDate >= weekStart &&
      doc.originalScheduledDate < weekEnd
    );
    if (isCatchUp) {
      catchUpIds.add(sid);
    } else if (doc.date >= weekStart && doc.date < weekEnd) {
      onTimeIds.add(sid);
    } else {
      continue;
    }
    const completedAt = doc.completedAt ?? doc.date;
    const existing = completionByTemplateId.get(sid);
    if (!existing || completedAt < existing.completedAt) {
      completionByTemplateId.set(sid, { completedAt, late: isCatchUp });
    }
  }

  return { onTimeIds, catchUpIds, completionByTemplateId };
}

export function deriveWeekStatus(params: {
  isRestWeek: boolean;
  now: Date;
  weekStart: Date;
  weekEnd: Date;
  catchUpDeadline: Date;
  minimumRequired: number;
  onTimeCount: number;
  totalCount: number;
}): WeekStatus {
  const { isRestWeek, now, weekStart, weekEnd, catchUpDeadline, minimumRequired, onTimeCount, totalCount } = params;
  if (isRestWeek) return 'REST_WEEK';
  if (now < weekStart) return 'UPCOMING';
  if (now < weekEnd) return 'IN_PROGRESS';
  if (onTimeCount >= minimumRequired) return 'PASSED';
  if (totalCount >= minimumRequired) return 'PASSED_LATE';
  if (now < catchUpDeadline) return 'CATCH_UP';
  return 'FAILED';
}

export async function calculateTrainingWeekProgress(
  userId: unknown,
  planAssignmentId: unknown,
  weekNumber: number,
  now: Date = new Date()
): Promise<WeeklyProgressResult | null> {
  const assignment = await PlanAssignment.findOne({
    _id: planAssignmentId,
    userId,
  }).lean();
  if (!assignment) return null;

  const level = await LevelTemplate.findById((assignment as any).levelTemplateId).lean();
  if (!level) return null;

  const week = (level as any).weeks?.find((w: any) => w.weekNumber === weekNumber) ?? null;
  const sessions = resolveWeekSessions(week);
  const isRestWeek = !!week?.isRestWeek;

  const planStart = businessDateAsUtcCalendarDate(new Date((assignment as any).startDate));
  const { weekStart, weekEnd } = getWeekWindow(planStart, weekNumber);
  const catchUpWindowHours =
    (level as any).catchUpWindowHours ?? DEFAULT_CATCH_UP_WINDOW_HOURS;
  const minimumRestHoursBetweenSessions =
    (level as any).minimumRestHoursBetweenSessions ?? DEFAULT_MIN_REST_HOURS_BETWEEN_SESSIONS;
  const catchUpDeadline = new Date(weekEnd.getTime() + catchUpWindowHours * 60 * 60 * 1000);

  const minimumRequired = isRestWeek
    ? 0
    : week?.minimumCompletedSessions ?? (level as any).minimumSessionsPerWeek ?? sessions.length;

  const { onTimeIds, catchUpIds, completionByTemplateId } = await loadWeekCompletions(
    userId,
    weekStart,
    weekEnd,
    catchUpDeadline
  );
  const totalCompletedIds = new Set<string>([...onTimeIds, ...catchUpIds]);

  // Most recent completion before `now`, used for the minimum-rest-hours gate.
  const lastCompletedDoc = await WorkoutSession.findOne({ userId, status: 'completed', date: { $lt: now } })
    .sort({ date: -1 })
    .select('date')
    .lean();
  const lastCompletedAt = lastCompletedDoc ? new Date((lastCompletedDoc as any).date) : null;

  const sessionResults: WeeklyProgressSession[] = sessions.map((s) => {
    const sid = String(s.sessionTemplateId);
    const { recommendedAt, dueAt } = computeSessionSchedule(
      planStart,
      weekNumber,
      s,
      { catchUpWindowHours }
    );
    const completion = completionByTemplateId.get(sid) ?? null;
    const status = computeSessionStatus({
      recommendedAt,
      dueAt,
      now,
      isCompleted: !!completion,
      lastCompletedAt,
      minimumRestHoursBetweenSessions,
    });
    return {
      sessionTemplateId: sid,
      sessionOrder: s.sessionOrder,
      recommendedDayOffset: s.recommendedDayOffset,
      recommendedAt,
      dueAt,
      status,
      completedAt: completion?.completedAt ?? null,
      completedLate: completion?.late ?? false,
    };
  });

  const status = deriveWeekStatus({
    isRestWeek,
    now,
    weekStart,
    weekEnd,
    catchUpDeadline,
    minimumRequired,
    onTimeCount: onTimeIds.size,
    totalCount: totalCompletedIds.size,
  });

  const result: WeeklyProgressResult = {
    weekNumber,
    weekStart,
    weekEnd,
    plannedSessions: sessions.length,
    minimumRequired,
    completedSessions: totalCompletedIds.size,
    status,
    sessions: sessionResults,
  };

  return result;
}

export { utcDateKey };
