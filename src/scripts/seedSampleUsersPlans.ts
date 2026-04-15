/**
 * Seed a small sample cohort (default: 5 users) with:
 * - user accounts and levels
 * - ACTIVE subscriptions linked to level templates
 * - Daily programs using existing session templates (and therefore existing exercises)
 *
 * This script is idempotent for the seeded emails:
 * it upserts users/subscriptions and upserts daily programs by (userId, date).
 *
 * Usage:
 *   ts-node src/scripts/seedSampleUsersPlans.ts
 *   SEED_SAMPLE_USERS=10 ts-node src/scripts/seedSampleUsersPlans.ts
 */
import bcrypt from 'bcrypt';
import User from '../models/User.model';
import Exercise from '../models/Exercise.model';
import SessionTemplate from '../models/SessionTemplate.model';
import LevelTemplate from '../models/LevelTemplate.model';
import Subscription from '../models/Subscription.model';
import DailyProgram from '../models/DailyProgram.model';
import { runSeed } from './runSeed';

const DEFAULT_PASSWORD = 'password123';
const LEVELS: Array<'Intiate' | 'Fighter' | 'Warrior' | 'Champion' | 'Elite'> = [
  'Intiate',
  'Fighter',
  'Warrior',
  'Champion',
  'Elite',
];
const OBJECTIFS = ['Prise de masse', 'Sèche', 'Force', 'Endurance'];
const SAMPLE_PREFIX = 'sample.plan.user';
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function getSeedSize(): number {
  const env = Number(process.env.SEED_SAMPLE_USERS || 5);
  if (Number.isNaN(env) || env < 1) return 5;
  return Math.min(env, 50);
}

function getTodayStart(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

export async function seedSampleUsersPlans(): Promise<number> {
  const userCount = getSeedSize();
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
  const today = getTodayStart();
  const subscriptionStart = new Date(today);
  const subscriptionEnd = addDays(today, 35);
  subscriptionEnd.setHours(23, 59, 59, 999);

  // Ensure we rely on already-seeded exercise data.
  const exerciseCount = await Exercise.countDocuments();
  if (exerciseCount === 0) {
    throw new Error('No exercises found in DB. Seed exercises first, then rerun this script.');
  }

  const sessionTemplates = await SessionTemplate.find().select('_id title').lean();
  if (sessionTemplates.length === 0) {
    throw new Error('No session templates found. Seed sessions first, then rerun this script.');
  }

  const levelTemplates = await LevelTemplate.find().select('_id name').lean();
  if (levelTemplates.length === 0) {
    throw new Error('No level templates found. Seed levels first, then rerun this script.');
  }

  const levelByName = new Map<string, any>();
  for (const lt of levelTemplates as any[]) levelByName.set(lt.name, lt._id);
  const fallbackLevelTemplateId = (levelTemplates[0] as any)._id;
  const activeSessionIds = (sessionTemplates as any[]).slice(0, Math.min(6, sessionTemplates.length)).map((s) => s._id);

  let upsertedUsers = 0;
  let upsertedSubs = 0;
  let upsertedDailyPrograms = 0;

  for (let i = 0; i < userCount; i++) {
    const level = LEVELS[i % LEVELS.length];
    const email = `${SAMPLE_PREFIX}${i + 1}@diettemple.com`;
    const phone = `+2169000${String(i + 1).padStart(4, '0')}`;
    const objectif = OBJECTIFS[i % OBJECTIFS.length];

    const user = await User.findOneAndUpdate(
      { email },
      {
        $set: {
          email,
          phone,
          name: `Sample User ${i + 1}`,
          passwordHash,
          role: 'user',
          level,
          objectif,
          age: String(20 + (i % 18)),
          sexe: i % 2 === 0 ? 'M' : 'F',
          xp: i * 50,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    upsertedUsers++;

    const levelTemplateId = levelByName.get(level === 'Intiate' ? 'Initiate' : level) || fallbackLevelTemplateId;
    await Subscription.findOneAndUpdate(
      { userId: (user as any)._id },
      {
        $set: {
          userId: (user as any)._id,
          levelTemplateId,
          status: 'ACTIVE',
          startAt: subscriptionStart,
          endAt: subscriptionEnd,
          autoRenew: false,
          history: [
            {
              action: 'assign',
              toLevelTemplateId: levelTemplateId,
              date: subscriptionStart,
              note: 'Seeded sample subscription',
            },
          ],
        },
      },
      { upsert: true }
    );
    upsertedSubs++;

    // Build 14 days of programs from existing session templates.
    for (let day = 0; day < 14; day++) {
      const date = addDays(today, day);
      date.setHours(0, 0, 0, 0);
      const sessionTemplateId = activeSessionIds[day % activeSessionIds.length];
      await DailyProgram.findOneAndUpdate(
        { userId: (user as any)._id, date },
        {
          $set: {
            userId: (user as any)._id,
            date,
            weekNumber: Math.floor(day / 7) + 1,
            sessionTemplateId,
            sessionId: null,
            calorieTarget: 2200 + (i % 4) * 100,
            waterTarget: 2500,
            completed: false,
            mainObjective: {
              title: 'Workout',
              description: 'Session planifiée depuis les modèles existants.',
            },
          },
        },
        { upsert: true, setDefaultsOnInsert: true }
      );
      upsertedDailyPrograms++;
    }
  }

  console.log(`✅ Users upserted: ${upsertedUsers}`);
  console.log(`✅ Subscriptions upserted: ${upsertedSubs}`);
  console.log(`✅ DailyPrograms upserted: ${upsertedDailyPrograms}`);
  console.log(`✅ Reused existing DB exercises count: ${exerciseCount}`);
  console.log(`🔐 Sample users password: ${DEFAULT_PASSWORD}`);
  console.log(`📧 Seeded email pattern: ${SAMPLE_PREFIX}N@diettemple.com`);

  return upsertedUsers;
}

if (require.main === module) {
  runSeed('sample-users-plans', seedSampleUsersPlans)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

