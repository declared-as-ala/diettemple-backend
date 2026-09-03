import type { Types } from 'mongoose';
import AuditLog from '../models/AuditLog.model';
import LevelTemplate from '../models/LevelTemplate.model';
import PlanAssignment from '../models/PlanAssignment.model';
import Subscription from '../models/Subscription.model';
import User from '../models/User.model';
import { addBusinessDays, todayInBusinessTimeZone } from '../utils/businessDate';

export type AssignmentAction = 'assign' | 'renew' | 'replace';

export function durationFromPlan(plan: any): number {
  const weekCount = Array.isArray(plan?.weeks) ? plan.weeks.length : 0;
  const legacyDuration = Number(plan?.durationWeeks);
  const duration = weekCount || legacyDuration;
  if (!Number.isInteger(duration) || duration < 1) {
    throw new Error('Plan template has no valid weeks');
  }
  return duration;
}

export function assertAssignablePlan(plan: any): number {
  if (!plan) throw new Error('Plan template not found');
  if (plan.isActive === false) throw new Error('Only an active plan can be assigned');
  const durationWeeks = durationFromPlan(plan);
  if (Array.isArray(plan.weeks) && plan.weeks.length) {
    const invalidWeek = plan.weeks.find((week: any) => {
      if (week.isRestWeek) return false;
      if (Array.isArray(week.sessions) && week.sessions.length) return false;
      return !['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].some((day) => Array.isArray(week.days?.[day]) && week.days[day].length);
    });
    if (invalidWeek) throw new Error(`Week ${invalidWeek.weekNumber} has no valid workout day`);
  }
  return durationWeeks;
}

async function writeLegacyProjection(assignment: any, action: string, adminId?: unknown, note?: string) {
  const existing = await Subscription.findOne({ userId: assignment.userId }).sort({ updatedAt: -1 });
  if (existing) {
    existing.levelTemplateId = assignment.levelTemplateId;
    existing.startAt = assignment.startDate;
    existing.endAt = assignment.endDate;
    existing.status = 'ACTIVE';
    existing.history.push({ action, adminId: adminId as Types.ObjectId, note, date: new Date() });
    await existing.save();
    if (!assignment.sourceSubscriptionId) {
      assignment.sourceSubscriptionId = existing._id;
      await assignment.save();
    }
    return;
  }
  const subscription = await Subscription.create({
    userId: assignment.userId,
    levelTemplateId: assignment.levelTemplateId,
    status: 'ACTIVE',
    startAt: assignment.startDate,
    endAt: assignment.endDate,
    history: [{ action, adminId, note }],
  });
  assignment.sourceSubscriptionId = subscription._id;
  await assignment.save();
}

export async function reconcileUserAssignments(userId: unknown, at = todayInBusinessTimeZone()) {
  await PlanAssignment.updateMany(
    { userId, status: 'active', endDate: { $lte: at } },
    { $set: { status: 'completed' } },
  );
  const active = await PlanAssignment.findOne({ userId, status: 'active', startDate: { $lte: at }, endDate: { $gt: at } })
    .sort({ startDate: -1 });
  if (active) return active;

  const scheduled = await PlanAssignment.findOne({ userId, status: 'scheduled', startDate: { $lte: at } })
    .sort({ startDate: 1 });
  if (!scheduled) return null;
  scheduled.status = 'active';
  await scheduled.save();
  await writeLegacyProjection(scheduled, 'activate_scheduled');
  await User.updateOne(
    { _id: userId },
    { assignedPlanId: scheduled.levelTemplateId, planAssignmentStartDate: scheduled.startDate },
  );
  return scheduled;
}

export async function createPlanAssignment(params: {
  userId: unknown;
  planTemplateId: unknown;
  startDate: Date;
  action: AssignmentAction;
  adminId?: unknown;
  note?: string;
  replaceImmediately?: boolean;
}) {
  const plan = await LevelTemplate.findById(params.planTemplateId).lean();
  const durationWeeks = assertAssignablePlan(plan);
  const today = todayInBusinessTimeZone();
  const start = params.startDate;
  const status = start.getTime() > today.getTime() ? 'scheduled' : 'active';

  if (status === 'active') {
    const current = await PlanAssignment.findOne({ userId: params.userId, status: 'active' });
    if (current) {
      current.status = params.action === 'replace' ? 'replaced' : 'completed';
      current.archivedAt = new Date();
      await current.save();
    }
  }
  if (status === 'scheduled') {
    await PlanAssignment.updateMany(
      { userId: params.userId, status: 'scheduled', startDate: { $gte: start } },
      { $set: { status: 'cancelled', archivedAt: new Date() } },
    );
  }

  const assignment = await PlanAssignment.create({
    userId: params.userId,
    levelTemplateId: params.planTemplateId,
    startDate: start,
    durationWeeks,
    durationWeeksSnapshot: durationWeeks,
    durationDaysSnapshot: durationWeeks * 7,
    status,
    assignedBy: params.adminId,
    assignedAt: new Date(),
    note: params.note,
  });

  const previous = await PlanAssignment.findOne({
    userId: params.userId,
    _id: { $ne: assignment._id },
    status: { $in: ['replaced', 'completed'] },
  }).sort({ assignedAt: -1 });
  if (previous && params.action === 'replace') {
    previous.replacedByAssignmentId = assignment._id;
    await previous.save();
  }

  if (status === 'active') await writeLegacyProjection(assignment, params.action, params.adminId, params.note);
  await User.updateOne(
    { _id: params.userId },
    { assignedPlanId: params.planTemplateId, planAssignmentStartDate: start },
  );
  if (params.adminId) {
    const actionType = params.action === 'assign' ? 'plan_assigned' : params.action === 'renew' ? 'plan_renewed' : 'plan_replaced';
    await AuditLog.create({
      actorAdminId: params.adminId,
      targetUserId: params.userId,
      actionType,
      metadata: { assignmentId: assignment._id, planTemplateId: params.planTemplateId, durationWeeks, startDate: start, endDate: assignment.endDate },
    });
  }
  return { assignment, plan };
}

export async function renewPlanAssignment(userId: unknown, adminId?: unknown, note?: string) {
  await reconcileUserAssignments(userId);
  const current = await PlanAssignment.findOne({ userId, status: { $in: ['active', 'scheduled', 'completed'] } }).sort({ endDate: -1 });
  if (!current) throw new Error('No current plan to renew');
  return createPlanAssignment({
    userId,
    planTemplateId: current.levelTemplateId,
    startDate: current.endDate > todayInBusinessTimeZone() ? addBusinessDays(current.endDate, 0) : todayInBusinessTimeZone(),
    action: 'renew',
    adminId,
    note,
  });
}

export async function cancelPlanAssignments(userId: unknown, adminId?: unknown, note?: string) {
  const result = await PlanAssignment.updateMany(
    { userId, status: { $in: ['active', 'scheduled', 'paused'] } },
    { $set: { status: 'cancelled', archivedAt: new Date() } },
  );
  await Subscription.updateMany({ userId, status: 'ACTIVE' }, { $set: { status: 'CANCELED' } });
  if (adminId) await AuditLog.create({ actorAdminId: adminId, targetUserId: userId, actionType: 'plan_cancelled', metadata: { note } });
  return result;
}
