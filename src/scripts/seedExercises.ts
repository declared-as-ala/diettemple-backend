/**
 * Seed exercises for PPL and general use. Upsert by name (deterministic).
 * Run first; session and level seeds depend on exercise names.
 */
import Exercise from '../models/Exercise.model';
import { runSeed } from './runSeed';

/** PPL and mobility exercises by name – used by session templates */
const PPL_EXERCISES = [
  // Push – Chest
  { name: 'Bench Press', muscleGroup: 'chest', equipment: 'barbell' as const, difficulty: 'intermediate' as const, description: 'Flat barbell press. Compound movement for chest, shoulders, triceps.', videoUrl: '/videos/chest/bench-press.mp4' },
  { name: 'Dumbbell Press', muscleGroup: 'chest', equipment: 'dumbbell' as const, difficulty: 'intermediate' as const, description: 'Flat dumbbell press. Greater range of motion than barbell.', videoUrl: '/videos/chest/dumbbell-press.mp4' },
  { name: 'Incline Dumbbell Press', muscleGroup: 'chest', equipment: 'dumbbell' as const, difficulty: 'intermediate' as const, description: 'Incline press for upper chest.', videoUrl: '/videos/chest/incline-press.mp4' },
  { name: 'Incline Barbell Press', muscleGroup: 'chest', equipment: 'barbell' as const, difficulty: 'intermediate' as const, description: 'Incline barbell press for upper chest.', videoUrl: '/videos/chest/incline-barbell.mp4' },
  { name: 'Cable Fly', muscleGroup: 'chest', equipment: 'cable' as const, difficulty: 'beginner' as const, description: 'Cable fly for chest isolation.', videoUrl: '/videos/chest/cable-fly.mp4' },
  { name: 'Push-Ups', muscleGroup: 'chest', equipment: 'bodyweight' as const, difficulty: 'beginner' as const, description: 'Bodyweight chest and triceps.', videoUrl: '/videos/chest/pushups.mp4' },
  // Push – Shoulders
  { name: 'Overhead Press', muscleGroup: 'shoulders', equipment: 'barbell' as const, difficulty: 'intermediate' as const, description: 'Standing or seated barbell overhead press.', videoUrl: '/videos/shoulders/ohp.mp4' },
  { name: 'Dumbbell Shoulder Press', muscleGroup: 'shoulders', equipment: 'dumbbell' as const, difficulty: 'intermediate' as const, description: 'Seated dumbbell overhead press.', videoUrl: '/videos/shoulders/dumbbell-ohp.mp4' },
  { name: 'Lateral Raise', muscleGroup: 'shoulders', equipment: 'dumbbell' as const, difficulty: 'beginner' as const, description: 'Isolation for lateral deltoids.', videoUrl: '/videos/shoulders/lateral-raise.mp4' },
  { name: 'Face Pull', muscleGroup: 'shoulders', equipment: 'cable' as const, difficulty: 'beginner' as const, description: 'Rear delts and upper back. Use rope attachment.', videoUrl: '/videos/shoulders/face-pull.mp4' },
  { name: 'Rear Delt Fly', muscleGroup: 'shoulders', equipment: 'dumbbell' as const, difficulty: 'beginner' as const, description: 'Isolation for rear deltoids.', videoUrl: '/videos/shoulders/rear-delt-fly.mp4' },
  // Push – Triceps
  { name: 'Triceps Pushdown', muscleGroup: 'triceps', equipment: 'cable' as const, difficulty: 'beginner' as const, description: 'Cable pushdown for triceps.', videoUrl: '/videos/triceps/tricep-pushdown.mp4' },
  { name: 'Skull Crusher', muscleGroup: 'triceps', equipment: 'barbell' as const, difficulty: 'intermediate' as const, description: 'Lying triceps extension (EZ bar).', videoUrl: '/videos/triceps/skull-crusher.mp4' },
  { name: 'Dips', muscleGroup: 'triceps', equipment: 'bodyweight' as const, difficulty: 'intermediate' as const, description: 'Chest/triceps dips. Use assist if needed.', videoUrl: '/videos/triceps/dips.mp4' },
  { name: 'Triceps Kickback', muscleGroup: 'triceps', equipment: 'dumbbell' as const, difficulty: 'beginner' as const, description: 'Single-arm triceps kickback.', videoUrl: '/videos/triceps/kickback.mp4' },
  // Pull – Back
  { name: 'Pull-Up', muscleGroup: 'back', equipment: 'bodyweight' as const, difficulty: 'intermediate' as const, description: 'Pronation or neutral grip pull-ups.', videoUrl: '/videos/back/pullups.mp4' },
  { name: 'Lat Pulldown', muscleGroup: 'back', equipment: 'cable' as const, difficulty: 'beginner' as const, description: 'Vertical pull for lat width.', videoUrl: '/videos/back/lat-pulldown.mp4' },
  { name: 'Barbell Row', muscleGroup: 'back', equipment: 'barbell' as const, difficulty: 'intermediate' as const, description: 'Bent-over barbell row for back thickness.', videoUrl: '/videos/back/barbell-row.mp4' },
  { name: 'Dumbbell Row', muscleGroup: 'back', equipment: 'dumbbell' as const, difficulty: 'intermediate' as const, description: 'Single-arm supported row.', videoUrl: '/videos/back/dumbbell-row.mp4' },
  { name: 'Seated Cable Row', muscleGroup: 'back', equipment: 'cable' as const, difficulty: 'beginner' as const, description: 'Horizontal cable row.', videoUrl: '/videos/back/cable-row.mp4' },
  { name: 'Chin-Up', muscleGroup: 'back', equipment: 'bodyweight' as const, difficulty: 'intermediate' as const, description: 'Supination grip for biceps and lats.', videoUrl: '/videos/back/chinups.mp4' },
  // Pull – Biceps
  { name: 'Barbell Curl', muscleGroup: 'biceps', equipment: 'barbell' as const, difficulty: 'beginner' as const, description: 'Standing barbell curl.', videoUrl: '/videos/biceps/barbell-curl.mp4' },
  { name: 'Dumbbell Curl', muscleGroup: 'biceps', equipment: 'dumbbell' as const, difficulty: 'beginner' as const, description: 'Alternating or simultaneous dumbbell curl.', videoUrl: '/videos/biceps/dumbbell-curl.mp4' },
  { name: 'Hammer Curl', muscleGroup: 'biceps', equipment: 'dumbbell' as const, difficulty: 'beginner' as const, description: 'Neutral grip curl for brachialis.', videoUrl: '/videos/biceps/hammer-curl.mp4' },
  { name: 'Cable Curl', muscleGroup: 'biceps', equipment: 'cable' as const, difficulty: 'beginner' as const, description: 'Cable biceps curl.', videoUrl: '/videos/biceps/cable-curl.mp4' },
  { name: 'Preacher Curl', muscleGroup: 'biceps', equipment: 'barbell' as const, difficulty: 'intermediate' as const, description: 'Preacher bench curl for isolation.', videoUrl: '/videos/biceps/preacher-curl.mp4' },
  // Legs – Quads / general
  { name: 'Barbell Squat', muscleGroup: 'legs', equipment: 'barbell' as const, difficulty: 'intermediate' as const, description: 'Back squat. King of leg exercises.', videoUrl: '/videos/legs/squat.mp4' },
  { name: 'Leg Press', muscleGroup: 'legs', equipment: 'machine' as const, difficulty: 'beginner' as const, description: 'Machine leg press.', videoUrl: '/videos/legs/leg-press.mp4' },
  { name: 'Leg Extension', muscleGroup: 'legs', equipment: 'machine' as const, difficulty: 'beginner' as const, description: 'Quad isolation.', videoUrl: '/videos/legs/leg-extension.mp4' },
  { name: 'Walking Lunge', muscleGroup: 'legs', equipment: 'dumbbell' as const, difficulty: 'intermediate' as const, description: 'Walking lunges with dumbbells.', videoUrl: '/videos/legs/lunges.mp4' },
  { name: 'Goblet Squat', muscleGroup: 'legs', equipment: 'dumbbell' as const, difficulty: 'beginner' as const, description: 'Goblet squat for quads and core.', videoUrl: '/videos/legs/goblet-squat.mp4' },
  // Legs – Posterior
  { name: 'Romanian Deadlift', muscleGroup: 'legs', equipment: 'barbell' as const, difficulty: 'intermediate' as const, description: 'RDL for hamstrings and glutes.', videoUrl: '/videos/legs/romanian-deadlift.mp4' },
  { name: 'Leg Curl', muscleGroup: 'legs', equipment: 'machine' as const, difficulty: 'beginner' as const, description: 'Lying or seated leg curl.', videoUrl: '/videos/legs/leg-curl.mp4' },
  { name: 'Hip Thrust', muscleGroup: 'legs', equipment: 'barbell' as const, difficulty: 'intermediate' as const, description: 'Hip thrust for glutes.', videoUrl: '/videos/legs/hip-thrust.mp4' },
  { name: 'Bulgarian Split Squat', muscleGroup: 'legs', equipment: 'dumbbell' as const, difficulty: 'intermediate' as const, description: 'Rear-foot elevated split squat.', videoUrl: '/videos/legs/bulgarian-split.mp4' },
  // Legs – Calves
  { name: 'Calf Raise', muscleGroup: 'legs', equipment: 'machine' as const, difficulty: 'beginner' as const, description: 'Standing or seated calf raise.', videoUrl: '/videos/legs/calf-raise.mp4' },
  { name: 'Seated Calf Raise', muscleGroup: 'legs', equipment: 'machine' as const, difficulty: 'beginner' as const, description: 'Seated calf raise.', videoUrl: '/videos/legs/seated-calf.mp4' },
  // Core / mobility
  { name: 'Plank', muscleGroup: 'core', equipment: 'bodyweight' as const, difficulty: 'beginner' as const, description: 'Hold plank position for time.', videoUrl: '/videos/core/plank.mp4' },
  { name: 'Dead Bug', muscleGroup: 'core', equipment: 'bodyweight' as const, difficulty: 'beginner' as const, description: 'Core stability exercise.', videoUrl: '/videos/core/dead-bug.mp4' },
  { name: 'Bird Dog', muscleGroup: 'core', equipment: 'bodyweight' as const, difficulty: 'beginner' as const, description: 'Alternating arm and leg extension.', videoUrl: '/videos/core/bird-dog.mp4' },
  { name: 'Cat Cow Stretch', muscleGroup: 'core', equipment: 'bodyweight' as const, difficulty: 'beginner' as const, description: 'Spine mobility stretch.', videoUrl: '/videos/core/cat-cow.mp4' },
  { name: 'Hip Flexor Stretch', muscleGroup: 'core', equipment: 'bodyweight' as const, difficulty: 'beginner' as const, description: 'Kneeling hip flexor stretch.', videoUrl: '/videos/core/hip-flexor.mp4' },
];

export async function seedExercises(): Promise<number> {
  const ops = PPL_EXERCISES.map((ex) => ({
    updateOne: {
      filter: { name: ex.name },
      update: {
        $set: {
          muscleGroup: ex.muscleGroup,
          equipment: ex.equipment,
          difficulty: ex.difficulty,
          description: ex.description,
          videoUrl: ex.videoUrl,
        },
      },
      upsert: true,
    },
  }));
  const result = await Exercise.bulkWrite(ops);
  const created = result.upsertedCount ?? 0;
  const updated = result.modifiedCount ?? 0;
  console.log(`✅ Exercises: ${created} created, ${updated} updated (${PPL_EXERCISES.length} by name)`);
  return PPL_EXERCISES.length;
}

if (require.main === module) {
  runSeed('exercises', seedExercises)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
