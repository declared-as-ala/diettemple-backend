/**
 * Synchronization: Sync User.level with assigned plan levels
 *
 * Purpose: Ensures all users with assigned plans have their level synchronized
 * with the plan's level (for backward compatibility with mobile API)
 * Idempotent: Yes - can be run multiple times safely
 *
 * Run:
 *   npx ts-node scripts/sync-user-levels.ts --dry-run
 *   npx ts-node scripts/sync-user-levels.ts
 */

import mongoose from 'mongoose';
import path from 'path';
import dotenv from 'dotenv';
import User from '../src/models/User.model';
import LevelTemplate from '../src/models/LevelTemplate.model';

const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath });

const BACK_COMPAT_MAP: Record<string, string> = {
  'INITIATE': 'Initiate',
  'FIGHTER': 'Fighter',
  'WARRIOR': 'Warrior',
  'CHAMPION': 'Champion',
  'ELITE': 'Elite',
};

interface SyncResult {
  userId: string;
  email?: string;
  oldLevel?: string;
  newLevel: string;
  planName: string;
  planLevel: string;
}

async function syncLevels(dryRun: boolean = true): Promise<SyncResult[]> {
  const updates: SyncResult[] = [];

  // Find all users with assigned plans
  const users = await User.find({ assignedPlanId: { $exists: true } }).lean();

  console.log(`\n📊 Found ${users.length} users with assigned plans`);

  for (const user of users) {
    const plan = await LevelTemplate.findById(user.assignedPlanId).lean();

    if (!plan) {
      console.warn(`⚠️  User ${user.email} assigned to missing plan`);
      continue;
    }

    if (!plan.level) {
      console.warn(`⚠️  User ${user.email} plan missing level field`);
      continue;
    }

    // Convert INITIATE → Initiate for backward compatibility
    const backCompatLevel = BACK_COMPAT_MAP[plan.level as string] || 'Initiate';

    // Check if sync is needed
    if (user.level === backCompatLevel) {
      continue; // Already synced
    }

    if (!dryRun) {
      await User.updateOne(
        { _id: user._id },
        { $set: { level: backCompatLevel } }
      );
    }

    updates.push({
      userId: user._id.toString(),
      email: user.email,
      oldLevel: user.level,
      newLevel: backCompatLevel,
      planName: plan.name as string,
      planLevel: plan.level as string,
    });

    console.log(`  ✓ ${user.email}: ${user.level} → ${backCompatLevel}`);
  }

  return updates;
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

    const updates = await syncLevels(isDryRun);

    console.log(`\n${isDryRun ? '📋 DRY RUN: Would sync' : '✅ Synced'} ${updates.length} users`);

    if (isDryRun && updates.length > 0) {
      console.log(
        '\n💡 To apply changes, run without --dry-run:\n   npx ts-node scripts/sync-user-levels.ts'
      );
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();
