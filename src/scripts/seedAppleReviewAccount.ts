/**
 * Apple App Review demo account — idempotent seed.
 *
 * Creates or refreshes the review account(s) with a complete profile and
 * realistic, fully populated data so a reviewer can exercise every feature:
 *   - complete profile (name, age, sex, weight, height, goal, level)
 *   - ACTIVE subscription valid for SUBSCRIPTION_DAYS (default 90)
 *   - 5-week workout plan with a session scheduled TODAY (reels testable)
 *   - nutrition plan: 5 detailed meals + recommendations + today's log
 *   - exercise history (SessionReels "Historique" panel)
 *   - a few recipe favorites
 *
 * Safe to run repeatedly: users are upserted by email, all sub-seeds upsert
 * by natural keys, and no other user's data is read or written.
 *
 * Run on the production server (from the backend directory):
 *   npm run seed:apple-review
 * Optional env:
 *   APPLE_REVIEW_EMAILS=user1@diettemple.tn,user1@diettemple.com
 *   APPLE_REVIEW_PASSWORD=...        (defaults to the review password)
 *   APPLE_REVIEW_SUBSCRIPTION_DAYS=90
 */
import bcrypt from 'bcrypt';
import User from '../models/User.model';
import Subscription from '../models/Subscription.model';
import Recipe from '../models/Recipe.model';
import RecipeFavorite from '../models/RecipeFavorite.model';
import { runSeed } from './runSeed';
import { seedUser1Plan } from './seedUser1Plan';
import { seedUser1Nutrition } from './seedUser1Nutrition';
import { seedExerciseHistory } from './seedExerciseHistory';

const REVIEW_EMAILS = (process.env.APPLE_REVIEW_EMAILS || 'user1@diettemple.tn,user1@diettemple.com')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);
const REVIEW_PASSWORD = process.env.APPLE_REVIEW_PASSWORD || 'password123';
const SUBSCRIPTION_DAYS = Number(process.env.APPLE_REVIEW_SUBSCRIPTION_DAYS || 90);

const REVIEW_PROFILE = {
  name: 'Demo User',
  age: '28',
  sexe: 'M',
  poids: '78',
  taille: '178',
  objectif: 'Prise de masse',
  level: 'Intiate' as const,
  role: 'user' as const,
};

async function seedReviewAccount(email: string): Promise<void> {
  console.log(`\n──── Seeding review account: ${email} ────`);

  // 1. Upsert the user with a complete profile and known password.
  const passwordHash = await bcrypt.hash(REVIEW_PASSWORD, 10);
  const user = await User.findOneAndUpdate(
    { email },
    { $set: { email, passwordHash, ...REVIEW_PROFILE } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  console.log(`✅ User upserted (${user._id})`);

  // 2. Workout plan (5 weeks, session today) + subscription (upserted inside).
  await seedUser1Plan(email);

  // 3. Extend the subscription so it stays ACTIVE for the whole review window.
  const now = new Date();
  const endAt = new Date(now);
  endAt.setDate(endAt.getDate() + SUBSCRIPTION_DAYS);
  endAt.setHours(23, 59, 59, 999);
  await Subscription.updateOne(
    { userId: user._id },
    { $set: { status: 'ACTIVE', endAt } }
  );
  console.log(`✅ Subscription ACTIVE until ${endAt.toISOString().slice(0, 10)} (${SUBSCRIPTION_DAYS} days)`);

  // 4. Nutrition plan, meals and today's log.
  await seedUser1Nutrition(email);

  // 5. Exercise history for the reels "Historique" panel.
  await seedExerciseHistory(email);

  // 6. A few recipe favorites (idempotent via unique userId+recipeId index).
  const recipes = await Recipe.find().limit(4).select('_id').lean();
  let favorites = 0;
  for (const r of recipes as any[]) {
    const existing = await RecipeFavorite.findOne({ userId: user._id, recipeId: r._id }).lean();
    if (existing) continue;
    await RecipeFavorite.create({ userId: user._id, recipeId: r._id });
    favorites++;
  }
  console.log(`✅ Recipe favorites: ${favorites} added (${recipes.length} total ensured)`);
}

export async function seedAppleReviewAccounts(): Promise<void> {
  for (const email of REVIEW_EMAILS) {
    await seedReviewAccount(email);
  }
  console.log('\nDone. Review account(s) ready:');
  for (const email of REVIEW_EMAILS) {
    console.log(`  ${email} / <APPLE_REVIEW_PASSWORD>`);
  }
  console.log('Verify with: POST /api/auth/login {"emailOrPhone":"<email>","password":"<password>"}');
}

if (require.main === module) {
  runSeed('apple-review-account', seedAppleReviewAccounts)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
