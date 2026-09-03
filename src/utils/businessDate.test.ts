import { addBusinessDays, businessDateKey, diffBusinessDays, parseBusinessDate } from './businessDate';

describe('Africa/Tunis business dates', () => {
  it('stores Tunis midnight as the correct UTC instant', () => {
    expect(parseBusinessDate('2026-09-03').toISOString()).toBe('2026-09-02T23:00:00.000Z');
    expect(businessDateKey(parseBusinessDate('2026-09-03'))).toBe('2026-09-03');
  });

  it('uses exclusive plan expiration after the configured number of weeks', () => {
    const start = parseBusinessDate('2026-09-03');
    const end = addBusinessDays(start, 42);
    expect(businessDateKey(end)).toBe('2026-10-15');
    expect(diffBusinessDays(end, start)).toBe(42);
  });
});
