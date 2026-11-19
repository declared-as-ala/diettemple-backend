/**
 * Race guard for exercise history.
 *
 * While training, the app saves the history after EVERY set (/me/workout/exercise-history/upsert) and, right after the
 * last set, asks the server to complete the exercise (/workout/.../complete). "Complete" rebuilds the history from the
 * sets already stored in the workout session. If the last set has not been stored yet when it runs, it sees one set
 * fewer and would overwrite the complete history (e.g. 3 sets -> 2 sets: "Série 3 : —" in the next session).
 *
 * Rule: a history refreshed within the last hours that already holds MORE sets than the rebuilt one is kept as is.
 * A genuinely older history (a previous session) is always replaced.
 */
export const RECENT_HISTORY_WINDOW_MS = 6 * 60 * 60 * 1000;

export function shouldKeepRicherHistory(
  existingSetCount: number,
  rebuiltSetCount: number,
  lastCompletedAt: Date | string | number | null | undefined,
  now: number = Date.now()
): boolean {
  if (!(existingSetCount > rebuiltSetCount)) return false;
  if (lastCompletedAt == null) return false;
  const at = new Date(lastCompletedAt).getTime();
  if (!Number.isFinite(at)) return false;
  const age = now - at;
  return age >= 0 && age < RECENT_HISTORY_WINDOW_MS;
}
