/**
 * Tests for scheduleDate.ts — DietTemple program week calendar arithmetic.
 * ✅ NO DATABASE REQUIRED - Pure unit tests
 *
 * Rules:
 * - Week 1: Starts on planStart and ends on the following Sunday.
 * - Weeks 2..N: Always start on Monday and run Mon-Sun (7 days).
 */
import { describe, it, expect } from '@jest/globals';
import {
  getPlanDayPosition,
  getWeekWindow,
  getProgramWeekDates,
  getDateForWeekDay,
  tunisiaDateKey,
  legacyDayKeyFromOffset,
  utcDateKey,
  utcStartOfCalendarDate,
  addDaysUtc,
} from './scheduleDate';

describe('scheduleDate - Program Week Calendar Arithmetic', () => {
  // Friday 18 September 2026 (User Example from spec)
  const fridayStart = new Date('2026-09-18T00:00:00.000Z');

  describe('Scenario F: Program starts Friday 18 September', () => {
    it('Week 1 displays ONLY Friday, Saturday, Sunday (3 days)', () => {
      const dates = getProgramWeekDates(fridayStart, 1);
      expect(dates.length).toBe(3);
      expect(utcDateKey(dates[0])).toBe('2026-09-18'); // Friday
      expect(utcDateKey(dates[1])).toBe('2026-09-19'); // Saturday
      expect(utcDateKey(dates[2])).toBe('2026-09-20'); // Sunday
    });

    it('Week 2 starts on Monday 21 September and runs for 7 days', () => {
      const dates = getProgramWeekDates(fridayStart, 2);
      expect(dates.length).toBe(7);
      expect(utcDateKey(dates[0])).toBe('2026-09-21'); // Monday
      expect(utcDateKey(dates[1])).toBe('2026-09-22'); // Tuesday
      expect(utcDateKey(dates[2])).toBe('2026-09-23'); // Wednesday
      expect(utcDateKey(dates[3])).toBe('2026-09-24'); // Thursday
      expect(utcDateKey(dates[4])).toBe('2026-09-25'); // Friday
      expect(utcDateKey(dates[5])).toBe('2026-09-26'); // Saturday
      expect(utcDateKey(dates[6])).toBe('2026-09-27'); // Sunday
    });

    it('Week 3 starts on Monday 28 September and runs for 7 days', () => {
      const dates = getProgramWeekDates(fridayStart, 3);
      expect(dates.length).toBe(7);
      expect(utcDateKey(dates[0])).toBe('2026-09-28'); // Monday
      expect(utcDateKey(dates[6])).toBe('2026-10-04'); // Sunday
    });
  });

  describe('getDateForWeekDay allocation', () => {
    it('Week 1: days before start date (Mon-Thu) return null', () => {
      expect(getDateForWeekDay(fridayStart, 1, 'mon')).toBeNull();
      expect(getDateForWeekDay(fridayStart, 1, 'tue')).toBeNull();
      expect(getDateForWeekDay(fridayStart, 1, 'wed')).toBeNull();
      expect(getDateForWeekDay(fridayStart, 1, 'thu')).toBeNull();
    });

    it('Week 1: days from Friday to Sunday return exact dates', () => {
      const fri = getDateForWeekDay(fridayStart, 1, 'fri');
      expect(fri).not.toBeNull();
      expect(utcDateKey(fri!)).toBe('2026-09-18');

      const sun = getDateForWeekDay(fridayStart, 1, 'sun');
      expect(sun).not.toBeNull();
      expect(utcDateKey(sun!)).toBe('2026-09-20');
    });

    it('Week 2: all 7 days from Monday to Sunday return exact dates', () => {
      const mon = getDateForWeekDay(fridayStart, 2, 'mon');
      expect(mon).not.toBeNull();
      expect(utcDateKey(mon!)).toBe('2026-09-21');

      const sun = getDateForWeekDay(fridayStart, 2, 'sun');
      expect(sun).not.toBeNull();
      expect(utcDateKey(sun!)).toBe('2026-09-27');
    });
  });

  describe('getPlanDayPosition', () => {
    it('target on Friday 18 is weekIndex 0 (Week 1), dayIndex 0', () => {
      const { weekIndex, dayIndex } = getPlanDayPosition(fridayStart, fridayStart);
      expect(weekIndex).toBe(0);
      expect(dayIndex).toBe(0);
    });

    it('target on Sunday 20 is weekIndex 0 (Week 1), dayIndex 2', () => {
      const sun = new Date('2026-09-20T00:00:00.000Z');
      const { weekIndex, dayIndex } = getPlanDayPosition(sun, fridayStart);
      expect(weekIndex).toBe(0);
      expect(dayIndex).toBe(2);
    });

    it('target on Monday 21 enters Week 2 (weekIndex 1), dayIndex 0', () => {
      const mon = new Date('2026-09-21T00:00:00.000Z');
      const { weekIndex, dayIndex } = getPlanDayPosition(mon, fridayStart);
      expect(weekIndex).toBe(1);
      expect(dayIndex).toBe(0);
    });

    it('target before program start returns weekIndex -1', () => {
      const thu = new Date('2026-09-17T00:00:00.000Z');
      const { weekIndex } = getPlanDayPosition(thu, fridayStart);
      expect(weekIndex).toBe(-1);
    });
  });

  describe('getWeekWindow', () => {
    it('Week 1 window is [Friday, following Monday)', () => {
      const { weekStart, weekEnd } = getWeekWindow(fridayStart, 1);
      expect(utcDateKey(weekStart)).toBe('2026-09-18');
      expect(utcDateKey(weekEnd)).toBe('2026-09-21');
    });

    it('Week 2 window is [Monday, following Monday)', () => {
      const { weekStart, weekEnd } = getWeekWindow(fridayStart, 2);
      expect(utcDateKey(weekStart)).toBe('2026-09-21');
      expect(utcDateKey(weekEnd)).toBe('2026-09-28');
    });
  });

  describe('tunisiaDateKey', () => {
    it('formats date correctly in Tunisia UTC+1', () => {
      // 23:30 UTC on Sept 17 is 00:30 on Sept 18 in Tunisia
      const lateUtc = new Date('2026-09-17T23:30:00.000Z');
      expect(tunisiaDateKey(lateUtc)).toBe('2026-09-18');
    });
  });
});
