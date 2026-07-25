/**
 * Tests for scheduleDate.ts — relative-cycle week/day arithmetic.
 * ✅ NO DATABASE REQUIRED - Pure unit tests
 */
import { describe, it, expect } from '@jest/globals';
import {
  getPlanDayPosition,
  getWeekWindow,
  legacyDayKeyFromOffset,
  utcDateKey,
  utcStartOfCalendarDate,
  addDaysUtc,
} from './scheduleDate';

describe('scheduleDate - relative-cycle arithmetic', () => {
  describe('getPlanDayPosition', () => {
    it('client starting on a Monday: day 0 is that Monday', () => {
      const planStart = new Date('2026-07-27T00:00:00.000Z'); // a Monday
      const { diffDays, weekIndex, dayIndex } = getPlanDayPosition(planStart, planStart);
      expect(diffDays).toBe(0);
      expect(weekIndex).toBe(0);
      expect(dayIndex).toBe(0);
    });

    it('client starting on a Wednesday: session 1 (offset 0) lands on that Wednesday', () => {
      const planStart = new Date('2026-07-29T00:00:00.000Z'); // a Wednesday
      const { weekIndex, dayIndex } = getPlanDayPosition(planStart, planStart);
      expect(weekIndex).toBe(0);
      expect(dayIndex).toBe(0);
    });

    it('client starting on a Sunday: day 2 (offset 2) is the following Tuesday', () => {
      const planStart = new Date('2026-08-02T00:00:00.000Z'); // a Sunday
      const target = addDaysUtc(planStart, 2);
      const { weekIndex, dayIndex } = getPlanDayPosition(target, planStart);
      expect(weekIndex).toBe(0);
      expect(dayIndex).toBe(2);
      expect(utcDateKey(target)).toBe('2026-08-04'); // Tuesday
    });

    it('week 2 starts exactly 7 days after week 1, regardless of the start weekday', () => {
      const planStart = new Date('2026-07-29T00:00:00.000Z'); // Wednesday
      const week2Day0 = addDaysUtc(planStart, 7);
      const { weekIndex, dayIndex } = getPlanDayPosition(week2Day0, planStart);
      expect(weekIndex).toBe(1);
      expect(dayIndex).toBe(0);
    });

    it('handles negative diffDays for a target before planStart', () => {
      const planStart = new Date('2026-07-29T00:00:00.000Z');
      const target = addDaysUtc(planStart, -1);
      const { diffDays, weekIndex, dayIndex } = getPlanDayPosition(target, planStart);
      expect(diffDays).toBe(-1);
      expect(weekIndex).toBe(-1);
      expect(dayIndex).toBe(6); // wraps to the last slot of the "previous" week
    });
  });

  describe('getWeekWindow', () => {
    it('week 1 window for a Wednesday start is [Wed, next Wed)', () => {
      const planStart = new Date('2026-07-29T00:00:00.000Z'); // Wednesday
      const { weekStart, weekEnd } = getWeekWindow(planStart, 1);
      expect(utcDateKey(weekStart)).toBe('2026-07-29');
      expect(utcDateKey(weekEnd)).toBe('2026-08-05'); // exclusive upper bound
    });

    it('week 2 window follows immediately after week 1, no gap/overlap', () => {
      const planStart = new Date('2026-07-29T00:00:00.000Z');
      const week1 = getWeekWindow(planStart, 1);
      const week2 = getWeekWindow(planStart, 2);
      expect(week2.weekStart.getTime()).toBe(week1.weekEnd.getTime());
    });

    it('never forces a week to start on a real Monday', () => {
      const planStart = new Date('2026-08-02T00:00:00.000Z'); // Sunday
      const { weekStart } = getWeekWindow(planStart, 3);
      // Week 3 starts 14 days after a Sunday start -> still a Sunday, not a Monday.
      expect(weekStart.getUTCDay()).toBe(0);
    });
  });

  describe('legacyDayKeyFromOffset', () => {
    it('maps offset 0/2/4 to mon/wed/fri (spec example: Mon/Wed/Fri -> 0/2/4)', () => {
      expect(legacyDayKeyFromOffset(0)).toBe('mon');
      expect(legacyDayKeyFromOffset(2)).toBe('wed');
      expect(legacyDayKeyFromOffset(4)).toBe('fri');
    });

    it('wraps offsets outside 0-6', () => {
      expect(legacyDayKeyFromOffset(7)).toBe('mon');
      expect(legacyDayKeyFromOffset(-1)).toBe('sun');
    });
  });

  describe('utcStartOfCalendarDate / utcDateKey', () => {
    it('strips time-of-day and formats as YYYY-MM-DD', () => {
      const d = new Date('2026-07-29T15:42:10.123Z');
      expect(utcDateKey(new Date(utcStartOfCalendarDate(d)))).toBe('2026-07-29');
    });
  });
});
