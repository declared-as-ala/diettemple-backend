import dotenv from 'dotenv';
import mongoose from 'mongoose';
import LevelTemplate from '../models/LevelTemplate.model';
import PlanAssignment from '../models/PlanAssignment.model';
import Subscription from '../models/Subscription.model';
import { addBusinessDays, parseBusinessDate } from '../utils/businessDate';
import { durationFromPlan } from '../services/planAssignmentLifecycle.service';

dotenv.config();

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required');
  const apply = process.argv.includes('--apply');
  await mongoose.connect(uri);
  const report = { mode: apply ? 'apply' : 'dry-run', scannedAssignments: 0, assignmentsMissingStart: 0, snapshotUpdates: 0, activeSubscriptions: 0, assignmentsToCreate: 0, missingPlans: 0, skippedInvalidPlans: 0, overlappingAssignments: 0, legacyDateMismatches: 0, legacyExpirationsPreserved: 0 };

  const assignments = await PlanAssignment.find({}).lean();
  report.scannedAssignments = assignments.length;
  report.assignmentsMissingStart = assignments.filter((assignment: any) => !assignment.startDate).length;
  const liveByUser = new Map<string, any[]>();
  for (const assignment of assignments as any[]) {
    if (!['active', 'scheduled', 'paused'].includes(assignment.status)) continue;
    const key = String(assignment.userId);
    liveByUser.set(key, [...(liveByUser.get(key) || []), assignment]);
  }
  for (const rows of liveByUser.values()) {
    rows.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
    for (let index = 1; index < rows.length; index += 1) if (new Date(rows[index].startDate) < new Date(rows[index - 1].endDate)) report.overlappingAssignments += 1;
  }
  for (const assignment of assignments as any[]) {
    if (assignment.durationWeeksSnapshot && assignment.durationDaysSnapshot) continue;
    const plan = await LevelTemplate.findById(assignment.levelTemplateId).lean();
    let weeks: number;
    if (!plan) { report.missingPlans += 1; continue; }
    try { weeks = durationFromPlan(plan); } catch { report.skippedInvalidPlans += 1; continue; }
    report.snapshotUpdates += 1;
    if (apply) await PlanAssignment.updateOne({ _id: assignment._id }, { $set: { durationWeeks: weeks, durationWeeksSnapshot: weeks, durationDaysSnapshot: weeks * 7 } });
  }

  const subscriptions = await Subscription.find({ status: 'ACTIVE', endAt: { $gt: new Date() } }).sort({ updatedAt: -1 }).lean();
  report.activeSubscriptions = subscriptions.length;
  for (const subscription of subscriptions as any[]) {
    const exists = await PlanAssignment.exists({ userId: subscription.userId, status: { $in: ['active', 'scheduled', 'paused'] } });
    if (exists) continue;
    const plan = await LevelTemplate.findById(subscription.levelTemplateId).lean();
    let weeks: number;
    if (!plan) { report.missingPlans += 1; continue; }
    try { weeks = durationFromPlan(plan); } catch { report.skippedInvalidPlans += 1; continue; }
    const startDate = parseBusinessDate(new Date(subscription.startAt));
    const derivedEnd = addBusinessDays(startDate, weeks * 7);
    const endDate = new Date(subscription.endAt) > derivedEnd ? new Date(subscription.endAt) : derivedEnd;
    const preserveLegacy = endDate > derivedEnd;
    if (new Date(subscription.endAt).getTime() !== derivedEnd.getTime()) report.legacyDateMismatches += 1;
    report.assignmentsToCreate += 1;
    if (preserveLegacy) report.legacyExpirationsPreserved += 1;
    if (apply) {
      const created = await PlanAssignment.create({ userId: subscription.userId, levelTemplateId: subscription.levelTemplateId, sourceSubscriptionId: subscription._id, status: startDate > new Date() ? 'scheduled' : 'active', startDate, durationWeeks: weeks, durationWeeksSnapshot: weeks, durationDaysSnapshot: weeks * 7, legacyAccessPreserved: preserveLegacy, note: 'Lifecycle migration from legacy subscription' });
      if (preserveLegacy) await PlanAssignment.updateOne({ _id: created._id }, { $set: { endDate } });
    }
  }

  console.log(JSON.stringify(report, null, 2));
  await mongoose.disconnect();
}

run().catch(async (error) => { console.error(error instanceof Error ? error.message : error); await mongoose.disconnect().catch(() => undefined); process.exitCode = 1; });
