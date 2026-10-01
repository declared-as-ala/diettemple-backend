/**
 * Admin == Database == API == Mobile for the same client schedule.
 *
 * Admin builder shape (relative, ordered sessions):  S1 Push, S2 Pull, S3 Legs, S4 Upper
 * stored as sessions[] + days{} (mon/tue/thu/fri), exactly what PUT /level-templates/:id/weeks stores.
 */
jest.mock('../models/ClientPlanOverride.model', () => ({ __esModule: true, default: { findOne: jest.fn() } }));
jest.mock('../models/LevelTemplate.model', () => ({ __esModule: true, default: { findById: jest.fn() } }));
jest.mock('../models/SessionTemplate.model', () => ({ __esModule: true, default: { find: jest.fn() } }));
jest.mock('../models/WorkoutSession.model', () => ({ __esModule: true, default: { find: jest.fn(), findOne: jest.fn() } }));
jest.mock('./workoutAssignment.service', () => ({ resolveWorkoutAssignment: jest.fn() }));

import { describe, it, expect, beforeEach } from '@jest/globals';
import ClientPlanOverride from '../models/ClientPlanOverride.model';
import LevelTemplate from '../models/LevelTemplate.model';
import SessionTemplate from '../models/SessionTemplate.model';
import WorkoutSession from '../models/WorkoutSession.model';
import { resolveWorkoutAssignment } from './workoutAssignment.service';
import { buildScheduleTrace, loadEffectiveLevel, mergeWeeksWithOverride } from './clientSchedule.service';
import { findOverdueSessions } from './catchUp.service';
import { getPlanDayKeyForDate, getPlanDayPosition, getProgramWeekDates, utcDateKey } from '../utils/scheduleDate';

const NAMES: Record<string, string> = {
  push: 'INI_Push_S1/S2/S3_B_H',
  pull: 'INI_Pull_S1/S2/S3_B_H',
  legs: 'INI_Legs_S1/S2_A_H/F',
  upper: 'INI_Upper_S1/S2_A/B_H',
};
// Offsets follow the admin builder (Mon=0): S1 Mon, S2 Tue, S3 Thu, S4 Fri
const OFFSETS: Array<[string, number, string]> = [
  ['push', 0, 'mon'],
  ['pull', 1, 'tue'],
  ['legs', 3, 'thu'],
  ['upper', 4, 'fri'],
];
const id = (week: number, key: string) => `w${week}-${key}`; // ids are per week => same NAME, different template ids

function makeWeek(weekNumber: number) {
  const days: any = { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] };
  const sessions = OFFSETS.map(([key, offset, dayKey], i) => {
    days[dayKey].push({ sessionTemplateId: id(weekNumber, key), order: i });
    return { sessionTemplateId: id(weekNumber, key), sessionOrder: i + 1, recommendedDayOffset: offset };
  });
  return { weekNumber, days, sessions, minimumCompletedSessions: 4, isRestWeek: false };
}
const plan = (over: any = {}) => ({
  _id: 'plan-A',
  name: 'Initiate',
  clientDisplayName: 'Initiate',
  weeks: [1, 2, 3, 4, 5].map(makeWeek),
  ...over,
});
const assignment = (startDate: string, planId = 'plan-A') => ({
  _id: 'asg-1',
  userId: 'u1',
  levelTemplateId: planId,
  startDate: new Date(startDate),
  durationWeeks: 5,
  source: 'plan-assignment',
});
const mockLevel = (p: any) =>
  (LevelTemplate.findById as jest.Mock).mockReturnValue({ lean: () => Promise.resolve(p) } as never);
const mockOverride = (o: any) =>
  (ClientPlanOverride.findOne as jest.Mock).mockReturnValue({ lean: () => Promise.resolve(o) } as never);
function mockTemplates() {
  (SessionTemplate.find as jest.Mock).mockReturnValue({
    select: () => ({
      lean: () =>
        Promise.resolve(
          [1, 2, 3, 4, 5].flatMap((w) => Object.keys(NAMES).map((k) => ({ _id: id(w, k), title: NAMES[k] })))
        ),
    }),
  } as never);
}
function mockNoCompletions() {
  (WorkoutSession.find as jest.Mock).mockReturnValue({
    select: () => ({ lean: () => Promise.resolve([]) }),
  } as never);
}

describe('client schedule: one resolver for admin and mobile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTemplates();
    mockNoCompletions();
    mockOverride(null);
  });

  it('EVERY week 1-5 (Monday start): ids, names, order, day and date match the admin plan exactly', async () => {
    mockLevel(plan());
    (resolveWorkoutAssignment as jest.Mock).mockResolvedValue(assignment('2026-09-14T00:00:00Z') as never);
    const { rows } = await buildScheduleTrace('u1');

    expect(rows).toHaveLength(20);
    const mondays = ['2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12'];
    for (let w = 1; w <= 5; w++) {
      const weekRows = rows.filter((r) => r.weekNumber === w);
      expect(weekRows.map((r) => r.sessionOrder)).toEqual([1, 2, 3, 4]);
      expect(weekRows.map((r) => r.sessionTemplateId)).toEqual(OFFSETS.map(([k]) => id(w, k)));
      expect(weekRows.map((r) => r.sessionName)).toEqual(OFFSETS.map(([k]) => NAMES[k]));
      expect(weekRows.map((r) => r.dayKey)).toEqual(OFFSETS.map(([, , d]) => d));
      const monday = Date.parse(mondays[w - 1] + 'T00:00:00Z');
      expect(weekRows.map((r) => r.scheduledDate)).toEqual(
        OFFSETS.map(([, off]) => new Date(monday + off * 86400000).toISOString().slice(0, 10))
      );
      expect(weekRows.every((r) => r.flags.length === 0)).toBe(true);
    }
  });

  it('mobile /me/today lookup (days[weekday of date]) returns the SAME session id as the trace, for every date', async () => {
    mockLevel(plan());
    (resolveWorkoutAssignment as jest.Mock).mockResolvedValue(assignment('2026-09-14T00:00:00Z') as never);
    const { rows } = await buildScheduleTrace('u1');
    const { level } = await loadEffectiveLevel('u1', 'plan-A');
    const planStart = new Date('2026-09-14T00:00:00Z');
    for (let w = 1; w <= 5; w++) {
      for (const date of getProgramWeekDates(planStart, w)) {
        const { weekIndex } = getPlanDayPosition(date, planStart);
        expect(weekIndex + 1).toBe(w); // Admin "Week N" is Mobile "Week N"
        const week = level.weeks.find((x: any) => x.weekNumber === weekIndex + 1);
        const mobileToday = week.days[getPlanDayKeyForDate(date)][0]?.sessionTemplateId ?? null; // exact route expression
        const traced = rows.find((r) => r.scheduledDate === utcDateKey(date))?.sessionTemplateId ?? null;
        expect(mobileToday).toBe(traced);
      }
    }
  });

  it('same session NAME reused across weeks is legitimate (different template ids); a repeat inside one week is flagged, not renamed', async () => {
    const p = plan();
    p.weeks[0].days.wed.push({ sessionTemplateId: id(1, 'push'), order: 0 }); // Push twice in week 1
    mockLevel(p);
    (resolveWorkoutAssignment as jest.Mock).mockResolvedValue(assignment('2026-09-14T00:00:00Z') as never);
    const { rows } = await buildScheduleTrace('u1');
    const names = new Set(rows.map((r) => r.sessionName));
    expect(names.size).toBe(4); // names repeat across weeks
    expect(new Set(rows.map((r) => r.sessionTemplateId)).size).toBe(20); // ...but identities are distinct
    const flagged = rows.filter((r) => r.flags.includes('SAME_TEMPLATE_REPEATED_IN_WEEK'));
    expect(flagged.every((r) => r.weekNumber === 1 && r.sessionTemplateId === id(1, 'push'))).toBe(true);
    expect(rows.filter((r) => r.weekNumber === 1)).toHaveLength(5); // nothing hidden
  });

  it('client override replaces ONLY the overridden day/week; sessions[] is re-derived; other weeks untouched', async () => {
    mockLevel(plan());
    mockOverride({
      _id: 'ov1',
      status: 'active',
      baseLevelTemplateId: 'plan-A',
      overridesByWeek: [{ weekNumber: 2, days: { tue: [{ sessionTemplateId: 'w2-custom', order: 0 }] } }],
    });
    (resolveWorkoutAssignment as jest.Mock).mockResolvedValue(assignment('2026-09-14T00:00:00Z') as never);
    const { rows, effective } = await buildScheduleTrace('u1');
    expect(effective!.override).toMatchObject({ applied: true, overriddenWeeks: [2] });
    expect(rows.filter((r) => r.weekNumber === 2).map((r) => r.sessionTemplateId)).toEqual([
      'w2-push', 'w2-custom', 'w2-legs', 'w2-upper',
    ]);
    expect(rows.filter((r) => r.weekNumber === 1).map((r) => r.sessionTemplateId)).toEqual(OFFSETS.map(([k]) => id(1, k)));
    expect(rows.filter((r) => r.weekNumber === 3).map((r) => r.sessionTemplateId)).toEqual(OFFSETS.map(([k]) => id(3, k)));
  });

  it('a STALE override (client moved to another plan) never leaks into the new plan', async () => {
    mockLevel(plan({ _id: 'plan-B' }));
    mockOverride({
      _id: 'ov-old',
      status: 'active',
      baseLevelTemplateId: 'plan-A',
      overridesByWeek: [{ weekNumber: 1, days: { mon: [{ sessionTemplateId: 'old-plan-session', order: 0 }] } }],
    });
    (resolveWorkoutAssignment as jest.Mock).mockResolvedValue(assignment('2026-09-14T00:00:00Z', 'plan-B') as never);
    const { rows, effective } = await buildScheduleTrace('u1');
    expect(effective!.override).toEqual({ applied: false, reason: 'STALE_BASE_PLAN' });
    expect(rows.some((r) => r.sessionTemplateId === 'old-plan-session')).toBe(false);
    expect(rows.every((r) => r.planId === 'plan-B')).toBe(true);
  });

  it('two clients on the same template: override lookup is per user', async () => {
    mockLevel(plan());
    (ClientPlanOverride.findOne as jest.Mock).mockImplementation(((q: any) => ({
      lean: () =>
        Promise.resolve(
          q.userId === 'u2'
            ? { _id: 'ov2', status: 'active', baseLevelTemplateId: 'plan-A', overridesByWeek: [{ weekNumber: 1, days: { mon: [{ sessionTemplateId: 'u2-only', order: 0 }] } }] }
            : null
        ),
    })) as never);
    const a = await loadEffectiveLevel('u1', 'plan-A');
    const b = await loadEffectiveLevel('u2', 'plan-A');
    expect(a.level.weeks[0].days.mon[0].sessionTemplateId).toBe('w1-push');
    expect(b.level.weeks[0].days.mon[0].sessionTemplateId).toBe('u2-only');
  });

  it('order inside a day is stable: explicit `order` wins over DB insertion order', () => {
    const weeks = mergeWeeksWithOverride(
      [{ weekNumber: 1, days: { mon: [{ sessionTemplateId: 'b', order: 2 }, { sessionTemplateId: 'a', order: 1 }] } }],
      undefined
    );
    expect(weeks[0].days.mon.map((p: any) => p.sessionTemplateId)).toEqual(['a', 'b']);
  });

  it('1-week plan with 5 sessions and a 4-session week resolve independently', async () => {
    const w1: any = { weekNumber: 1, days: { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] } };
    ['mon', 'tue', 'wed', 'thu', 'fri'].forEach((d, i) => w1.days[d].push({ sessionTemplateId: `s${i}`, order: 0 }));
    mockLevel({ _id: 'plan-C', name: 'C', weeks: [w1, makeWeek(2)] });
    (resolveWorkoutAssignment as jest.Mock).mockResolvedValue({ ...assignment('2026-09-14T00:00:00Z', 'plan-C'), durationWeeks: 2 } as never);
    const { rows } = await buildScheduleTrace('u1');
    expect(rows.filter((r) => r.weekNumber === 1)).toHaveLength(5);
    expect(rows.filter((r) => r.weekNumber === 2)).toHaveLength(4);
  });

  it('mid-week start (Thursday): slots before the start are reported, never silently attached to another day', async () => {
    mockLevel(plan());
    (resolveWorkoutAssignment as jest.Mock).mockResolvedValue(assignment('2026-09-17T00:00:00Z') as never); // Thursday
    const { rows } = await buildScheduleTrace('u1');
    const w1 = rows.filter((r) => r.weekNumber === 1);
    expect(w1.filter((r) => r.scheduledDate === null).map((r) => r.sessionOrder)).toEqual([1, 2]); // Mon/Tue slots
    expect(w1.find((r) => r.sessionOrder === 3)!.scheduledDate).toBe('2026-09-17'); // Thu keeps Legs
    expect(w1.find((r) => r.sessionOrder === 4)!.scheduledDate).toBe('2026-09-18');
    expect(rows.filter((r) => r.weekNumber === 2).map((r) => r.scheduledDate)).toEqual([
      '2026-09-21', '2026-09-22', '2026-09-24', '2026-09-25',
    ]);
  });
});

describe('regression: client starting Tuesday 22 Sep (screenshots), Week 4 = 12-18 Oct', () => {
  it('admin Week 4 (Push J0, Pull J1, Legs J3, UpperC J4) lands Mon/Tue/Thu/Fri 12/13/15/16 Oct; Wed/Sat/Sun are rest', async () => {
    mockTemplates();
    mockNoCompletions();
    mockOverride(null);
    mockLevel(plan());
    (resolveWorkoutAssignment as jest.Mock).mockResolvedValue(assignment('2026-09-22T00:00:00Z') as never);
    const { rows } = await buildScheduleTrace('u1');
    const w4 = rows.filter((r) => r.weekNumber === 4);
    expect(w4.map((r) => [r.scheduledDate, r.sessionName])).toEqual([
      ['2026-10-12', NAMES.push],
      ['2026-10-13', NAMES.pull],
      ['2026-10-15', NAMES.legs],
      ['2026-10-16', NAMES.upper],
    ]);
    // the old relative formula (planStart + 7*week + idx) put Push on 13 Oct, Pull on 14, Legs on 16, UpperC on 17
    expect(w4.find((r) => r.scheduledDate === '2026-10-13')!.sessionName).toBe(NAMES.pull);
  });
});

describe('Europe/Tunis day boundary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNoCompletions();
  });
  const planStart = new Date('2026-09-14T00:00:00Z');

  it('23:30Z on Sunday is already Monday 00:30 in Tunis -> week 2, day 0', () => {
    const p = getPlanDayPosition(new Date('2026-09-20T23:30:00Z'), planStart);
    expect(p).toMatchObject({ weekIndex: 1, dayIndex: 0 });
    // an instant 1h earlier is still Sunday of week 1 in Tunis
    expect(getPlanDayPosition(new Date('2026-09-20T22:30:00Z'), planStart)).toMatchObject({ weekIndex: 0, dayIndex: 6 });
  });

  it('calendar dates stored as UTC midnight (the ?date= param) keep their own day', () => {
    expect(getPlanDayPosition(new Date('2026-09-21T00:00:00Z'), planStart)).toMatchObject({ weekIndex: 1, dayIndex: 0 });
    expect(getPlanDayPosition(new Date('2026-09-20T00:00:00Z'), planStart)).toMatchObject({ weekIndex: 0, dayIndex: 6 });
  });

  it("rattrapage: Thursday's session is overdue from 00:00 Tunis Friday (Thu 23:00Z), not from 00:00Z", async () => {
    const level = { weeks: [makeWeek(1)] } as any;
    const thursdayEvening = new Date('2026-09-17T22:30:00Z'); // still Thursday 23:30 in Tunis
    const fridayTunisMidnight = new Date('2026-09-17T23:30:00Z'); // Friday 00:30 in Tunis
    const base = { userId: 'u1', levelDoc: level, planStart, durationWeeks: 1 };
    const evening = await findOverdueSessions({ ...base, now: thursdayEvening });
    expect(evening.map((o) => o.originalDate)).toEqual(['2026-09-14', '2026-09-15']); // Mon, Tue only
    const after = await findOverdueSessions({ ...base, now: fridayTunisMidnight });
    expect(after.map((o) => o.originalDate)).toEqual(['2026-09-14', '2026-09-15', '2026-09-17']); // Thursday now missed
  });
});
