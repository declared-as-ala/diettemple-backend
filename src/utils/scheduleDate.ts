/**
 * Canonical date/schedule arithmetic for the relative training-cycle model.
 *
 * Every "week" boundary in the app is anchored to PlanAssignment.startDate,
 * NOT to a real calendar Monday. All day boundaries use UTC calendar days —
 * this matches the pre-existing convention in me.routes.ts (/me/today,
 * /me/plan/week) so behavior for those endpoints is unchanged, and Tunisia
 * (UTC+1, no DST) differs from UTC-civil-day only in the 00:00-01:00 window.
 */

export const MS_PER_DAY = 24 * 60 * 60 * 1000;
export const PLAN_DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type PlanDayKey = (typeof PLAN_DAY_KEYS)[number];

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

export function addDaysUtc(msOrDate: number | Date, days: number): Date {
  const startMs = typeof msOrDate === 'number' ? msOrDate : utcStartOfCalendarDate(msOrDate);
  return new Date(startMs + days * MS_PER_DAY);
}

export function diffDaysUtc(target: Date, from: Date): number {
  return Math.floor((utcStartOfCalendarDate(target) - utcStartOfCalendarDate(from)) / MS_PER_DAY);
}

/**
 * Position of `target` relative to `planStart`: which week (0-indexed) and
 * which day-within-week (0-6, 0 = plan start day) it falls on. This is the
 * single source of truth for "which week/day is the client on" — replaces
 * the duplicated getPlanDayPosition() copies.
 */
export function getPlanDayPosition(
  target: Date,
  planStart: Date
): { diffDays: number; weekIndex: number; dayIndex: number } {
  const startMs = utcStartOfCalendarDate(planStart);
  const targetMs = utcStartOfCalendarDate(target);
  const diffDays = Math.floor((targetMs - startMs) / MS_PER_DAY);
  const weekIndex = Math.floor(diffDays / 7);
  const dayIndex = ((diffDays % 7) + 7) % 7;
  return { diffDays, weekIndex, dayIndex };
}

/**
 * [weekStart, weekEnd) window for `weekNumber` (1-indexed) of a plan that
 * started on `planStart`. weekEnd is exclusive (start of the following week).
 * This replaces the real-calendar-Monday anchoring previously used by
 * /me/home/weekly-summary, /me/weekly-validation, and weeklyValidation.service.ts.
 */
export function getWeekWindow(planStart: Date, weekNumber: number): { weekStart: Date; weekEnd: Date } {
  const startMs = utcStartOfCalendarDate(planStart);
  const weekStart = addDaysUtc(startMs, (weekNumber - 1) * 7);
  const weekEnd = addDaysUtc(startMs, weekNumber * 7);
  return { weekStart, weekEnd };
}

/** Maps a 0-6 day offset (within a week) onto the legacy positional day key (0 = mon). */
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
