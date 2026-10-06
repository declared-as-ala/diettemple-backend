/**
 * ONE authoritative resolution of "which plan does this client follow":
 *
 *   PlanAssignment (client, start date, level template, duration)
 *     + LevelTemplate.weeks (the admin plan, read live — there are no generated session copies)
 *     + ClientPlanOverride (per-client week edits, applied only while it still targets the same plan)
 *
 * Every mobile endpoint, the rattrapage/validation services AND the admin client view must load the
 * plan through here, so Admin and Mobile always read the same object. `buildScheduleTrace` exposes the
 * result as flat rows (client / assignment / plan / week / session id / order / date) for comparison.
 */
import ClientPlanOverride from '../models/ClientPlanOverride.model';
import LevelTemplate from '../models/LevelTemplate.model';
import SessionTemplate from '../models/SessionTemplate.model';
import { resolveWorkoutAssignment, type ResolvedWorkoutAssignment } from './workoutAssignment.service';
import { resolveWeekSessions } from './planSchedule.service';
import { businessDateAsUtcCalendarDate } from '../utils/businessDate';
import {
  PLAN_DAY_KEYS,
  getProgramWeekDates,
  getSlotKeyForDate,
  legacyDayKeyFromOffset,
  utcDateKey,
} from '../utils/scheduleDate';

type DayMap = Record<string, any[]>;

export type OverrideStatus =
  | { applied: false; reason: 'NONE' | 'INACTIVE' | 'STALE_BASE_PLAN' }
  | { applied: true; overrideId: string; overriddenWeeks: number[] };

/** Stable per-day ordering: explicit `order`, then original position. Never DB insertion luck. */
function normalizeDays(days: DayMap | undefined): DayMap {
  const out: DayMap = {};
  for (const key of PLAN_DAY_KEYS) {
    const list = [...(days?.[key] || [])].filter((p) => p?.sessionTemplateId);
    out[key] = list
      .map((p, i) => ({ p, i }))
      .sort((a, b) => (a.p.order ?? 0) - (b.p.order ?? 0) || a.i - b.i)
      .map(({ p }) => p);
  }
  return out;
}

/** Per week/day: a non-empty override day replaces the base day (same rule the admin editor uses). */
export function mergeWeeksWithOverride(baseWeeks: any[], overrideWeeks: any[] | undefined): any[] {
  return (baseWeeks || []).map((w) => {
    const ow = (overrideWeeks || []).find((x) => x.weekNumber === w.weekNumber);
    const baseDays = normalizeDays(w.days);
    if (!ow) return { ...w, days: baseDays };
    let touched = false;
    const days: DayMap = {};
    for (const key of PLAN_DAY_KEYS) {
      const ov = ow.days?.[key];
      if (ov && ov.length > 0) {
        touched = true;
        days[key] = ov.map((p: any) => ({
          sessionTemplateId: p.sessionTemplateId,
          overrideSessionConfigId: p.overrideSessionConfigId || undefined,
          note: p.note,
          order: p.order ?? 0,
        }));
      } else {
        days[key] = baseDays[key];
      }
    }
    // sessions[] describes the BASE week; once days are overridden it must be re-derived from days.
    return { ...w, days: normalizeDays(days), sessions: touched ? undefined : w.sessions };
  });
}

export interface EffectivePlan {
  assignment: ResolvedWorkoutAssignment;
  /** LevelTemplate (lean) whose `weeks` are the EFFECTIVE weeks (base + valid client override). */
  level: any;
  override: OverrideStatus;
}

export async function loadEffectiveLevel(
  userId: unknown,
  levelTemplateId: unknown
): Promise<{ level: any | null; override: OverrideStatus }> {
  const level: any = await LevelTemplate.findById(levelTemplateId).lean();
  if (!level) return { level: null, override: { applied: false, reason: 'NONE' } };

  const ov: any = await ClientPlanOverride.findOne({ userId }).lean();
  let override: OverrideStatus = { applied: false, reason: 'NONE' };
  let overrideWeeks: any[] | undefined;
  if (ov) {
    if (ov.status !== 'active') override = { applied: false, reason: 'INACTIVE' };
    // An override created for an OLD plan must never leak into a newly assigned plan.
    else if (String(ov.baseLevelTemplateId) !== String(level._id)) override = { applied: false, reason: 'STALE_BASE_PLAN' };
    else {
      overrideWeeks = ov.overridesByWeek;
      override = {
        applied: true,
        overrideId: String(ov._id),
        overriddenWeeks: (ov.overridesByWeek || [])
          .filter((w: any) => PLAN_DAY_KEYS.some((k) => (w.days?.[k] || []).length > 0))
          .map((w: any) => w.weekNumber),
      };
    }
  }
  return { level: { ...level, weeks: mergeWeeksWithOverride(level.weeks, overrideWeeks) }, override };
}

export async function resolveEffectivePlan(userId: unknown, at: Date = new Date()): Promise<EffectivePlan | null> {
  const assignment = await resolveWorkoutAssignment(userId, at);
  if (!assignment?.levelTemplateId) return null;
  const { level, override } = await loadEffectiveLevel(userId, assignment.levelTemplateId);
  if (!level) return null;
  return { assignment, level, override };
}

export interface ScheduleTraceRow {
  userId: string;
  planAssignmentId: string;
  planId: string;
  planName: string;
  weekNumber: number;
  sessionOrder: number;
  sessionTemplateId: string;
  sessionName: string | null;
  dayKey: string;
  /** Business-timezone (Africa/Tunis) calendar date, or null when it falls before the plan start. */
  scheduledDate: string | null;
  flags: string[];
}

/** Flat, comparable view of the client's effective schedule. Admin and mobile endpoints return this same shape. */
export async function buildScheduleTrace(userId: unknown, at: Date = new Date()) {
  const effective = await resolveEffectivePlan(userId, at);
  if (!effective) return { effective: null, rows: [] as ScheduleTraceRow[] };
  const { assignment, level, override } = effective;
  const planStart = businessDateAsUtcCalendarDate(new Date(assignment.startDate));

  const ids = new Set<string>();
  for (const w of level.weeks) for (const k of PLAN_DAY_KEYS) for (const p of w.days?.[k] || []) ids.add(String(p.sessionTemplateId));
  const templates = await SessionTemplate.find({ _id: { $in: [...ids] } }).select('title').lean();
  const titleById = new Map(templates.map((t: any) => [String(t._id), t.title as string]));

  const rows: ScheduleTraceRow[] = [];
  for (let weekNumber = 1; weekNumber <= assignment.durationWeeks; weekNumber++) {
    const week = level.weeks.find((w: any) => w.weekNumber === weekNumber);
    if (!week) continue;
    const dateByDayKey = new Map<string, string>();
    for (const d of getProgramWeekDates(planStart, weekNumber, assignment.scheduleMode)) dateByDayKey.set(getSlotKeyForDate(d, planStart, assignment.scheduleMode), utcDateKey(d));

    // Drift check: legacy days{} (used for dates) vs ordered sessions[] (used for order/offset).
    const drift =
      Array.isArray(week.sessions) &&
      week.sessions.length > 0 &&
      JSON.stringify(week.sessions.map((s: any) => [String(s.sessionTemplateId), legacyDayKeyFromOffset(s.recommendedDayOffset)]).sort()) !==
        JSON.stringify(
          PLAN_DAY_KEYS.flatMap((k) => (week.days?.[k] || []).map((p: any) => [String(p.sessionTemplateId), k])).sort()
        );

    const counts = new Map<string, number>();
    for (const k of PLAN_DAY_KEYS) for (const p of week.days?.[k] || []) counts.set(String(p.sessionTemplateId), (counts.get(String(p.sessionTemplateId)) || 0) + 1);

    // Same ordering the mobile uses: weekday sequence, then placement order (see resolveWeekSessions/normalizeDays).
    let order = 0;
    for (const k of PLAN_DAY_KEYS) {
      for (const p of week.days?.[k] || []) {
        order += 1;
        const sid = String(p.sessionTemplateId);
        const date = dateByDayKey.get(k) ?? null;
        const flags: string[] = [];
        if (!date) flags.push('BEFORE_PLAN_START_NOT_SCHEDULED');
        if (drift) flags.push('DAYS_SESSIONS_DRIFT');
        if ((counts.get(sid) || 0) > 1) flags.push('SAME_TEMPLATE_REPEATED_IN_WEEK');
        if (!override.applied && override.reason === 'STALE_BASE_PLAN') flags.push('STALE_OVERRIDE_IGNORED');
        rows.push({
          userId: String(userId),
          planAssignmentId: String(assignment._id),
          planId: String(level._id),
          planName: level.clientDisplayName || level.name,
          weekNumber,
          sessionOrder: order,
          sessionTemplateId: sid,
          sessionName: titleById.get(sid) ?? null,
          dayKey: k,
          scheduledDate: date,
          flags,
        });
      }
    }
  }
  return {
    effective: {
      planAssignmentId: String(assignment._id),
      assignmentSource: assignment.source,
      planId: String(level._id),
      startDate: utcDateKey(planStart),
      scheduleMode: assignment.scheduleMode,
      durationWeeks: assignment.durationWeeks,
      override,
    },
    rows,
  };
}

export { resolveWeekSessions };
