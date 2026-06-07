import assert from 'node:assert/strict';
import { calculateExerciseRecommendation } from './exerciseRecommendation.service';

function run() {
  // no history
  const noHistory = calculateExerciseRecommendation(null, { targetReps: { min: 8, max: 12 } });
  assert.equal(noHistory.decision, 'NO_HISTORY');
  assert.equal(noHistory.hasHistory, false);

  // keep same charge
  const keep = calculateExerciseRecommendation(
    {
      exerciseId: 'ex1',
      exerciseName: 'Developpe couche',
      sessionDate: '2026-05-05',
      sets: [
        { setNumber: 1, weight: 10, reps: 12 },
        { setNumber: 2, weight: 12, reps: 12 },
        { setNumber: 3, weight: 15, reps: 10 },
      ],
    },
    { targetReps: { min: 8, max: 12 }, muscleGroup: 'chest' }
  );
  assert.equal(keep.decision, 'KEEP');
  assert.equal(keep.recommendedWeight, 15);

  // increase charge
  const advance = calculateExerciseRecommendation(
    {
      exerciseId: 'ex2',
      exerciseName: 'Squat',
      sets: [
        { setNumber: 1, weight: 40, reps: 10 },
        { setNumber: 2, weight: 60, reps: 12 },
        { setNumber: 3, weight: 80, reps: 12 },
        { setNumber: 4, weight: 80, reps: 12 },
      ],
    },
    { targetReps: { min: 8, max: 12 }, muscleGroup: 'legs' }
  );
  assert.equal(advance.decision, 'ADVANCE');
  assert.equal(advance.recommendedWeight, 85);

  // reduce charge
  const down = calculateExerciseRecommendation(
    {
      exerciseId: 'ex3',
      exerciseName: 'Row',
      sets: [
        { setNumber: 1, weight: 20, reps: 12 },
        { setNumber: 2, weight: 30, reps: 10 },
        { setNumber: 3, weight: 35, reps: 6 },
      ],
    },
    { targetReps: { min: 8, max: 12 }, muscleGroup: 'back' }
  );
  assert.equal(down.decision, 'DOWN');

  // 4 sets history preference
  const fourSets = calculateExerciseRecommendation(
    {
      exerciseId: 'ex4',
      exerciseName: 'Press',
      sets: [
        { setNumber: 1, weight: 20, reps: 12 },
        { setNumber: 2, weight: 30, reps: 10 },
        { setNumber: 3, weight: 35, reps: 9 },
        { setNumber: 4, weight: 35, reps: 8 },
      ],
    },
    { targetReps: { min: 8, max: 12 } }
  );
  assert.equal(fourSets.suggestedSets.length, 4);

  // bad/incomplete set data
  const incomplete = calculateExerciseRecommendation(
    {
      exerciseId: 'ex5',
      exerciseName: 'Curl',
      sets: [
        { setNumber: 1, weight: null, reps: 12 },
        { setNumber: 2, weight: 12, reps: null },
      ],
    },
    { targetReps: { min: 8, max: 12 } }
  );
  assert.equal(incomplete.decision, 'NO_HISTORY');

  console.log('exerciseRecommendation.service tests passed');
}

run();

