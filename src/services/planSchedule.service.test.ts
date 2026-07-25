/**
 * Tests for planSchedule.service.ts — ordered-session resolution and status machine.
 * ✅ NO DATABASE REQUIRED - Pure unit tests
 */
import { describe, it, expect } from '@jest/globals';
import {
  resolveWeekSessions,
  computeSessionSchedule,
  computeSessionStatus,
  getCurrentWeekNumber,
} from './planSchedule.service';
import { addDaysUtc, utcDateKey } from '../utils/scheduleDate';

describe('planSchedule.service', () => {
  describe('resolveWeekSessions', () => {
    it('uses week.sessions when already populated, sorted by sessionOrder', () => {
      const week: any = {
        weekNumber: 1,
        days: {},
        sessions: [
          { sessionTemplateId: 'B', sessionOrder: 2, recommendedDayOffset: 2 },
          { sessionTemplateId: 'A', sessionOrder: 1, recommendedDayOffset: 0 },
        ],
      };
      const result = resolveWeekSessions(week);
      expect(result.map((s) => s.sessionTemplateId)).toEqual(['A', 'B']);
    });

    it('derives sessions from legacy days{} when sessions[] is absent (spec §14 example: Mon/Wed/Fri -> offsets 0/2/4)', () => {
      const week: any = {
        weekNumber: 1,
        days: {
          mon: [{ sessionTemplateId: 'S1' }],
          tue: [],
          wed: [{ sessionTemplateId: 'S2' }],
          thu: [],
          fri: [{ sessionTemplateId: 'S3' }],
          sat: [],
          sun: [],
        },
      };
      const result = resolveWeekSessions(week);
      expect(result).toEqual([
        { sessionTemplateId: 'S1', sessionOrder: 1, recommendedDayOffset: 0 },
        { sessionTemplateId: 'S2', sessionOrder: 2, recommendedDayOffset: 2 },
        { sessionTemplateId: 'S3', sessionOrder: 3, recommendedDayOffset: 4 },
      ]);
    });

    it('returns an empty array for a rest week with no sessions', () => {
      const week: any = { weekNumber: 2, days: { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] } };
      expect(resolveWeekSessions(week)).toEqual([]);
    });

    it('handles a null/undefined week', () => {
      expect(resolveWeekSessions(null)).toEqual([]);
      expect(resolveWeekSessions(undefined)).toEqual([]);
    });
  });

  describe('computeSessionSchedule', () => {
    it('recommends session 1 (offset 0) on the exact plan start date for a Wednesday start', () => {
      const planStart = new Date('2026-07-29T00:00:00.000Z'); // Wednesday
      const { recommendedAt } = computeSessionSchedule(planStart, 1, { recommendedDayOffset: 0 });
      expect(utcDateKey(recommendedAt)).toBe('2026-07-29');
    });

    it('recommends session 2 (offset 2) two days later, regardless of weekday name', () => {
      const planStart = new Date('2026-07-29T00:00:00.000Z'); // Wednesday
      const { recommendedAt } = computeSessionSchedule(planStart, 1, { recommendedDayOffset: 2 });
      expect(utcDateKey(recommendedAt)).toBe('2026-07-31'); // Friday
    });

    it('dueAt respects catchUpWindowHours', () => {
      const planStart = new Date('2026-07-29T00:00:00.000Z');
      const { recommendedAt, dueAt } = computeSessionSchedule(
        planStart,
        1,
        { recommendedDayOffset: 0 },
        { catchUpWindowHours: 48 }
      );
      expect(dueAt.getTime() - recommendedAt.getTime()).toBe(48 * 60 * 60 * 1000);
    });
  });

  describe('computeSessionStatus', () => {
    const recommendedAt = new Date('2026-07-29T00:00:00.000Z');
    const dueAt = new Date(recommendedAt.getTime() + 48 * 60 * 60 * 1000);

    it('is UPCOMING before the recommended date', () => {
      const now = addDaysUtc(recommendedAt, -1);
      expect(computeSessionStatus({ recommendedAt, dueAt, now, isCompleted: false })).toBe('UPCOMING');
    });

    it('is AVAILABLE on the recommended day when incomplete', () => {
      const now = new Date(recommendedAt.getTime() + 3 * 60 * 60 * 1000);
      expect(computeSessionStatus({ recommendedAt, dueAt, now, isCompleted: false })).toBe('AVAILABLE');
    });

    it('becomes OVERDUE once the recommended day has passed and still incomplete', () => {
      const now = addDaysUtc(recommendedAt, 1);
      expect(computeSessionStatus({ recommendedAt, dueAt, now, isCompleted: false })).toBe('OVERDUE');
    });

    it('becomes MISSED once the catch-up window (dueAt) has expired', () => {
      const now = new Date(dueAt.getTime() + 1);
      expect(computeSessionStatus({ recommendedAt, dueAt, now, isCompleted: false })).toBe('MISSED');
    });

    it('is COMPLETED regardless of timing once marked complete', () => {
      const now = new Date(dueAt.getTime() + 1000);
      expect(computeSessionStatus({ recommendedAt, dueAt, now, isCompleted: true })).toBe('COMPLETED');
    });

    it('respects SKIPPED/EXCUSED coach overrides', () => {
      const now = addDaysUtc(recommendedAt, 1);
      expect(computeSessionStatus({ recommendedAt, dueAt, now, isCompleted: false, isSkipped: true })).toBe('SKIPPED');
      expect(computeSessionStatus({ recommendedAt, dueAt, now, isCompleted: false, isExcused: true })).toBe('EXCUSED');
    });

    it('stays UPCOMING instead of AVAILABLE when the minimum rest period has not elapsed', () => {
      const now = new Date(recommendedAt.getTime() + 2 * 60 * 60 * 1000);
      const lastCompletedAt = new Date(recommendedAt.getTime() - 6 * 60 * 60 * 1000); // 6h before recommendedAt
      const status = computeSessionStatus({
        recommendedAt,
        dueAt,
        now,
        isCompleted: false,
        lastCompletedAt,
        minimumRestHoursBetweenSessions: 24,
      });
      expect(status).toBe('UPCOMING');
    });

    it('is AVAILABLE once the rest period has elapsed', () => {
      const now = new Date(recommendedAt.getTime() + 2 * 60 * 60 * 1000);
      const lastCompletedAt = new Date(recommendedAt.getTime() - 25 * 60 * 60 * 1000); // 25h before
      const status = computeSessionStatus({
        recommendedAt,
        dueAt,
        now,
        isCompleted: false,
        lastCompletedAt,
        minimumRestHoursBetweenSessions: 24,
      });
      expect(status).toBe('AVAILABLE');
    });
  });

  describe('getCurrentWeekNumber', () => {
    it('clamps to [1, durationWeeks]', () => {
      const planStart = new Date('2026-07-29T00:00:00.000Z');
      expect(getCurrentWeekNumber(planStart, 5, addDaysUtc(planStart, -3))).toBe(1);
      expect(getCurrentWeekNumber(planStart, 5, addDaysUtc(planStart, 3))).toBe(1);
      expect(getCurrentWeekNumber(planStart, 5, addDaysUtc(planStart, 8))).toBe(2);
      expect(getCurrentWeekNumber(planStart, 5, addDaysUtc(planStart, 999))).toBe(5);
    });
  });
});
