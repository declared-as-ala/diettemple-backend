/**
 * Seed nutrition data for user1@diettemple.com: 5 meals with concrete items (e.g. 100 g escalope, 100 g riz),
 * plus recommendations. Nutrition page shows Meal 1–5, recommendations, then Mes recettes favorites.
 * Run: npm run seed:user1-nutrition
 * Requires: seed:users (user1 must exist).
 */
import User from '../models/User.model';
import NutritionPlanTemplate from '../models/NutritionPlanTemplate.model';
import UserNutritionPlan from '../models/UserNutritionPlan.model';
import DailyNutritionLog from '../models/DailyNutritionLog.model';
import { runSeed } from './runSeed';

const USER_EMAIL = 'user1@diettemple.com';
const DAILY_CALORIES = 2200;
const CONSUMED_CALORIES = 1450;

const MEALS_TEMPLATE = [
  {
    title: 'Repas 1 (Petit-déjeuner)',
    targetCalories: 450,
    items: [
      { name: '100 g escalope de dinde', calories: 110, proteinG: 24, carbsG: 0, fatG: 1 },
      { name: '100 g riz complet cuit', calories: 130, proteinG: 3, carbsG: 28, fatG: 1 },
      { name: '1 œuf dur', calories: 78, proteinG: 6, carbsG: 1, fatG: 5 },
      { name: 'Salade verte', calories: 30, proteinG: 2, carbsG: 4, fatG: 0 },
    ],
  },
  {
    title: 'Repas 2 (Collation matin)',
    targetCalories: 250,
    items: [
      { name: '1 pomme', calories: 95, proteinG: 0, carbsG: 25, fatG: 0 },
      { name: '30 g amandes', calories: 174, proteinG: 6, carbsG: 6, fatG: 15 },
    ],
  },
  {
    title: 'Repas 3 (Déjeuner)',
    targetCalories: 600,
    items: [
      { name: '150 g poulet grillé', calories: 248, proteinG: 46, carbsG: 0, fatG: 7 },
      { name: '150 g riz basmati cuit', calories: 195, proteinG: 4, carbsG: 43, fatG: 0 },
      { name: '100 g haricots verts', calories: 31, proteinG: 2, carbsG: 7, fatG: 0 },
      { name: '1 cuillère à soupe huile d\'olive', calories: 120, proteinG: 0, carbsG: 0, fatG: 14 },
    ],
  },
  {
    title: 'Repas 4 (Collation après-midi)',
    targetCalories: 200,
    items: [
      { name: '1 yaourt nature 0%', calories: 56, proteinG: 10, carbsG: 6, fatG: 0 },
      { name: '1 banane', calories: 105, proteinG: 1, carbsG: 27, fatG: 0 },
      { name: 'Café ou thé sans sucre', calories: 2, proteinG: 0, carbsG: 0, fatG: 0 },
    ],
  },
  {
    title: 'Repas 5 (Dîner)',
    targetCalories: 700,
    items: [
      { name: '150 g saumon', calories: 312, proteinG: 39, carbsG: 0, fatG: 18 },
      { name: '120 g pâtes complètes', calories: 148, proteinG: 6, carbsG: 30, fatG: 1 },
      { name: '100 g brocoli', calories: 34, proteinG: 3, carbsG: 7, fatG: 0 },
      { name: 'Salade tomates concombres', calories: 45, proteinG: 2, carbsG: 8, fatG: 0 },
    ],
  },
];

const RECOMMENDATIONS = [
  'Buvez au moins 1,5 L d\'eau par jour, surtout autour des repas.',
  'Privilégiez les protéines à chaque repas pour la satiété et la récupération musculaire.',
  'Mangez lentement et à heures régulières pour une meilleure digestion.',
  'Évitez les boissons sucrées ; préférez eau, thé ou café sans sucre.',
  'Variez les sources de glucides : riz, pâtes, quinoa, patate douce.',
];

export async function seedUser1Nutrition(): Promise<void> {
  const user = await User.findOne({ email: USER_EMAIL }).select('_id').lean();
  if (!user) {
    throw new Error(`User not found: ${USER_EMAIL}. Run seed:users first.`);
  }
  const userId = (user as any)._id;

  const today = new Date();
  const dateStr = today.toISOString().split('T')[0];
  const dateUtcMidnight = new Date(dateStr);
  const startAt = new Date(dateUtcMidnight);
  startAt.setDate(startAt.getDate() - 7);
  const endAt = new Date(dateUtcMidnight);
  endAt.setDate(endAt.getDate() + 60);

  let templateId: any = null;
  const existingTemplate = await NutritionPlanTemplate.findOne({ name: 'Plan Standard' }).select('_id').lean();
  if (!existingTemplate) {
    const created = await NutritionPlanTemplate.create({
      name: 'Plan Standard',
      description: 'Plan équilibré 5 repas pour user1',
      goalType: 'maintain',
      dailyCalories: DAILY_CALORIES,
      macros: { proteinG: 120, carbsG: 250, fatG: 75 },
      mealsTemplate: MEALS_TEMPLATE,
      recommendations: RECOMMENDATIONS,
    });
    templateId = created._id;
    console.log('✅ Created NutritionPlanTemplate "Plan Standard" (5 repas + recommandations)');
  } else {
    templateId = (existingTemplate as any)._id;
    await NutritionPlanTemplate.updateOne(
      { _id: templateId },
      { $set: { mealsTemplate: MEALS_TEMPLATE, recommendations: RECOMMENDATIONS } }
    );
    console.log('✅ Updated NutritionPlanTemplate with 5 meals and recommendations');
  }

  let assignment = await UserNutritionPlan.findOne({ userId, status: 'ACTIVE' }).lean();
  if (assignment) {
    await UserNutritionPlan.updateOne(
      { _id: (assignment as any)._id },
      { $set: { startAt, endAt, nutritionPlanTemplateId: templateId } }
    );
    console.log('✅ Updated UserNutritionPlan for user1');
  } else {
    await UserNutritionPlan.create({
      userId,
      nutritionPlanTemplateId: templateId,
      startAt,
      endAt,
      status: 'ACTIVE',
    });
    console.log('✅ Created UserNutritionPlan for user1');
  }

  const logExisting = await DailyNutritionLog.findOne({ userId, date: dateUtcMidnight }).lean();
  const logPayload = {
    userId,
    date: dateUtcMidnight,
    consumedCalories: CONSUMED_CALORIES,
    consumedMacros: { proteinG: 85, carbsG: 140, fatG: 45 },
    waterMl: 1500,
    status: 'incomplete' as const,
  };
  if (logExisting) {
    await DailyNutritionLog.updateOne({ _id: (logExisting as any)._id }, { $set: logPayload });
    console.log(`✅ DailyNutritionLog updated for ${dateStr}: ${CONSUMED_CALORIES} kcal`);
  } else {
    await DailyNutritionLog.create(logPayload);
    console.log(`✅ DailyNutritionLog created for ${dateStr}: ${CONSUMED_CALORIES} kcal`);
  }

  console.log('\n  Nutrition page: 5 repas (items détaillés), recommandations, puis Mes recettes favorites.');
}

if (require.main === module) {
  runSeed('user1-nutrition', seedUser1Nutrition)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
