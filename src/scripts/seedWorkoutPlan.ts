/**
 * seedWorkoutPlan.ts
 * Creates SessionTemplates, a LevelTemplate (5 weeks), and assigns it to user1@diettemple.com.
 * Uses ONLY existing exercises from the database — never creates new exercises.
 *
 * Run: npm run seed:workout-plan
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not set in .env');
  process.exit(1);
}

// ── Import models ────────────────────────────────────────────────────────────
import Exercise from '../models/Exercise.model';
import SessionTemplate from '../models/SessionTemplate.model';
import LevelTemplate from '../models/LevelTemplate.model';
import User from '../models/User.model';
import ClientPlanOverride from '../models/ClientPlanOverride.model';

// ── Helpers ──────────────────────────────────────────────────────────────────

function pickByKeywords(
  exercises: { _id: mongoose.Types.ObjectId; name: string; muscleGroup?: string }[],
  keywords: string[]
): { _id: mongoose.Types.ObjectId; name: string; muscleGroup?: string }[] {
  const lower = keywords.map((k) => k.toLowerCase());
  return exercises.filter((ex) => {
    const mg = (ex.muscleGroup ?? '').toLowerCase();
    const nm = (ex.name ?? '').toLowerCase();
    return lower.some((kw) => mg.includes(kw) || nm.includes(kw));
  });
}

function sliceFallback<T>(arr: T[], start: number, end: number, fallback: T[]): T[] {
  const slice = arr.slice(start, end);
  if (slice.length >= 2) return slice;
  // Use fallback fill
  const used = arr.map((a) => JSON.stringify(a));
  const extra = fallback.filter((f) => !used.includes(JSON.stringify(f)));
  return [...slice, ...extra].slice(0, Math.max(4, slice.length));
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  await mongoose.connect(MONGODB_URI as string);
  console.log('✅ Connected to MongoDB');

  // ── 1. Fetch all exercises ────────────────────────────────────────────────
  const allExercises = await Exercise.find().select('name muscleGroup').lean() as {
    _id: mongoose.Types.ObjectId;
    name: string;
    muscleGroup?: string;
  }[];

  if (allExercises.length < 5) {
    console.warn(`⚠️ Only ${allExercises.length} exercises found — need at least 5. Run seed:exercises first.`);
    await mongoose.disconnect();
    process.exit(0);
  }
  console.log(`✅ Found ${allExercises.length} exercises`);

  // ── 2. Partition exercises into Push / Pull / Legs ─────────────────────────
  const pushKeywords = ['chest', 'pec', 'shoulder', 'delt', 'tricep', 'push', 'press', 'poitrine', 'épaule', 'triceps'];
  const pullKeywords = ['back', 'bicep', 'lat', 'row', 'pull', 'dos', 'biceps', 'curl'];
  const legsKeywords = ['quad', 'hamstring', 'glute', 'calf', 'leg', 'squat', 'lunge', 'jambe', 'cuisse'];

  let pushExercises = pickByKeywords(allExercises, pushKeywords);
  let pullExercises = pickByKeywords(allExercises, pullKeywords);
  let legsExercises = pickByKeywords(allExercises, legsKeywords);

  // Fallback: split thirds if muscle-group matching yields too few
  const third = Math.ceil(allExercises.length / 3);
  if (pushExercises.length < 2) {
    pushExercises = sliceFallback(allExercises, 0, third, allExercises);
  }
  if (pullExercises.length < 2) {
    pullExercises = sliceFallback(allExercises, third, 2 * third, allExercises);
  }
  if (legsExercises.length < 2) {
    legsExercises = sliceFallback(allExercises, 2 * third, allExercises.length, allExercises);
  }

  // Cap at 6 per session
  const toItems = (
    exs: { _id: mongoose.Types.ObjectId }[],
    numSets = 3,
    reps = 10,
    rest = 60
  ) =>
    exs.slice(0, 6).map((ex, i) => ({
      exerciseId: ex._id,
      alternatives: [],
      sets: numSets,
      targetReps: reps,
      restTimeSeconds: rest,
      order: i,
    }));

  // ── 3. Wipe existing SessionTemplates / LevelTemplate / ClientPlanOverride ──

  const SESSION_TITLES = {
    push: 'Session A — Push',
    pull: 'Session B — Pull',
    legs: 'Session C — Legs',
  };
  const LEVEL_NAME = 'Niveau Débutant';

  await SessionTemplate.deleteMany({ title: { $in: Object.values(SESSION_TITLES) } });
  console.log('🗑️  Deleted existing SessionTemplates (Push / Pull / Legs)');

  await LevelTemplate.deleteMany({ name: LEVEL_NAME });
  console.log('🗑️  Deleted existing LevelTemplate: Niveau Débutant');

  const targetEmail = 'user1@diettemple.com';
  const user = await User.findOne({ email: targetEmail }).lean();
  if (!user) {
    console.error(`❌ User not found: ${targetEmail}. Run seed:users first.`);
    await mongoose.disconnect();
    process.exit(1);
  }
  console.log(`✅ Found user: ${targetEmail}`);

  await ClientPlanOverride.deleteMany({ userId: user._id });
  console.log(`🗑️  Deleted existing ClientPlanOverride for ${targetEmail}`);

  // ── 4. Create fresh SessionTemplates ─────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sessionA: any = await SessionTemplate.create({
    title: SESSION_TITLES.push,
    description: 'Poitrine, épaules et triceps',
    difficulty: 'beginner',
    durationMinutes: 45,
    items: toItems(pushExercises),
    tags: ['push', 'beginner'],
  });
  console.log('✅ Created SessionTemplate: Session A — Push');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sessionB: any = await SessionTemplate.create({
    title: SESSION_TITLES.pull,
    description: 'Dos et biceps',
    difficulty: 'beginner',
    durationMinutes: 45,
    items: toItems(pullExercises),
    tags: ['pull', 'beginner'],
  });
  console.log('✅ Created SessionTemplate: Session B — Pull');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sessionC: any = await SessionTemplate.create({
    title: SESSION_TITLES.legs,
    description: 'Quadriceps, ischio-jambiers et mollets',
    difficulty: 'beginner',
    durationMinutes: 50,
    items: toItems(legsExercises),
    tags: ['legs', 'beginner'],
  });
  console.log('✅ Created SessionTemplate: Session C — Legs');

  const idA = sessionA._id;
  const idB = sessionB._id;
  const idC = sessionC._id;

  // ── 4. Build LevelTemplate weeks ──────────────────────────────────────────
  // All 7 days have a session, cycling Push → Pull → Legs → Push → Pull → Legs → Push
  const cycle = [idA, idB, idC, idA, idB, idC, idA]; // mon→sun
  const weekDays = (weekIdx: number) => ({
    weekNumber: weekIdx + 1,
    days: {
      mon: [{ sessionTemplateId: cycle[0], order: 0 }],
      tue: [{ sessionTemplateId: cycle[1], order: 0 }],
      wed: [{ sessionTemplateId: cycle[2], order: 0 }],
      thu: [{ sessionTemplateId: cycle[3], order: 0 }],
      fri: [{ sessionTemplateId: cycle[4], order: 0 }],
      sat: [{ sessionTemplateId: cycle[5], order: 0 }],
      sun: [{ sessionTemplateId: cycle[6], order: 0 }],
    },
  });

  const weeks = [0, 1, 2, 3, 4].map(weekDays);

  // ── 5. Create fresh LevelTemplate ────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const levelTemplate: any = await LevelTemplate.create({
    name: LEVEL_NAME,
    description: 'Plan débutant 5 semaines — Push/Pull/Legs (Lundi/Mercredi/Vendredi)',
    isActive: true,
    gender: 'M',
    weeks,
  });
  console.log('✅ Created LevelTemplate: Niveau Débutant');

  const levelId = levelTemplate._id;

  // ── 6. Create fresh ClientPlanOverride ────────────────────────────────────
  const defaultOverrideWeeks = [1, 2, 3, 4, 5].map((weekNumber) => ({
    weekNumber,
    days: { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] },
  }));

  await ClientPlanOverride.create({
    userId: user._id,
    baseLevelTemplateId: levelId,
    overridesByWeek: defaultOverrideWeeks,
    status: 'active',
  });
  console.log(`✅ Created ClientPlanOverride for ${targetEmail} → Niveau Débutant`);

  console.log('\n🎉 seedWorkoutPlan complete!');
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Seed failed:', err);
  mongoose.disconnect().finally(() => process.exit(1));
});
