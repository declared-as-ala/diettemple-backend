/**
 * Seed exercise history for user1@diettemple.com so SessionReels "Historique" panel shows data.
 * Run: npm run seed:exercise-history
 * Requires: seed:users, seed:exercises (user1 and at least one exercise must exist).
 */
import User from '../models/User.model';
import Exercise from '../models/Exercise.model';
import ExerciseHistory from '../models/ExerciseHistory.model';
import { runSeed } from './runSeed';

const USER_EMAIL = 'user1@diettemple.com';

export async function seedExerciseHistory(): Promise<void> {
  const user = await User.findOne({ email: USER_EMAIL }).select('_id').lean();
  if (!user) {
    throw new Error(`User not found: ${USER_EMAIL}. Run seed:users first.`);
  }
  const userId = (user as any)._id;

  const exercises = await Exercise.find().limit(5).select('_id').lean();
  if (exercises.length === 0) {
    throw new Error('No exercises found. Run seed:exercises first.');
  }

  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);

  let created = 0;
  for (let i = 0; i < Math.min(3, exercises.length); i++) {
    const exerciseId = (exercises[i] as any)._id;
    const existing = await ExerciseHistory.findOne({ userId, exerciseId }).lean();
    if (existing) continue;
    await ExerciseHistory.create({
      userId,
      exerciseId,
      lastWeight: 60 + i * 5,
      lastReps: [12, 10, 10, 8],
      lastSets: [
        { setNumber: 1, weight: 60 + i * 5, reps: 12, completed: true, completedAt: weekAgo },
        { setNumber: 2, weight: 60 + i * 5, reps: 10, completed: true, completedAt: weekAgo },
        { setNumber: 3, weight: 60 + i * 5, reps: 10, completed: true, completedAt: weekAgo },
        { setNumber: 4, weight: 60 + i * 5, reps: 8, completed: true, completedAt: weekAgo },
      ],
      lastCompletedAt: weekAgo,
      progressionStatus: 'stable',
    });
    created++;
  }
  console.log(`✅ Created ${created} exercise history record(s) for ${USER_EMAIL}`);
}

if (require.main === module) {
  runSeed('exercise-history', seedExerciseHistory)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
