/**
 * Canonical date/schedule arithmetic for DietTemple program weeks:
 *
 * - Week 1: Starts on PlanAssignment.startDate and ends on the following Sunday (inclusive).
 *   Example: If planStart is Friday 18 Sept, Week 1 displays only: Fri 18, Sat 19, Sun 20 (3 days).
 *   Dates before planStart (Mon 14 - Thu 17) are never displayed and have no fabricated sessions.
 * - Weeks 2, 3, 4, 5: Always start on Monday and end on Sunday (7 days each).
 *   Week 2 starts on the Monday immediately following Week 1's Sunday.
 */

export const MS_PER_DAY = 24 * 60 * 60 * 1000;
export const PLAN_DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type PlanDayKey = (typeof PLAN_DAY_KEYS)[number];

const DOW_TO_PLAN_KEY: Record<number, PlanDayKey> = {
  0: 'sun',
  1: 'mon',
  2: 'tue',
  3: 'wed',
  4: 'thu',
  5: 'fri',
  6: 'sat',
};

/** Start-of-UTC-calendar-day, in ms since epoch. */
export function utcStartOfCalendarDate(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** YYYY-MM-DD from UTC calendar parts. */
export function utcDateKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Converts a Date to YYYY-MM-DD in Tunisia timezone (UTC+1, no DST). */
export function tunisiaDateKey(d: Date): string {
  // Tunisia is UTC+1 year-round.
  const tunisiaMs = d.getTime() + 1 * 60 * 60 * 1000;
  const td = new Date(tunisiaMs);
  const y = td.getUTCFullYear();
  const m = String(td.getUTCMonth() + 1).padStart(2, '0');
  const day = String(td.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDaysUtc(msOrDate: number | Date, days: number): Date {
  const startMs = typeof msOrDate === 'number' ? msOrDate : utcStartOfCalendarDate(msOrDate);
  return new Date(startMs + days * MS_PER_DAY);
}

export function diffDaysUtc(target: Date, from: Date): number {
  return Math.floor((utcStartOfCalendarDate(target) - utcStartOfCalendarDate(from)) / MS_PER_DAY);
}

/** Get the weekday key ('mon'..'sun') for a given UTC calendar date. */
export function getPlanDayKeyForDate(d: Date): PlanDayKey {
  const dow = new Date(utcStartOfCalendarDate(d)).getUTCDay();
  return DOW_TO_PLAN_KEY[dow];
}

/**
 * Calculates the calendar boundaries for Week 1 (partial, ending on Sunday)
 * and subsequent weeks (Monday to Sunday, 7 days).
 */
export function getProgramWeekInfo(planStart: Date) {
  const startMs = utcStartOfCalendarDate(planStart);
  const startDow = new Date(startMs).getUTCDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  // Days until Sunday inclusive: Sunday -> 0 days offset, Mon -> 6 days, Fri -> 2 days
  const daysUntilSunday = (7 - (startDow === 0 ? 7 : startDow));
  const week1SundayMs = startMs + daysUntilSunday * MS_PER_DAY;
  const week2MondayMs = week1SundayMs + MS_PER_DAY;
  const week1DaysCount = daysUntilSunday + 1;

  return {
    startMs,
    week1SundayMs,
    week2MondayMs,
    week1DaysCount,
  };
}

/**
 * Returns the [weekStart, weekEnd) window for `weekNumber` (1-indexed).
 * - Week 1: [planStart, week1Sunday + 1 day)
 * - Week 2..N: [week2Monday + (weekNumber - 2) * 7 days, + 7 days)
 */
export function getWeekWindow(planStart: Date, weekNumber: number): { weekStart: Date; weekEnd: Date } {
  const { startMs, week1SundayMs, week2MondayMs } = getProgramWeekInfo(planStart);
  if (weekNumber <= 1) {
    return {
      weekStart: new Date(startMs),
      weekEnd: new Date(week1SundayMs + MS_PER_DAY),
    };
  }
  const offsetWeeks = weekNumber - 2;
  const weekStartMs = week2MondayMs + offsetWeeks * 7 * MS_PER_DAY;
  const weekEndMs = weekStartMs + 7 * MS_PER_DAY;
  return {
    weekStart: new Date(weekStartMs),
    weekEnd: new Date(weekEndMs),
  };
}

/**
 * Returns the array of UTC dates for `weekNumber` (1-indexed).
 * - Week 1: only dates from planStart through the following Sunday.
 * - Week 2..N: 7 dates (Monday through Sunday).
 */
export function getProgramWeekDates(planStart: Date, weekNumber: number): Date[] {
  const { weekStart, weekEnd } = getWeekWindow(planStart, weekNumber);
  const dates: Date[] = [];
  let curMs = utcStartOfCalendarDate(weekStart);
  const endMs = utcStartOfCalendarDate(weekEnd);
  while (curMs < endMs) {
    dates.push(new Date(curMs));
    curMs += MS_PER_DAY;
  }
  return dates;
}

/**
 * Position of `target` relative to program weeks:
 * Returns { weekIndex (0-indexed), dayIndex (within this week's dates), isBeforePlan: boolean }
 */
export function getPlanDayPosition(
  target: Date,
  planStart: Date
): { diffDays: number; weekIndex: number; dayIndex: number } {
  const { startMs, week1SundayMs, week2MondayMs } = getProgramWeekInfo(planStart);
  const targetMs = utcStartOfCalendarDate(target);
  const diffDays = Math.floor((targetMs - startMs) / MS_PER_DAY);

  if (targetMs < startMs) {
    return { diffDays, weekIndex: -1, dayIndex: 0 };
  }

  if (targetMs <= week1SundayMs) {
    // Falls in Week 1
    const dayIndex = Math.floor((targetMs - startMs) / MS_PER_DAY);
    return { diffDays, weekIndex: 0, dayIndex };
  }

  // Week 2 or later (Monday-anchored)
  const diffFromWeek2 = Math.floor((targetMs - week2MondayMs) / MS_PER_DAY);
  const week2Offset = Math.floor(diffFromWeek2 / 7);
  const weekIndex = 1 + week2Offset;
  const dayIndex = ((diffFromWeek2 % 7) + 7) % 7; // 0 = Mon, ..., 6 = Sun
  return { diffDays, weekIndex, dayIndex };
}

/** Maps a 0-6 day offset (within a 7-day Monday-start week) onto the legacy positional day key (0 = mon). */
export function legacyDayKeyFromOffset(offset: number): PlanDayKey {
  const idx = ((offset % 7) + 7) % 7;
  return PLAN_DAY_KEYS[idx];
}

/** Normalize a Date to UTC midnight (strips time-of-day). */
export function normalizeToUtcMidnight(raw: Date): Date {
  const d = new Date(raw);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Returns the calendar Date for a given week day in a program week, or null if that day
 * falls before planStart in Week 1.
 */
export function getDateForWeekDay(planStart: Date, weekNumber: number, dayKey: PlanDayKey): Date | null {
  const dates = getProgramWeekDates(planStart, weekNumber);
  return dates.find((d) => getPlanDayKeyForDate(d) === dayKey) ?? null;
}

