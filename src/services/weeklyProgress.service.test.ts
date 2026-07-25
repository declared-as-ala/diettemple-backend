/**
 * Tests for weeklyProgress.service.ts's pure status-derivation logic.
 * ✅ NO DATABASE REQUIRED - Pure unit tests (calculateTrainingWeekProgress itself needs
 * Mongoose models and is exercised indirectly via the /me/plan/week route in practice).
 */
import { describe, it, expect } from '@jest/globals';
import { deriveWeekStatus } from './weeklyProgress.service';

describe('weeklyProgress.service - deriveWeekStatus', () => {
  const weekStart = new Date('2026-07-29T00:00:00.000Z');
  const weekEnd = new Date('2026-08-05T00:00:00.000Z'); // exclusive
  const catchUpDeadline = new Date(weekEnd.getTime() + 48 * 60 * 60 * 1000);

  it('is UPCOMING before the week starts', () => {
    const status = deriveWeekStatus({
      isRestWeek: false,
      now: new Date('2026-07-20T00:00:00.000Z'),
      weekStart,
      weekEnd,
      catchUpDeadline,
      minimumRequired: 2,
      onTimeCount: 0,
      totalCount: 0,
    });
    expect(status).toBe('UPCOMING');
  });

  it('is IN_PROGRESS during the week, regardless of completions so far', () => {
    const status = deriveWeekStatus({
      isRestWeek: false,
      now: new Date('2026-07-30T00:00:00.000Z'),
      weekStart,
      weekEnd,
      catchUpDeadline,
      minimumRequired: 2,
      onTimeCount: 1,
      totalCount: 1,
    });
    expect(status).toBe('IN_PROGRESS');
  });

  it('3 planned, minimum 2: 0/3 completed by week end -> not PASSED (CATCH_UP, window still open)', () => {
    const status = deriveWeekStatus({
      isRestWeek: false,
      now: new Date(weekEnd.getTime() + 1),
      weekStart,
      weekEnd,
      catchUpDeadline,
      minimumRequired: 2,
      onTimeCount: 0,
      totalCount: 0,
    });
    expect(status).toBe('CATCH_UP');
  });

  it('3 planned, minimum 2: 1/3 completed on time by week end -> CATCH_UP (below minimum, window open)', () => {
    const status = deriveWeekStatus({
      isRestWeek: false,
      now: new Date(weekEnd.getTime() + 1),
      weekStart,
      weekEnd,
      catchUpDeadline,
      minimumRequired: 2,
      onTimeCount: 1,
      totalCount: 1,
    });
    expect(status).toBe('CATCH_UP');
  });

  it('3 planned, minimum 2: 2/3 completed on time -> PASSED', () => {
    const status = deriveWeekStatus({
      isRestWeek: false,
      now: new Date(weekEnd.getTime() + 1),
      weekStart,
      weekEnd,
      catchUpDeadline,
      minimumRequired: 2,
      onTimeCount: 2,
      totalCount: 2,
    });
    expect(status).toBe('PASSED');
  });

  it('3 planned, minimum 2: 3/3 completed on time -> PASSED', () => {
    const status = deriveWeekStatus({
      isRestWeek: false,
      now: new Date(weekEnd.getTime() + 1),
      weekStart,
      weekEnd,
      catchUpDeadline,
      minimumRequired: 2,
      onTimeCount: 3,
      totalCount: 3,
    });
    expect(status).toBe('PASSED');
  });

  it('minimum reached only via a catch-up completion after week end -> PASSED_LATE', () => {
    const status = deriveWeekStatus({
      isRestWeek: false,
      now: new Date(weekEnd.getTime() + 10 * 60 * 60 * 1000),
      weekStart,
      weekEnd,
      catchUpDeadline,
      minimumRequired: 2,
      onTimeCount: 1, // only 1 completed on time
      totalCount: 2, // 2nd came in via catch-up
    });
    expect(status).toBe('PASSED_LATE');
  });

  it('catch-up window expires below minimum -> FAILED', () => {
    const status = deriveWeekStatus({
      isRestWeek: false,
      now: new Date(catchUpDeadline.getTime() + 1),
      weekStart,
      weekEnd,
      catchUpDeadline,
      minimumRequired: 2,
      onTimeCount: 1,
      totalCount: 1,
    });
    expect(status).toBe('FAILED');
  });

  it('a rest week is always REST_WEEK, even with zero completions', () => {
    const status = deriveWeekStatus({
      isRestWeek: true,
      now: new Date(weekEnd.getTime() + 1),
      weekStart,
      weekEnd,
      catchUpDeadline,
      minimumRequired: 0,
      onTimeCount: 0,
      totalCount: 0,
    });
    expect(status).toBe('REST_WEEK');
  });
});
