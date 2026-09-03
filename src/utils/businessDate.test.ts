import {
  addBusinessDays,
  businessDateAsUtcCalendarDate,
  businessDateKey,
  diffBusinessDays,
  parseBusinessDate,
} from './businessDate';

describe('Africa/Tunis business dates', () => {
  it('stores Tunis midnight as the correct UTC instant', () => {
    expect(parseBusinessDate('2026-09-03').toISOString()).toBe('2026-09-02T23:00:00.000Z');
    expect(businessDateKey(parseBusinessDate('2026-09-03'))).toBe('2026-09-03');
  });

  it('preserves the requested calendar day for mobile schedule arithmetic', () => {
    const stored = parseBusinessDate('2026-09-03');
    expect(stored.toISOString()).toBe('2026-09-02T23:00:00.000Z');
    expect(businessDateAsUtcCalendarDate(stored).toISOString()).toBe('2026-09-03T00:00:00.000Z');
  });

  it('uses exclusive plan expiration after the configured number of weeks', () => {
    const start = parseBusinessDate('2026-09-03');
    const end = addBusinessDays(start, 42);
    expect(businessDateKey(end)).toBe('2026-10-15');
    expect(diffBusinessDays(end, start)).toBe(42);
  });
});
