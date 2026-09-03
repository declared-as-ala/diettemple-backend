import type { Types } from 'mongoose';
import PlanAssignment from '../models/PlanAssignment.model';
import Subscription from '../models/Subscription.model';

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
  const assignment = await PlanAssignment.findOne({ userId, status: 'active' })
    .sort({ assignedAt: -1, createdAt: -1, _id: -1 })
    .lean();

  if (assignment) {
    return {
      ...(assignment as any),
      startDate: new Date((assignment as any).startDate),
      endDate: new Date((assignment as any).endDate),
      durationWeeks: Number((assignment as any).durationWeeks) || 5,
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

  return assignmentFromSubscription(subscription as any);
}

export function assignmentFromSubscription(subscription: {
  _id: unknown;
  userId: unknown;
  levelTemplateId: unknown;
  startAt: Date | string;
  endAt: Date | string;
  createdAt?: Date;
}): ResolvedWorkoutAssignment {
  return {
    _id: subscription._id,
    userId: subscription.userId,
    levelTemplateId: subscription.levelTemplateId,
    sourceSubscriptionId: subscription._id,
    status: 'active',
    startDate: new Date(subscription.startAt),
    endDate: new Date(subscription.endAt),
    durationWeeks: 5,
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
