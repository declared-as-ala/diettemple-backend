import { RECENT_HISTORY_WINDOW_MS, shouldKeepRicherHistory } from './exerciseHistoryGuard';

const NOW = Date.parse('2026-11-19T12:00:00Z');
const ago = (ms: number) => new Date(NOW - ms);

describe('shouldKeepRicherHistory (the "Série 3 is missing" race)', () => {
  it('keeps the 3-set history just saved when "complete exercise" only saw 2 sets', () => {
    expect(shouldKeepRicherHistory(3, 2, ago(5_000), NOW)).toBe(true);
  });

  it('replaces an older history (a previous session) even when it had more sets', () => {
    expect(shouldKeepRicherHistory(3, 2, ago(RECENT_HISTORY_WINDOW_MS + 1), NOW)).toBe(false);
    expect(shouldKeepRicherHistory(3, 2, ago(7 * 24 * 3600 * 1000), NOW)).toBe(false);
  });

  it('never blocks a complete or larger rebuild', () => {
    expect(shouldKeepRicherHistory(3, 3, ago(1_000), NOW)).toBe(false);
    expect(shouldKeepRicherHistory(2, 3, ago(1_000), NOW)).toBe(false);
    expect(shouldKeepRicherHistory(0, 3, ago(1_000), NOW)).toBe(false);
  });

  it('is safe with missing or invalid dates', () => {
    expect(shouldKeepRicherHistory(3, 2, undefined, NOW)).toBe(false);
    expect(shouldKeepRicherHistory(3, 2, null, NOW)).toBe(false);
    expect(shouldKeepRicherHistory(3, 2, 'not a date', NOW)).toBe(false);
    expect(shouldKeepRicherHistory(3, 2, new Date(NOW + 10_000), NOW)).toBe(false); // from the future: do not trust
  });
});
