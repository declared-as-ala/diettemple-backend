import mongoose from 'mongoose';
import dotenv from 'dotenv';
import LevelTemplate from '../models/LevelTemplate.model';

dotenv.config();

export interface MigrationReport {
  timestamp: string;
  isDryRun: boolean;
  totalPlans: number;
  migratedCount: number;
  skippedCount: number;
  details: Array<{
    id: string;
    internalName: string;
    previousClientDisplayName: string | null;
    newClientDisplayName: string;
    status: 'MIGRATED' | 'SKIPPED_ALREADY_SET';
  }>;
}

export async function runMigration(options: { dryRun?: boolean; quiet?: boolean } = {}): Promise<MigrationReport> {
  const isDryRun = !!options.dryRun;
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/diettemple';

  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(mongoUri);
  }

  const plans = await LevelTemplate.find({}).sort({ name: 1 });
  const report: MigrationReport = {
    timestamp: new Date().toISOString(),
    isDryRun,
    totalPlans: plans.length,
    migratedCount: 0,
    skippedCount: 0,
    details: [],
  };

  for (const plan of plans) {
    const existingClientName = plan.clientDisplayName ? plan.clientDisplayName.trim() : '';
    if (!existingClientName) {
      const targetName = plan.name.trim();
      report.details.push({
        id: String(plan._id),
        internalName: plan.name,
        previousClientDisplayName: plan.clientDisplayName || null,
        newClientDisplayName: targetName,
        status: 'MIGRATED',
      });
      report.migratedCount++;

      if (!isDryRun) {
        plan.clientDisplayName = targetName;
        await plan.save();
      }
    } else {
      report.details.push({
        id: String(plan._id),
        internalName: plan.name,
        previousClientDisplayName: plan.clientDisplayName || null,
        newClientDisplayName: existingClientName,
        status: 'SKIPPED_ALREADY_SET',
      });
      report.skippedCount++;
    }
  }

  if (!options.quiet) {
    console.log('--- MIGRATION REPORT ---');
    console.log(`Mode: ${isDryRun ? 'DRY-RUN (No changes applied)' : 'LIVE MIGRATION'}`);
    console.log(`Total plans checked: ${report.totalPlans}`);
    console.log(`Plans updated: ${report.migratedCount}`);
    console.log(`Plans skipped (already set): ${report.skippedCount}`);
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
