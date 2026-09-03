jest.mock('../models/PlanAssignment.model', () => ({
  __esModule: true,
  default: { findOne: jest.fn() },
}));
jest.mock('../models/Subscription.model', () => ({
  __esModule: true,
  default: { findOne: jest.fn() },
}));
jest.mock('../models/LevelTemplate.model', () => ({
  __esModule: true,
  default: { findById: jest.fn(() => ({ select: jest.fn(() => ({ lean: jest.fn().mockResolvedValue({ weeks: [{}, {}, {}, {}, {}] }) })) })) },
}));
jest.mock('./planAssignmentLifecycle.service', () => ({
  reconcileUserAssignments: jest.fn().mockResolvedValue(null),
}));

import { Types } from 'mongoose';
import PlanAssignment from '../models/PlanAssignment.model';
import Subscription from '../models/Subscription.model';
import {
  assignmentFromSubscription,
  resolveWorkoutAssignment,
} from './workoutAssignment.service';

function queryResult(value: unknown) {
  return { sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(value) }) };
}

describe('workout assignment resolution', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns no plan when neither assignment nor active subscription exists', async () => {
    (PlanAssignment.findOne as jest.Mock).mockReturnValue(queryResult(null));
    (Subscription.findOne as jest.Mock).mockReturnValue(queryResult(null));
    await expect(resolveWorkoutAssignment(new Types.ObjectId())).resolves.toBeNull();
  });

  it('prefers the active/latest PlanAssignment and does not query the legacy fallback', async () => {
    const assignmentId = new Types.ObjectId();
    const planId = new Types.ObjectId();
    (PlanAssignment.findOne as jest.Mock).mockReturnValue(queryResult({
      _id: assignmentId,
      levelTemplateId: planId,
      startDate: new Date('2026-09-01T00:00:00.000Z'),
      endDate: new Date('2026-10-06T00:00:00.000Z'),
      durationWeeks: 5,
      status: 'active',
    }));
    const result = await resolveWorkoutAssignment(new Types.ObjectId());
    expect(result?._id).toEqual(assignmentId);
    expect(result?.source).toBe('plan-assignment');
    expect(Subscription.findOne).not.toHaveBeenCalled();
  });

  it('maps ObjectIds and dates from a production subscription without string comparison loss', () => {
    const subscriptionId = new Types.ObjectId();
    const userId = new Types.ObjectId();
    const planId = new Types.ObjectId();
    const result = assignmentFromSubscription({
      _id: subscriptionId,
      userId,
      levelTemplateId: planId,
      startAt: '2026-09-01T00:00:00.000Z',
      endAt: '2026-10-06T23:59:59.999Z',
    });
    expect(String(result._id)).toBe(String(subscriptionId));
    expect(String(result.userId)).toBe(String(userId));
    expect(String(result.levelTemplateId)).toBe(String(planId));
    expect(result.startDate.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(result.source).toBe('subscription-fallback');
  });

  it('falls back to the current subscription so existing production users receive their plan', async () => {
    const subscriptionId = new Types.ObjectId();
    const planId = new Types.ObjectId();
    (PlanAssignment.findOne as jest.Mock).mockReturnValue(queryResult(null));
    (Subscription.findOne as jest.Mock).mockReturnValue(queryResult({
      _id: subscriptionId,
      userId: new Types.ObjectId(),
      levelTemplateId: planId,
      startAt: new Date('2026-09-01T00:00:00.000Z'),
      endAt: new Date('2026-10-06T23:59:59.999Z'),
    }));
    const result = await resolveWorkoutAssignment(new Types.ObjectId(), new Date('2026-09-03T12:00:00.000Z'));
    expect(result?.source).toBe('subscription-fallback');
    expect(String(result?.levelTemplateId)).toBe(String(planId));
    expect(Subscription.findOne).toHaveBeenCalledWith(expect.objectContaining({ status: 'ACTIVE' }));
  });
});
