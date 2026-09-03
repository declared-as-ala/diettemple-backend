import type { Types } from 'mongoose';
import PlanAssignment from '../models/PlanAssignment.model';
import Subscription from '../models/Subscription.model';
import LevelTemplate from '../models/LevelTemplate.model';
import { diffBusinessDays } from '../utils/businessDate';
import { reconcileUserAssignments } from './planAssignmentLifecycle.service';

export type WorkoutAssignmentSource = 'plan-assignment' | 'subscription-fallback';

export interface ResolvedWorkoutAssignment {
  _id: unknown;
  userId: unknown;
  levelTemplateId: unknown;
  sourceSubscriptionId?: unknown;
  status: 'active';
  startDate: Date;
  endDate: Date;
  durationWeeks: number;
  assignedAt?: Date;
  source: WorkoutAssignmentSource;
}

/**
 * Resolve the workout-plan source used by mobile endpoints.
 * PlanAssignment remains authoritative. The Subscription fallback is intentionally
 * retained for assignments made by older production admin builds and disappears
 * naturally after the backfill migration creates the missing PlanAssignment row.
 */
export async function resolveWorkoutAssignment(
  userId: unknown,
  at: Date = new Date()
): Promise<ResolvedWorkoutAssignment | null> {
  await reconcileUserAssignments(userId, at);
  const assignment = await PlanAssignment.findOne({ userId, status: 'active', startDate: { $lte: at }, endDate: { $gt: at } })
    .sort({ assignedAt: -1, createdAt: -1, _id: -1 })
    .lean();

  if (assignment) {
    return {
      ...(assignment as any),
      startDate: new Date((assignment as any).startDate),
      endDate: new Date((assignment as any).endDate),
      durationWeeks: Number((assignment as any).durationWeeksSnapshot || (assignment as any).durationWeeks),
      source: 'plan-assignment',
    };
  }

  const subscription = await Subscription.findOne({
    userId,
    status: 'ACTIVE',
    endAt: { $gt: at },
  })
    .sort({ updatedAt: -1, createdAt: -1, endAt: -1, _id: -1 })
    .lean();

  if (!subscription) return null;

  const plan = await LevelTemplate.findById((subscription as any).levelTemplateId).select('weeks durationWeeks').lean();
  return assignmentFromSubscription(subscription as any, Array.isArray((plan as any)?.weeks) && (plan as any).weeks.length
    ? (plan as any).weeks.length
    : Math.ceil(diffBusinessDays(new Date((subscription as any).endAt), new Date((subscription as any).startAt)) / 7));
}

export function assignmentFromSubscription(subscription: {
  _id: unknown;
  userId: unknown;
  levelTemplateId: unknown;
  startAt: Date | string;
  endAt: Date | string;
  createdAt?: Date;
}, durationWeeks = Math.ceil(diffBusinessDays(new Date(subscription.endAt), new Date(subscription.startAt)) / 7)): ResolvedWorkoutAssignment {
  if (!Number.isInteger(durationWeeks) || durationWeeks < 1) throw new Error('Legacy assignment has no valid duration');
  return {
    _id: subscription._id,
    userId: subscription.userId,
    levelTemplateId: subscription.levelTemplateId,
    sourceSubscriptionId: subscription._id,
    status: 'active',
    startDate: new Date(subscription.startAt),
    endDate: new Date(subscription.endAt),
    durationWeeks,
    assignedAt: subscription.createdAt,
    source: 'subscription-fallback',
  };
}

/** Keep the workout assignment collection in sync with the admin's subscription assignment flow. */
export async function syncWorkoutAssignmentFromSubscription(params: {
  subscriptionId: Types.ObjectId | unknown;
  userId: Types.ObjectId | unknown;
  levelTemplateId: Types.ObjectId | unknown;
  startDate: Date;
  assignedBy?: Types.ObjectId | unknown;
  note?: string;
}) {
  const now = new Date();
  await PlanAssignment.updateMany(
    { userId: params.userId, status: 'active' },
    { $set: { status: 'archived', archivedAt: now } }
  );

  const assignment = new PlanAssignment({
    userId: params.userId,
    levelTemplateId: params.levelTemplateId,
    sourceSubscriptionId: params.subscriptionId,
    status: 'active',
    startDate: params.startDate,
    assignedBy: params.assignedBy,
    assignedAt: now,
    note: params.note,
  });
  await assignment.save();
  return assignment;
}

export async function archiveWorkoutAssignmentForSubscription(subscriptionId: unknown): Promise<void> {
  await PlanAssignment.updateMany(
    { sourceSubscriptionId: subscriptionId, status: { $in: ['active', 'paused'] } },
    { $set: { status: 'archived', archivedAt: new Date() } }
  );
}
