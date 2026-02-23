/**
 * Seed realistic 5-week plan for user1@diettemple.com with TODAY as a workout day.
 * Idempotent: upserts subscription + DailyPrograms by (userId, date).
 * Requires: seed:users, seed:exercises, seed:sessions, seed:levels.
 */
import User from '../models/User.model';
import Subscription from '../models/Subscription.model';
import LevelTemplate from '../models/LevelTemplate.model';
import SessionTemplate from '../models/SessionTemplate.model';
import DailyProgram from '../models/DailyProgram.model';
import { runSeed } from './runSeed';

const USER_EMAIL = 'user1@diettemple.com';
const DURATION_WEEKS = 5;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Server local today date (start of day). Override with SEED_TODAY_DATE=YYYY-MM-DD. */
function getTodayDate(): Date {
  const env = process.env.SEED_TODAY_DATE;
  if (env) {
    const [y, m, d] = env.split('-').map(Number);
    return new Date(y, m - 1, d, 0, 0, 0, 0);
  }
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return t;
}

function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Monday of the week containing d (local). */
function mondayOf(d: Date): Date {
  const t = new Date(d);
  t.setHours(0, 0, 0, 0);
  const day = t.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  t.setDate(t.getDate() + offset);
  return t;
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

export async function seedUser1Plan(): Promise<{
  planStartDate: Date;
  planEndDate: Date;
  todayDateKey: string;
  todaySessionTitle: string | null;
  dailyProgramsCreated: number;
  dailyProgramsUpdated: number;
}> {
  const today = getTodayDate();
  const todayDateKey = dateKey(today);

  const user = await User.findOne({ email: USER_EMAIL }).select('_id').lean();
  if (!user) throw new Error(`User not found: ${USER_EMAIL}. Run seed:users first.`);
  const userId = (user as any)._id;

  const level = await LevelTemplate.findOne({ name: 'Initiate' }).lean();
  if (!level) throw new Error('LevelTemplate "Initiate" not found. Run seed:levels first.');

  const sessions = await SessionTemplate.find()
    .select('_id title')
    .lean();
  const byTitle = new Map<string, any>();
  (sessions as any[]).forEach((s: any) => byTitle.set(s.title, s._id));

  const pushA = byTitle.get('Push A (Chest Focus)');
  const pullA = byTitle.get('Pull A (Back Width)');
  const legsA = byTitle.get('Legs A (Quads Focus)');
  const pushB = byTitle.get('Push B (Shoulder Focus)');
  const pullB = byTitle.get('Pull B (Back Thickness)');
  const rest = byTitle.get('Rest / Mobility (Optional)');
  if (!pushA || !pullA || !legsA) {
    throw new Error('Missing session templates. Run seed:sessions first.');
  }

  // Plan: Mon Push, Tue Pull, Wed Legs, Thu Rest, Fri Push, Sat Pull, Sun Rest (5–6 workouts/week)
  const weekSchedule: (string | null)[] = [
    'Push A (Chest Focus)',
    'Pull A (Back Width)',
    'Legs A (Quads Focus)',
    null,
    'Push B (Shoulder Focus)',
    'Pull B (Back Thickness)',
    null,
  ];
  const titleToId = (title: string) => byTitle.get(title) || pushA;

  // Plan start = Monday of the week containing TODAY so that "this week" is Week 1 and today is in it
  const planStartDate = mondayOf(today);
  const planEndDate = addDays(planStartDate, DURATION_WEEKS * 7);
  planEndDate.setHours(23, 59, 59, 999);

  // Upsert subscription
  const subPayload = {
    userId,
    levelTemplateId: (level as any)._id,
    status: 'ACTIVE' as const,
    startAt: planStartDate,
    endAt: planEndDate,
    autoRenew: false,
    history: [{ action: 'assign', toLevelTemplateId: (level as any)._id, date: planStartDate }],
  };
  await Subscription.findOneAndUpdate(
    { userId },
    { $set: subPayload },
    { upsert: true }
  );
  console.log('✅ Subscription upserted: start', dateKey(planStartDate), 'end', dateKey(planEndDate));

  let created = 0;
  let updated = 0;
  let todaySessionTitle: string | null = null;

  for (let week = 0; week < DURATION_WEEKS; week++) {
    for (let day = 0; day < 7; day++) {
      const sessionTitle = weekSchedule[day];
      const sessionTemplateId = sessionTitle ? titleToId(sessionTitle) : null;
      const date = addDays(planStartDate, week * 7 + day);
      date.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      const payload = {
        userId,
        date,
        weekNumber: week + 1,
        sessionTemplateId: sessionTemplateId || undefined,
        sessionId: null,
        calorieTarget: 2200,
        waterTarget: 2500,
        completed: false,
        mainObjective: { title: sessionTitle ? 'Workout' : 'Recovery', description: sessionTitle ? 'Complete your scheduled session.' : 'Light mobility or rest.' },
      };

      const existing = await DailyProgram.findOne({
        userId,
        date: { $gte: date, $lte: endOfDay },
      });

      if (existing) {
        await DailyProgram.updateOne({ _id: (existing as any)._id }, { $set: payload });
        updated++;
      } else {
        await DailyProgram.create(payload);
        created++;
      }

      const key = dateKey(date);
      if (key === todayDateKey && sessionTitle) {
        todaySessionTitle = sessionTitle;
      }
    }
  }

  // CRITICAL: Ensure TODAY has a session (for testing Reels). If today was rest, overwrite with a workout.
  const todayStart = new Date(today.getTime());
  const todayEnd = new Date(today.getTime());
  todayEnd.setHours(23, 59, 59, 999);
  const existingToday = await DailyProgram.findOne({
    userId,
    date: { $gte: todayStart, $lte: todayEnd },
  });
  if (existingToday && !(existingToday as any).sessionTemplateId) {
    await DailyProgram.updateOne(
      { _id: (existingToday as any)._id },
      {
        $set: {
          sessionTemplateId: pushA,
          mainObjective: { title: 'Workout', description: 'Complete your scheduled session.' },
        },
      }
    );
    todaySessionTitle = 'Push A (Chest Focus)';
    console.log('✅ Today was rest — overwritten with Push A for testing');
  } else if (existingToday && (existingToday as any).sessionTemplateId) {
    const st = await SessionTemplate.findById((existingToday as any).sessionTemplateId).select('title').lean();
    todaySessionTitle = (st as any)?.title ?? 'Session';
  } else if (!existingToday) {
    await DailyProgram.create({
      userId,
      date: todayStart,
      weekNumber: Math.min(DURATION_WEEKS, Math.max(1, Math.floor((today.getTime() - planStartDate.getTime()) / MS_PER_DAY / 7) + 1)),
      sessionTemplateId: pushA,
      sessionId: null,
      calorieTarget: 2200,
      waterTarget: 2500,
      completed: false,
      mainObjective: { title: 'Workout', description: 'Complete your scheduled session.' },
    });
    todaySessionTitle = 'Push A (Chest Focus)';
    created++;
    console.log('✅ Today had no DailyProgram — created with Push A');
  }

  console.log('✅ DailyPrograms: created', created, 'updated', updated);
  console.log('📅 Plan start:', dateKey(planStartDate), '| end:', dateKey(planEndDate), '| today:', todayDateKey, '| today session:', todaySessionTitle ?? '—');

  return {
    planStartDate,
    planEndDate,
    todayDateKey,
    todaySessionTitle,
    dailyProgramsCreated: created,
    dailyProgramsUpdated: updated,
  };
}

if (require.main === module) {
  runSeed('user1-plan', async () => {
    const result = await seedUser1Plan();
    console.log('\nDone. Plan is ready for user1@diettemple.com.');
    console.log('  GET /api/me/today?date=' + result.todayDateKey + ' → should return session:', result.todaySessionTitle);
    console.log('  GET /api/home/daily-program?date=' + result.todayDateKey + ' → should return dailyProgram with session');
  })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
