/**
 * Migration: Populate level field for existing LevelTemplates
 *
 * Purpose: Adds the new required 'level' field to all existing LevelTemplate documents
 * Strategy: Infers level from plan name (Champion → CHAMPION)
 * Idempotent: Yes - can be run multiple times safely
 * Rollback: Run with --rollback flag to remove level field
 *
 * Run:
 *   npx ts-node scripts/migrate-level-field.ts --dry-run
 *   npx ts-node scripts/migrate-level-field.ts
 *   npx ts-node scripts/migrate-level-field.ts --rollback
 */

import mongoose from 'mongoose';
import path from 'path';
import dotenv from 'dotenv';
import LevelTemplate from '../src/models/LevelTemplate.model';

const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath });

const LEVEL_MAP: Record<string, string> = {
  'Intiate': 'INITIATE',
  'Initiate': 'INITIATE',
  'Fighter': 'FIGHTER',
  'Warrior': 'WARRIOR',
  'Champion': 'CHAMPION',
  'Elite': 'ELITE',
};

interface MigrationResult {
  planId: string;
  planName: string;
  assignedLevel: string;
  migrationDate: Date;
}

async function migrate(dryRun: boolean = true): Promise<MigrationResult[]> {
  const changes: MigrationResult[] = [];

  // Find all plans without level field
  const plans = await LevelTemplate.find({ level: { $exists: false } }).lean();

  console.log(`\n📊 Found ${plans.length} LevelTemplates without level field`);

  if (plans.length === 0) {
    console.log('✓ All LevelTemplates already have level field');
    return changes;
  }

  for (const plan of plans) {
    const inferredLevel = LEVEL_MAP[plan.name as string];

    if (!inferredLevel) {
      console.warn(`⚠️  Plan "${plan.name}" has no recognized level mapping. Skipping.`);
      continue;
    }

    if (!dryRun) {
      await LevelTemplate.updateOne(
        { _id: plan._id },
        { $set: { level: inferredLevel } }
      );
    }

    changes.push({
      planId: plan._id.toString(),
      planName: plan.name as string,
      assignedLevel: inferredLevel,
      migrationDate: new Date(),
    });

    console.log(`  ✓ ${plan.name} → ${inferredLevel}`);
  }

  return changes;
}

async function rollback(): Promise<void> {
  console.log('\n🔄 Rolling back migration...');

  const result = await LevelTemplate.updateMany(
    { level: { $exists: true } },
    { $unset: { level: '' } }
  );

  console.log(`✓ Removed level field from ${result.modifiedCount} documents`);
}

async function main() {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI not set in environment');
    }

    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ Connected to MongoDB');

    const args = process.argv.slice(2);
    const isDryRun = args.includes('--dry-run');
    const isRollback = args.includes('--rollback');

    if (isRollback) {
      await rollback();
    } else {
      const changes = await migrate(isDryRun);

      console.log(`\n${isDryRun ? '📋 DRY RUN: Would migrate' : '✅ Migrated'} ${changes.length} plans`);

      if (isDryRun) {
        console.log(
          '\n💡 To apply changes, run without --dry-run:\n   npx ts-node scripts/migrate-level-field.ts'
        );
      }
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();
