/**
 * Seed PPL session templates. Upsert by title. Requires exercises seeded first.
 */
import Exercise from '../models/Exercise.model';
import SessionTemplate from '../models/SessionTemplate.model';
import { runSeed } from './runSeed';

const PROGRESSION_RULE = {
  condition: 'reps_above',
  value: 12,
  action: 'increase_weight',
  weightChange: 2.5,
  message: 'Add weight when you hit 12 reps comfortably',
};

function item(
  exerciseId: any,
  opts: { sets?: number; targetReps?: number | { min: number; max: number }; rest?: number; alternatives?: any[]; order?: number }
) {
  return {
    exerciseId,
    alternatives: opts.alternatives ?? [],
    sets: opts.sets ?? 4,
    targetReps: opts.targetReps ?? 10,
    restTimeSeconds: opts.rest ?? 90,
    recommendedStartingWeightKg: undefined,
    progressionRules: [PROGRESSION_RULE],
    order: opts.order ?? 0,
  };
}

export async function seedSessionTemplates(): Promise<number> {
  const exercises = await Exercise.find().lean();
  const byName = new Map<string, any>();
  exercises.forEach((e: any) => byName.set(e.name, e._id));

  const missing = [
    'Bench Press', 'Dumbbell Press', 'Incline Dumbbell Press', 'Overhead Press', 'Lateral Raise', 'Triceps Pushdown', 'Dips',
    'Pull-Up', 'Lat Pulldown', 'Barbell Row', 'Seated Cable Row', 'Face Pull', 'Rear Delt Fly', 'Barbell Curl', 'Dumbbell Curl', 'Hammer Curl',
    'Barbell Squat', 'Leg Press', 'Leg Extension', 'Walking Lunge', 'Romanian Deadlift', 'Leg Curl', 'Calf Raise', 'Plank',
    'Push-Ups', 'Skull Crusher', 'Chin-Up', 'Dumbbell Row', 'Cable Curl', 'Goblet Squat', 'Hip Thrust', 'Bulgarian Split Squat', 'Dead Bug', 'Cat Cow Stretch',
  ].filter((n) => !byName.has(n));
  if (missing.length > 0) {
    throw new Error(`Missing exercises (run seed:exercises first): ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '...' : ''}`);
  }

  const get = (name: string) => byName.get(name)!;
  const alt = (names: string[]) => names.map((n) => byName.get(n)).filter(Boolean);

  const sessionDefs: Array<{ title: string; description: string; difficulty: 'beginner' | 'intermediate' | 'advanced'; durationMinutes: number; tags: string[]; items: any[] }> = [
    // Push A – Chest focus
    {
      title: 'Push A (Chest Focus)',
      description: 'Chest, shoulders, triceps. Start with heavy compounds.',
      difficulty: 'intermediate',
      durationMinutes: 55,
      tags: ['push', 'chest', 'ppl'],
      items: [
        item(get('Bench Press'), { sets: 4, targetReps: { min: 8, max: 10 }, rest: 120, alternatives: alt(['Dumbbell Press']), order: 0 }),
        item(get('Incline Dumbbell Press'), { sets: 3, targetReps: 10, rest: 90, alternatives: alt(['Incline Barbell Press']), order: 1 }),
        item(get('Overhead Press'), { sets: 3, targetReps: 8, rest: 90, alternatives: alt(['Dumbbell Shoulder Press']), order: 2 }),
        item(get('Lateral Raise'), { sets: 3, targetReps: 12, rest: 60, alternatives: [], order: 3 }),
        item(get('Triceps Pushdown'), { sets: 3, targetReps: 12, rest: 60, alternatives: alt(['Skull Crusher']), order: 4 }),
        item(get('Dips'), { sets: 2, targetReps: 10, rest: 90, alternatives: alt(['Push-Ups']), order: 5 }),
        item(get('Plank'), { sets: 2, targetReps: 45, rest: 60, order: 6 }),
      ],
    },
    // Push B – Shoulder focus
    {
      title: 'Push B (Shoulder Focus)',
      description: 'Shoulders, chest, triceps. More shoulder volume.',
      difficulty: 'intermediate',
      durationMinutes: 50,
      tags: ['push', 'shoulders', 'ppl'],
      items: [
        item(get('Overhead Press'), { sets: 4, targetReps: { min: 6, max: 8 }, rest: 120, alternatives: alt(['Dumbbell Shoulder Press']), order: 0 }),
        item(get('Incline Dumbbell Press'), { sets: 3, targetReps: 10, rest: 90, order: 1 }),
        item(get('Lateral Raise'), { sets: 4, targetReps: 12, rest: 60, order: 2 }),
        item(get('Face Pull'), { sets: 3, targetReps: 15, rest: 60, order: 3 }),
        item(get('Triceps Pushdown'), { sets: 3, targetReps: 12, rest: 60, alternatives: alt(['Skull Crusher', 'Triceps Kickback']), order: 4 }),
        item(get('Plank'), { sets: 2, targetReps: 45, rest: 60, order: 5 }),
      ],
    },
    // Pull A – Back width
    {
      title: 'Pull A (Back Width)',
      description: 'Lats, upper back, biceps.',
      difficulty: 'intermediate',
      durationMinutes: 55,
      tags: ['pull', 'back', 'ppl'],
      items: [
        item(get('Pull-Up'), { sets: 3, targetReps: 8, rest: 90, alternatives: alt(['Lat Pulldown', 'Chin-Up']), order: 0 }),
        item(get('Barbell Row'), { sets: 4, targetReps: 8, rest: 90, alternatives: alt(['Dumbbell Row']), order: 1 }),
        item(get('Seated Cable Row'), { sets: 3, targetReps: 10, rest: 90, order: 2 }),
        item(get('Face Pull'), { sets: 3, targetReps: 15, rest: 60, order: 3 }),
        item(get('Rear Delt Fly'), { sets: 3, targetReps: 12, rest: 60, order: 4 }),
        item(get('Barbell Curl'), { sets: 3, targetReps: 10, rest: 60, alternatives: alt(['Dumbbell Curl', 'Hammer Curl']), order: 5 }),
      ],
    },
    // Pull B – Back thickness
    {
      title: 'Pull B (Back Thickness)',
      description: 'Back thickness, rear delts, biceps.',
      difficulty: 'intermediate',
      durationMinutes: 50,
      tags: ['pull', 'back', 'ppl'],
      items: [
        item(get('Lat Pulldown'), { sets: 4, targetReps: 10, rest: 90, alternatives: alt(['Pull-Up', 'Chin-Up']), order: 0 }),
        item(get('Dumbbell Row'), { sets: 4, targetReps: 10, rest: 90, alternatives: alt(['Barbell Row']), order: 1 }),
        item(get('Seated Cable Row'), { sets: 3, targetReps: 12, rest: 75, order: 2 }),
        item(get('Face Pull'), { sets: 3, targetReps: 15, rest: 60, order: 3 }),
        item(get('Dumbbell Curl'), { sets: 3, targetReps: 12, rest: 60, alternatives: alt(['Cable Curl', 'Preacher Curl']), order: 4 }),
      ],
    },
    // Legs A – Quads focus
    {
      title: 'Legs A (Quads Focus)',
      description: 'Quads, some hamstrings, calves.',
      difficulty: 'intermediate',
      durationMinutes: 60,
      tags: ['legs', 'quads', 'ppl'],
      items: [
        item(get('Barbell Squat'), { sets: 4, targetReps: { min: 6, max: 8 }, rest: 120, alternatives: alt(['Leg Press', 'Goblet Squat']), order: 0 }),
        item(get('Leg Press'), { sets: 3, targetReps: 10, rest: 90, order: 1 }),
        item(get('Leg Extension'), { sets: 3, targetReps: 12, rest: 75, order: 2 }),
        item(get('Walking Lunge'), { sets: 3, targetReps: 10, rest: 90, alternatives: alt(['Bulgarian Split Squat']), order: 3 }),
        item(get('Romanian Deadlift'), { sets: 3, targetReps: 10, rest: 90, order: 4 }),
        item(get('Calf Raise'), { sets: 4, targetReps: 15, rest: 60, order: 5 }),
      ],
    },
    // Legs B – Posterior chain
    {
      title: 'Legs B (Posterior Chain Focus)',
      description: 'Hamstrings, glutes, calves.',
      difficulty: 'intermediate',
      durationMinutes: 55,
      tags: ['legs', 'posterior', 'ppl'],
      items: [
        item(get('Romanian Deadlift'), { sets: 4, targetReps: 8, rest: 120, order: 0 }),
        item(get('Leg Curl'), { sets: 4, targetReps: 10, rest: 75, order: 1 }),
        item(get('Hip Thrust'), { sets: 3, targetReps: 12, rest: 90, order: 2 }),
        item(get('Bulgarian Split Squat'), { sets: 3, targetReps: 10, rest: 90, alternatives: alt(['Walking Lunge']), order: 3 }),
        item(get('Leg Extension'), { sets: 2, targetReps: 12, rest: 60, order: 4 }),
        item(get('Calf Raise'), { sets: 4, targetReps: 15, rest: 60, order: 5 }),
      ],
    },
    // Rest / Mobility
    {
      title: 'Rest / Mobility (Optional)',
      description: 'Light stretching and core. Use on rest days or to fill the week.',
      difficulty: 'beginner',
      durationMinutes: 25,
      tags: ['mobility', 'rest', 'core'],
      items: [
        item(get('Cat Cow Stretch'), { sets: 2, targetReps: 10, rest: 30, order: 0 }),
        item(get('Dead Bug'), { sets: 2, targetReps: 10, rest: 45, order: 1 }),
        item(get('Plank'), { sets: 2, targetReps: 30, rest: 45, order: 2 }),
      ],
    },
  ];

  let created = 0;
  let updated = 0;
  for (const def of sessionDefs) {
    const existing = await SessionTemplate.findOne({ title: def.title });
    if (existing) {
      existing.description = def.description;
      existing.difficulty = def.difficulty;
      existing.durationMinutes = def.durationMinutes;
      existing.tags = def.tags;
      existing.items = def.items as any;
      await existing.save();
      updated++;
    } else {
      await SessionTemplate.create(def);
      created++;
    }
  }
  console.log(`✅ Session templates: ${created} created, ${updated} updated (${sessionDefs.length} PPL)`);
  return sessionDefs.length;
}

if (require.main === module) {
  runSeed('session-templates', seedSessionTemplates)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
