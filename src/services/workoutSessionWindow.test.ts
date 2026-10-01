jest.mock('../models/WorkoutSession.model', () => ({
  __esModule: true,
  default: { updateMany: jest.fn() },
}));
jest.mock('../models/LevelTemplate.model', () => ({ __esModule: true, default: { findById: jest.fn() } }));
jest.mock('../models/ClientPlanOverride.model', () => ({
  __esModule: true,
  default: { findOne: jest.fn(() => ({ lean: () => Promise.resolve(null) })) },
}));
jest.mock('./workoutAssignment.service', () => ({ resolveWorkoutAssignment: jest.fn() }));

import { describe, it, expect, beforeEach } from '@jest/globals';
import WorkoutSession from '../models/WorkoutSession.model';
import LevelTemplate from '../models/LevelTemplate.model';
import ClientPlanOverride from '../models/ClientPlanOverride.model';
import { resolveWorkoutAssignment } from './workoutAssignment.service';
import {
  computeExpiresAt,
  deriveSessionState,
  expireStaleWorkoutSessions,
  isFutureOnlySession,
  WORKOUT_RESUME_WINDOW_MS,
} from './workoutSessionWindow.service';

const H = 60 * 60 * 1000;

describe('20h continuation window', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('expires exactly 20h after the real start (not midnight)', () => {
    expect(computeExpiresAt(new Date('2026-10-01T18:00:00Z')).toISOString()).toBe('2026-10-02T14:00:00.000Z');
    expect(WORKOUT_RESUME_WINDOW_MS).toBe(20 * H);
  });

  it('IN_PROGRESS right after leaving, after hours, and into the next day; EXPIRED from 20h on', () => {
    const start = new Date('2026-10-01T15:00:00Z');
    const doc = { status: 'active', startedAt: start };
    expect(deriveSessionState(doc, new Date(start.getTime() + 10 * 60 * 1000))).toBe('IN_PROGRESS');
    expect(deriveSessionState(doc, new Date(start.getTime() + 5 * H))).toBe('IN_PROGRESS');
    expect(deriveSessionState(doc, new Date(start.getTime() + 19 * H + 59 * 60 * 1000))).toBe('IN_PROGRESS');
    expect(deriveSessionState(doc, new Date(start.getTime() + 20 * H))).toBe('EXPIRED');
    expect(deriveSessionState(doc, new Date(start.getTime() + 30 * H))).toBe('EXPIRED');
  });

  it('an unfinished session is never reported COMPLETED; completed stays completed', () => {
    const start = new Date('2026-10-01T15:00:00Z');
    expect(deriveSessionState({ status: 'active', startedAt: start }, new Date(start.getTime() + 99 * H))).not.toBe(
      'COMPLETED'
    );
    expect(deriveSessionState({ status: 'completed', startedAt: start }, new Date(start.getTime() + 99 * H))).toBe(
      'COMPLETED'
    );
  });

  it('sweep only touches active sessions started >= 20h ago, using server time and a deterministic expiredAt', async () => {
    (WorkoutSession.updateMany as jest.Mock).mockResolvedValue({ modifiedCount: 1 } as never);
    const now = new Date('2026-10-02T14:00:00Z');
    await expireStaleWorkoutSessions('u1', now);
    const [filter, update] = (WorkoutSession.updateMany as jest.Mock).mock.calls[0] as any[];
    expect(filter.status).toBe('active');
    expect(filter.startedAt.$lte.toISOString()).toBe('2026-10-01T18:00:00.000Z');
    expect(update[0].$set.status).toBe('expired');
    expect(update[0].$set.expiredAt).toEqual({ $add: ['$startedAt', 20 * H] });
  });
});

describe('future-session guard', () => {
  const planStart = new Date('2026-09-14T00:00:00Z'); // Monday
  const level = {
    weeks: [
      { weekNumber: 1, days: { mon: [{ sessionTemplateId: 's1' }], wed: [{ sessionTemplateId: 's2' }] } },
    ],
  };
  beforeEach(() => {
    jest.clearAllMocks();
    (ClientPlanOverride.findOne as jest.Mock).mockReturnValue({ lean: () => Promise.resolve(null) } as never);
    (resolveWorkoutAssignment as jest.Mock).mockResolvedValue({
      levelTemplateId: 'L',
      startDate: planStart,
      durationWeeks: 5,
    } as never);
    (LevelTemplate.findById as jest.Mock).mockReturnValue({ lean: () => Promise.resolve(level) } as never);
  });

  it("blocks Wednesday's session on Monday, allows today's and past sessions", async () => {
    const monday = new Date('2026-09-14T09:00:00Z');
    expect(await isFutureOnlySession('u', 's2', monday, '2026-09-14')).toBe(true);
    expect(await isFutureOnlySession('u', 's1', monday, '2026-09-14')).toBe(false);
    const thursday = new Date('2026-09-17T09:00:00Z');
    expect(await isFutureOnlySession('u', 's1', thursday, '2026-09-17')).toBe(false); // rattrapage candidate
  });

  it('does not block sessions outside the plan', async () => {
    expect(await isFutureOnlySession('u', 'legacy', new Date('2026-09-14T09:00:00Z'))).toBe(false);
  });
});
