/**
 * Migrates LevelTemplate.weeks[].days.mon..sun (positional weekday slots) into the new
 * ordered `sessions[]` structure (sessionOrder + recommendedDayOffset). Additive only:
 * `days{}` is left completely untouched, IDs are preserved, nothing is deleted.
 *
 * Idempotent: any week that already has `sessions[]` populated is skipped.
 *
 * Usage:
 *   npx ts-node src/scripts/migrate-relative-sessions.ts --dry-run   # report only, no writes
 *   npx ts-node src/scripts/migrate-relative-sessions.ts             # apply
 *
 * Rollback: unset the new fields (days{} is untouched, so every existing route keeps
 * working immediately after this):
 *   db.leveltemplates.updateMany({}, { $unset: { "weeks.$[].sessions": "", "weeks.$[].minimumCompletedSessions": "", "weeks.$[].isRestWeek": "" } })
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import LevelTemplate from '../models/LevelTemplate.model';

dotenv.config();

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

export interface WeekMigrationDetail {
  templateId: string;
  templateName: string;
  weekNumber: number;
  status: 'MIGRATED' | 'SKIPPED_ALREADY_MIGRATED' | 'SKIPPED_EMPTY_WEEK_FLAGGED_REST';
  sessionCount: number;
  minimumCompletedSessions: number;
  offsets: number[];
  ambiguous?: string;
}

export interface MigrationReport {
  timestamp: string;
  isDryRun: boolean;
  totalTemplates: number;
  totalWeeks: number;
  migratedWeeks: number;
  skippedWeeks: number;
  details: WeekMigrationDetail[];
}

export async function runMigration(options: { dryRun?: boolean; quiet?: boolean } = {}): Promise<MigrationReport> {
  const isDryRun = !!options.dryRun;
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/diettemple';

  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(mongoUri);
  }

  const templates = await LevelTemplate.find({}).sort({ name: 1 });
  const report: MigrationReport = {
    timestamp: new Date().toISOString(),
    isDryRun,
    totalTemplates: templates.length,
    totalWeeks: 0,
    migratedWeeks: 0,
    skippedWeeks: 0,
    details: [],
  };

  for (const template of templates) {
    let templateChanged = false;

    for (const week of template.weeks as any[]) {
      report.totalWeeks++;

      if (Array.isArray(week.sessions) && week.sessions.length > 0) {
        report.details.push({
          templateId: String(template._id),
          templateName: template.name,
          weekNumber: week.weekNumber,
          status: 'SKIPPED_ALREADY_MIGRATED',
          sessionCount: week.sessions.length,
          minimumCompletedSessions: week.minimumCompletedSessions ?? week.sessions.length,
          offsets: week.sessions.map((s: any) => s.recommendedDayOffset),
        });
        report.skippedWeeks++;
        continue;
      }

      // Read days.mon..sun in order, preserving existing logical order.
      const sessions: Array<{ sessionTemplateId: any; sessionOrder: number; recommendedDayOffset: number }> = [];
      let order = 1;
      for (let offset = 0; offset < DAY_KEYS.length; offset++) {
        const placements = week.days?.[DAY_KEYS[offset]] || [];
        for (const placement of placements) {
          if (!placement?.sessionTemplateId) continue;
          sessions.push({
            sessionTemplateId: placement.sessionTemplateId,
            sessionOrder: order++,
            recommendedDayOffset: offset,
          });
        }
      }

      if (sessions.length === 0) {
        // Zero-session week: flag as an explicit rest week rather than leaving it an
        // ambiguous "active week with nothing planned".
        report.details.push({
          templateId: String(template._id),
          templateName: template.name,
          weekNumber: week.weekNumber,
          status: 'SKIPPED_EMPTY_WEEK_FLAGGED_REST',
          sessionCount: 0,
          minimumCompletedSessions: 0,
          offsets: [],
          ambiguous: 'Week has no sessions in days{} — will be marked isRestWeek on write.',
        });
        if (!isDryRun) {
          week.sessions = undefined;
          week.isRestWeek = true;
          week.minimumCompletedSessions = 0;
          templateChanged = true;
        }
        report.migratedWeeks++;
        continue;
      }

      const existingMinimum = template.minimumSessionsPerWeek;
      const minimumCompletedSessions = Math.min(
        Math.max(existingMinimum ?? sessions.length, 1),
        sessions.length
      );

      const detail: WeekMigrationDetail = {
        templateId: String(template._id),
        templateName: template.name,
        weekNumber: week.weekNumber,
        status: 'MIGRATED',
        sessionCount: sessions.length,
        minimumCompletedSessions,
        offsets: sessions.map((s) => s.recommendedDayOffset),
      };
      if (existingMinimum == null) {
        detail.ambiguous = `No minimumSessionsPerWeek set on template — defaulted minimumCompletedSessions to sessionCount (${sessions.length}).`;
      }
      report.details.push(detail);
      report.migratedWeeks++;

      if (!isDryRun) {
        week.sessions = sessions;
        week.minimumCompletedSessions = minimumCompletedSessions;
        week.isRestWeek = false;
        templateChanged = true;
      }
    }

    if (!isDryRun && templateChanged) {
      await template.save();
    }
  }

  if (!options.quiet) {
    console.log('--- RELATIVE-SESSIONS MIGRATION REPORT ---');
    console.log(`Mode: ${isDryRun ? 'DRY-RUN (No changes applied)' : 'LIVE MIGRATION'}`);
    console.log(`Templates scanned: ${report.totalTemplates}`);
    console.log(`Weeks scanned: ${report.totalWeeks}`);
    console.log(`Weeks migrated: ${report.migratedWeeks}`);
    console.log(`Weeks skipped (already migrated): ${report.skippedWeeks}`);
    const ambiguous = report.details.filter((d) => d.ambiguous);
    if (ambiguous.length > 0) {
      console.log(`\nAmbiguous weeks (${ambiguous.length}):`);
      for (const d of ambiguous) {
        console.log(`  - ${d.templateName} / week ${d.weekNumber}: ${d.ambiguous}`);
      }
    }
    console.log('\nFull report:');
    console.log(JSON.stringify(report, null, 2));
  }

  return report;
}

if (require.main === module) {
  const isDryRun = process.argv.includes('--dry-run');
  runMigration({ dryRun: isDryRun })
    .then(() => mongoose.disconnect())
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
