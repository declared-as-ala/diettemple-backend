/**
 * Backfill protein / carbs / fat for recipes that only have calories (or missing any macro).
 * Uses a balanced ~30% protein / ~45% carbs / ~25% fat calorie split (4 kcal/g P & C, 9 kcal/g F).
 *
 * Run: npm run seed:recipe-macros
 */
import Recipe from '../models/Recipe.model';
import { runSeed } from './runSeed';

function macrosFromCalories(calories: number): { protein: number; carbs: number; fat: number } {
  const cal = Math.max(1, Math.round(Number(calories) || 400));
  const protein = Math.max(0, Math.round((cal * 0.3) / 4));
  const carbs = Math.max(0, Math.round((cal * 0.45) / 4));
  const fat = Math.max(0, Math.round((cal * 0.25) / 9));
  return { protein, carbs, fat };
}

function isMissing(v: unknown): boolean {
  return v === undefined || v === null || Number.isNaN(Number(v));
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Fill only missing fields; if some macros exist, derive the rest from remaining kcal. */
function computeFill(calories: number, protein?: unknown, carbs?: unknown, fat?: unknown) {
  const cal = Math.max(1, Math.round(Number(calories) || 400));
  const needP = isMissing(protein);
  const needC = isMissing(carbs);
  const needF = isMissing(fat);
  if (!needP && !needC && !needF) return null;
  const P0 = needP ? 0 : num(protein);
  const C0 = needC ? 0 : num(carbs);
  const F0 = needF ? 0 : num(fat);
  const used = (needP ? 0 : 4 * P0) + (needC ? 0 : 4 * C0) + (needF ? 0 : 9 * F0);
  let rem = cal - used;
  const h = macrosFromCalories(cal);
  const $set: Record<string, number> = {};
  if (needP && needC && needF) {
    $set.protein = h.protein;
    $set.carbs = h.carbs;
    $set.fat = h.fat;
    return $set;
  }
  if (rem < 0) {
    $set.protein = needP ? h.protein : P0;
    $set.carbs = needC ? h.carbs : C0;
    $set.fat = needF ? h.fat : F0;
    return $set;
  }
  if (needP && !needC && !needF) $set.protein = Math.max(0, Math.round(rem / 4));
  else if (!needP && needC && !needF) $set.carbs = Math.max(0, Math.round(rem / 4));
  else if (!needP && !needC && needF) $set.fat = Math.max(0, Math.round(rem / 9));
  else if (needP && needC && !needF) {
    $set.protein = Math.max(0, Math.round((rem * 0.55) / 4));
    $set.carbs = Math.max(0, Math.round((rem - 4 * $set.protein) / 4));
  } else if (needP && !needC && needF) {
    $set.protein = Math.max(0, Math.round((rem * 0.55) / 4));
    $set.fat = Math.max(0, Math.round((rem - 4 * $set.protein) / 9));
  } else if (!needP && needC && needF) {
    $set.carbs = Math.max(0, Math.round((rem * 0.55) / 4));
    $set.fat = Math.max(0, Math.round((rem - 4 * $set.carbs) / 9));
  } else {
    $set.protein = needP ? h.protein : P0;
    $set.carbs = needC ? h.carbs : C0;
    $set.fat = needF ? h.fat : F0;
  }
  return $set;
}

export async function seedRecipeMacros(): Promise<void> {
  const all = await Recipe.find({}).lean();
  let updated = 0;
  for (const r of all) {
    const doc = r as any;
    const $set = computeFill(doc.calories, doc.protein, doc.carbs, doc.fat);
    if (!$set || Object.keys($set).length === 0) continue;
    await Recipe.updateOne({ _id: doc._id }, { $set });
    updated += 1;
  }
  console.log(`✅ Updated macros on ${updated} recipe(s) (missing protéines/glucides/lipides only).`);
}

if (require.main === module) {
  runSeed('recipe-macros', seedRecipeMacros)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
