/** Calendar-date arithmetic for DietTemple's contractual timezone. */
export const BUSINESS_TIME_ZONE = 'Africa/Tunis';
export const MS_PER_DAY = 86_400_000;

const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function businessDateKey(value: Date = new Date()): string {
  const parts = formatter.formatToParts(value);
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  return `${read('year')}-${read('month')}-${read('day')}`;
}

/**
 * Convert a stored business-date instant to UTC midnight for date-only API
 * responses and schedule arithmetic. For example, Tunis midnight on
 * 2026-09-03 is stored as 2026-09-02T23:00Z, but its calendar representation
 * must remain 2026-09-03 rather than being truncated to the previous UTC day.
 */
export function businessDateAsUtcCalendarDate(value: string | Date): Date {
  const key = value instanceof Date ? businessDateKey(value) : value.slice(0, 10);
  return new Date(`${key}T00:00:00.000Z`);
}

function dateKeyOrdinal(key: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) throw new Error('Date must use YYYY-MM-DD');
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/** Returns the UTC instant representing midnight in Africa/Tunis for a date key. */
export function parseBusinessDate(value: string | Date): Date {
  const key = value instanceof Date ? businessDateKey(value) : value.slice(0, 10);
  const desired = dateKeyOrdinal(key);
  let candidate = desired;

  // Iteration also keeps this correct if Tunisia changes its UTC offset in future.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const observed = dateKeyOrdinal(businessDateKey(new Date(candidate)));
    candidate += desired - observed;
    const hour = Number(new Intl.DateTimeFormat('en-GB', {
      timeZone: BUSINESS_TIME_ZONE,
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(candidate)));
    candidate -= hour * 60 * 60 * 1000;
  }
  return new Date(candidate);
}

export function addBusinessDays(value: string | Date, days: number): Date {
  const key = value instanceof Date ? businessDateKey(value) : value.slice(0, 10);
  return parseBusinessDate(new Date(dateKeyOrdinal(key) + days * MS_PER_DAY).toISOString().slice(0, 10));
}

export function diffBusinessDays(target: Date, start: Date): number {
  return Math.floor((dateKeyOrdinal(businessDateKey(target)) - dateKeyOrdinal(businessDateKey(start))) / MS_PER_DAY);
}

export function todayInBusinessTimeZone(): Date {
  return parseBusinessDate(businessDateKey());
}
