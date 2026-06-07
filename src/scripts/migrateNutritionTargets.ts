/**
 * Migration: populate User.nutritionTarget from active UserNutritionPlan assignments.
 *
 * For each user that has an ACTIVE UserNutritionPlan:
 *  - If the plan has per-user adjustments, use those values.
 *  - Otherwise, fall back to the template's dailyCalories + macros.
 *  - Only sets nutritionTarget if the user doesn't already have one.
 *
 * Run once: npx ts-node src/scripts/migrateNutritionTargets.ts
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import User from '../models/User.model';
import UserNutritionPlan from '../models/UserNutritionPlan.model';
import NutritionPlanTemplate from '../models/NutritionPlanTemplate.model';

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || '';

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  const activePlans = await UserNutritionPlan.find({ status: 'ACTIVE' })
    .populate<{ nutritionPlanTemplateId: { dailyCalories: number; macros: { proteinG: number; carbsG: number; fatG: number } } }>('nutritionPlanTemplateId', 'dailyCalories macros')
    .lean();

  console.log(`Found ${activePlans.length} active nutrition plan assignments`);

  let updated = 0;
  let skipped = 0;

  for (const plan of activePlans) {
    // Skip if user already has a nutritionTarget set manually by admin
    const user = await User.findById(plan.userId).select('nutritionTarget').lean();
    if (!user) continue;

    const nt = (user as any).nutritionTarget;
    if (nt?.dailyCalories || nt?.proteinG || nt?.carbsG || nt?.fatG) {
      skipped++;
      continue;
    }

    const tpl = plan.nutritionPlanTemplateId as any;
    const adj = plan.adjustments ?? {};

    const target = {
      dailyCalories: adj.dailyCalories ?? tpl?.dailyCalories ?? undefined,
      proteinG:      adj.proteinG      ?? tpl?.macros?.proteinG ?? undefined,
      carbsG:        adj.carbsG        ?? tpl?.macros?.carbsG   ?? undefined,
      fatG:          adj.fatG          ?? tpl?.macros?.fatG     ?? undefined,
    };

    // Only save if at least one value is set
    if (!target.dailyCalories && !target.proteinG) { skipped++; continue; }

    await User.findByIdAndUpdate(plan.userId, { $set: { nutritionTarget: target } });
    updated++;
    console.log(`  ✓ User ${plan.userId}: ${target.dailyCalories} kcal P${target.proteinG} C${target.carbsG} F${target.fatG}`);
  }

  console.log(`\nDone. Updated: ${updated}, Skipped (already set or empty): ${skipped}`);
  await mongoose.disconnect();
}

run().catch((err) => { console.error(err); process.exit(1); });
