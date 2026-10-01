/**
 * Audit (and optionally repair) client plan schedules.
 *
 *   npx ts-node src/scripts/auditPlanSchedules.ts              # dry-run, read-only
 *   npx ts-node src/scripts/auditPlanSchedules.ts --apply      # apply the SAFE repairs below
 *   npx ts-node src/scripts/auditPlanSchedules.ts --user <id>  # limit scope to one client
 *
 * Reported (never auto-changed):
 *   - stale ClientPlanOverride (override targets another plan than the active assignment)
 *   - LevelTemplate weeks where days{} and sessions[] disagree (DAYS_SESSIONS_DRIFT)
 *   - same session template repeated inside one week
 *   - sessions that fall before a mid-week plan start (never scheduled in week 1)
 *
 * Repaired with --apply (idempotent, status-only, logged, never touches workout history):
 *   - users with >1 ACTIVE PlanAssignment: the most recent stays active, older ones become 'replaced'
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import PlanAssignment from '../models/PlanAssignment.model';
import { buildScheduleTrace } from '../services/clientSchedule.service';
import ClientPlanOverride from '../models/ClientPlanOverride.model';

dotenv.config();

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required');
  const apply = process.argv.includes('--apply');
  const userArg = process.argv.indexOf('--user');
  const onlyUser = userArg >= 0 ? process.argv[userArg + 1] : undefined;
  await mongoose.connect(uri);

  const report = {
    mode: apply ? 'apply' : 'dry-run',
    usersWithMultipleActive: 0,
    assignmentsArchived: 0,
    staleOverrides: 0,
    driftWeeks: 0,
    repeatedTemplateWeeks: 0,
    unscheduledBeforeStartSlots: 0,
    usersAudited: 0,
  };

  const activeFilter: any = { status: 'active' };
  if (onlyUser) activeFilter.userId = onlyUser;
  const active = await PlanAssignment.find(activeFilter).sort({ assignedAt: -1, createdAt: -1, _id: -1 }).lean();
  const byUser = new Map<string, any[]>();
  for (const a of active as any[]) byUser.set(String(a.userId), [...(byUser.get(String(a.userId)) || []), a]);

  for (const [userId, rows] of byUser) {
    report.usersAudited += 1;
    if (rows.length > 1) {
      report.usersWithMultipleActive += 1;
      for (const old of rows.slice(1)) {
        console.log(`[duplicate-active] user=${userId} keep=${rows[0]._id} archive=${old._id}`);
        if (apply) {
          await PlanAssignment.updateOne({ _id: old._id, status: 'active' }, { $set: { status: 'replaced', archivedAt: new Date(), replacedByAssignmentId: rows[0]._id } });
          report.assignmentsArchived += 1;
        }
      }
    }

    const ov: any = await ClientPlanOverride.findOne({ userId, status: 'active' }).lean();
    if (ov && String(ov.baseLevelTemplateId) !== String(rows[0].levelTemplateId)) {
      report.staleOverrides += 1;
      console.log(`[stale-override] user=${userId} override.base=${ov.baseLevelTemplateId} assignment.plan=${rows[0].levelTemplateId} (ignored by the schedule resolver)`);
    }

    const { rows: trace } = await buildScheduleTrace(userId);
    const driftWeeks = new Set<number>();
    const repeatedWeeks = new Set<number>();
    for (const r of trace) {
      if (r.flags.includes('DAYS_SESSIONS_DRIFT')) driftWeeks.add(r.weekNumber);
      if (r.flags.includes('SAME_TEMPLATE_REPEATED_IN_WEEK')) repeatedWeeks.add(r.weekNumber);
      if (r.flags.includes('BEFORE_PLAN_START_NOT_SCHEDULED')) report.unscheduledBeforeStartSlots += 1;
    }
    report.driftWeeks += driftWeeks.size;
    report.repeatedTemplateWeeks += repeatedWeeks.size;
    if (driftWeeks.size) console.log(`[drift] user=${userId} weeks=${[...driftWeeks].join(',')}`);
    if (repeatedWeeks.size) console.log(`[repeated-template] user=${userId} weeks=${[...repeatedWeeks].join(',')}`);
  }

  console.log(JSON.stringify(report, null, 2));
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
