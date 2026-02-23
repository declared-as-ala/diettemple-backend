/**
 * Seed "today" session + nutrition for user1@diettemple.com.
 * Uses the server's current date so GET /api/me/today (no query) returns this data.
 * Idempotent: creates or updates DailyProgram and DailyNutritionLog for that user/date.
 * Requires: seed:users, seed:exercises, seed:sessions, seed:levels, seed:subscriptions.
 */
import User from '../models/User.model';
import Subscription from '../models/Subscription.model';
import LevelTemplate from '../models/LevelTemplate.model';
import SessionTemplate from '../models/SessionTemplate.model';
import DailyProgram from '../models/DailyProgram.model';
import DailyNutritionLog from '../models/DailyNutritionLog.model';
import { runSeed } from './runSeed';

const USER_EMAIL = 'user1@diettemple.com';
const SESSION_TITLE = 'Push A (Chest Focus)';
/** Consumed calories to show on home ring (objectif du jour). */
const SEED_CONSUMED_CALORIES = 1450;

export async function seedUser1Today(): Promise<{ created: number; updated: number }> {
  const TARGET_DATE = new Date();
  TARGET_DATE.setHours(0, 0, 0, 0);
  const endOfDay = new Date(TARGET_DATE);
  endOfDay.setHours(23, 59, 59, 999);
  const dateKey = TARGET_DATE.toISOString().split('T')[0];

  const user = await User.findOne({ email: USER_EMAIL }).select('_id').lean();
  if (!user) {
    throw new Error(`User not found: ${USER_EMAIL}. Run seed:users first.`);
  }
  const userId = (user as any)._id;

  let sessionTemplate = await SessionTemplate.findOne({ title: SESSION_TITLE }).select('_id title').lean();
  if (!sessionTemplate) {
    const anyTemplate = await SessionTemplate.findOne().select('_id title').lean();
    if (!anyTemplate) {
      throw new Error('No session templates found. Run seed:exercises then seed:sessions first.');
    }
    sessionTemplate = anyTemplate;
    console.log(`⚠️  "${SESSION_TITLE}" not found; using "${(sessionTemplate as any).title}" instead.`);
  }
  const sessionTemplateId = (sessionTemplate as any)._id;

  const initiate = await LevelTemplate.findOne({ name: 'Initiate' }).select('_id').lean();
  if (!initiate) {
    throw new Error('Level template "Initiate" not found. Run seed:levels first.');
  }

  // Subscription startAt = Monday of the week containing TARGET_DATE, so "week 1" in the app shows that week (e.g. 9–15 Feb including 14th)
  const startAt = new Date(TARGET_DATE);
  const dayOfWeek = startAt.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  startAt.setDate(startAt.getDate() + mondayOffset);
  startAt.setHours(0, 0, 0, 0);

  let sub = await Subscription.findOne({ userId }).lean();
  if (!sub || (sub as any).status !== 'ACTIVE' || new Date((sub as any).endAt) < TARGET_DATE) {
    const endAt = new Date(TARGET_DATE);
    endAt.setDate(endAt.getDate() + 60);
    if (sub) {
      await Subscription.updateOne(
        { userId },
        { $set: { levelTemplateId: (initiate as any)._id, status: 'ACTIVE', startAt, endAt } }
      );
    } else {
      await Subscription.create({
        userId,
        levelTemplateId: (initiate as any)._id,
        status: 'ACTIVE',
        startAt,
        endAt,
        autoRenew: false,
        history: [{ action: 'assign', toLevelTemplateId: (initiate as any)._id, date: startAt }],
      });
    }
    console.log(`✅ Ensured active subscription for user1 covering ${dateKey}`);
  }

  const existing = await DailyProgram.findOne({
    userId,
    date: { $gte: TARGET_DATE, $lte: endOfDay },
  });

  const payload = {
    userId,
    date: TARGET_DATE,
    weekNumber: 1,
    sessionTemplateId,
    sessionId: null,
    calorieTarget: 2200,
    waterTarget: 2500,
    completed: false,
    mainObjective: { title: 'Workout', description: 'Complete your scheduled session.' },
  };

  if (existing) {
    await DailyProgram.updateOne({ _id: (existing as any)._id }, { $set: payload });
  } else {
    await DailyProgram.create(payload);
  }
  console.log(`✅ DailyProgram for user1@diettemple.com on ${dateKey} (calorieTarget: 2200)`);

  // Seed consumed calories + one sample scan entry (e.g. 1450 kcal from poulet + riz)
  const sampleEntry = {
    entryId: new (await import('mongoose')).default.Types.ObjectId(),
    source: 'scan' as const,
    items: [
      { name: 'Poulet, blanc, grillé', grams: 150, kcal: 248, protein: 47, carbs: 0, fat: 6 },
      { name: 'Riz blanc cuit', grams: 120, kcal: 156, protein: 2, carbs: 34, fat: 0 },
    ],
    createdAt: new Date(),
  };
  const entryCal = sampleEntry.items.reduce((s, i) => s + i.kcal, 0);
  const entryMacros = sampleEntry.items.reduce(
    (a, i) => ({
      proteinG: (a.proteinG || 0) + i.protein,
      carbsG: (a.carbsG || 0) + i.carbs,
      fatG: (a.fatG || 0) + i.fat,
    }),
    { proteinG: 0, carbsG: 0, fatG: 0 }
  );
  const logExisting = await DailyNutritionLog.findOne({ userId, date: { $gte: TARGET_DATE, $lte: endOfDay } }).lean();
  const logPayload = {
    userId,
    date: TARGET_DATE,
    consumedCalories: entryCal,
    consumedMacros: { proteinG: entryMacros.proteinG, carbsG: entryMacros.carbsG, fatG: entryMacros.fatG },
    entries: [sampleEntry],
    status: 'incomplete' as const,
  };
  if (logExisting) {
    await DailyNutritionLog.updateOne({ _id: (logExisting as any)._id }, { $set: logPayload });
    console.log(`✅ DailyNutritionLog updated for ${dateKey}: ${SEED_CONSUMED_CALORIES} kcal + 1 scan entry`);
  } else {
    await DailyNutritionLog.create(logPayload);
    console.log(`✅ DailyNutritionLog created for ${dateKey}: ${SEED_CONSUMED_CALORIES} kcal + 1 scan entry`);
  }

  return { created: existing ? 0 : 1, updated: existing ? 1 : 0 };
}

if (require.main === module) {
  runSeed('user1-today', async () => {
    const counts = await seedUser1Today();
    console.log(`Done. Created: ${counts.created}, Updated: ${counts.updated}`);
    console.log(`\nToday dateKey: ${new Date().toISOString().split('T')[0]}`);
    console.log('  GET /api/me/today (no query) -> returns nutritionTargets.dailyCalories: 2200, log.consumedCalories:', SEED_CONSUMED_CALORIES);
  })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
