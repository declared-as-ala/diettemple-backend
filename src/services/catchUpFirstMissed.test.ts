/**
 * Rattrapage rule: the server picks ONE session — the first missed one of the CURRENT week in
 * program order. Requests for any other session are rejected; nothing carries to the next week.
 */
jest.mock('../models/WorkoutSession.model', () => ({
  __esModule: true,
  default: { find: jest.fn(), findOne: jest.fn() },
}));

import { describe, it, expect, beforeEach } from '@jest/globals';
import WorkoutSession from '../models/WorkoutSession.model';
import { findOverdueSessions, findMostRecentOverdueSession, matchesEligibleRattrapage } from './catchUp.service';

const userId = 'u1';
const planStart = new Date('2026-09-14T00:00:00.000Z'); // Monday
const levelDoc: any = {
  catchUpWindowHours: 48,
  weeks: [1, 2].map((n) => ({
    weekNumber: n,
    days: {
      mon: [{ sessionTemplateId: `w${n}s1` }],
      tue: [{ sessionTemplateId: `w${n}s2` }],
      wed: [{ sessionTemplateId: `w${n}s3` }],
      thu: [{ sessionTemplateId: `w${n}s4` }],
    },
  })),
};
const done = (sessionId: string, day: string) => ({ sessionId, date: new Date(`2026-09-${day}T10:00:00.000Z`) });
const mock = (list: any[]) =>
  (WorkoutSession.find as jest.Mock).mockReturnValue({
    select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(list) }),
  });
const first = (now: string) =>
  findMostRecentOverdueSession({ userId, levelDoc, planStart, durationWeeks: 2, now: new Date(now) });

describe('first-missed-session rattrapage', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('1 missed -> that session', async () => {
    mock([]);
    expect((await first('2026-09-15T12:00:00Z'))?.sessionTemplateId).toBe('w1s1');
  });
  it('3 missed -> only S1 is actionable', async () => {
    mock([]);
    expect((await first('2026-09-18T12:00:00Z'))?.sessionTemplateId).toBe('w1s1');
  });
  it('4 missed -> only S1', async () => {
    mock([]);
    expect((await first('2026-09-19T12:00:00Z'))?.sessionTemplateId).toBe('w1s1');
  });
  it('S1 missed, S2 done, S3 missed -> S1', async () => {
    mock([done('w1s2', '15')]);
    expect((await first('2026-09-17T12:00:00Z'))?.sessionTemplateId).toBe('w1s1');
  });
  it('S1 done, S2 + S3 missed -> S2', async () => {
    mock([done('w1s1', '14')]);
    expect((await first('2026-09-18T12:00:00Z'))?.sessionTemplateId).toBe('w1s2');
  });
  it('non-consecutive S1, S3 missed -> S1, never S3', async () => {
    mock([done('w1s2', '15'), done('w1s4', '17')]);
    const all = await findOverdueSessions({ userId, levelDoc, planStart, durationWeeks: 2, now: new Date('2026-09-18T12:00:00Z') });
    expect(all.map((o) => o.sessionTemplateId)).toEqual(['w1s1', 'w1s3']);
    expect((await first('2026-09-18T12:00:00Z'))?.sessionTemplateId).toBe('w1s1');
  });
  it('week 1 -> week 2: week 1 rattrapage disappears, week 2 computed from week 2 only', async () => {
    mock([]);
    const w2 = await findOverdueSessions({ userId, levelDoc, planStart, durationWeeks: 2, now: new Date('2026-09-21T12:00:00Z') });
    expect(w2).toEqual([]); // Monday of week 2: nothing past yet, no week-1 carry-over
    const w2later = await findOverdueSessions({ userId, levelDoc, planStart, durationWeeks: 2, now: new Date('2026-09-23T12:00:00Z') });
    expect(w2later.every((o) => o.weekNumber === 2)).toBe(true);
    expect(w2later[0].sessionTemplateId).toBe('w2s1');
  });

  describe('request validation', () => {
    it('accepts only the eligible session/date', async () => {
      mock([]);
      const eligible = await first('2026-09-18T12:00:00Z');
      expect(matchesEligibleRattrapage(eligible, 'w1s1', '2026-09-14')).toBe(true);
      expect(matchesEligibleRattrapage(eligible, 'w1s3', '2026-09-16')).toBe(false);
      expect(matchesEligibleRattrapage(eligible, 'w1s1', '2026-09-16')).toBe(false);
      expect(matchesEligibleRattrapage(null, 'w1s1')).toBe(false);
    });
  });
});
