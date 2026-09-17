import { calculateExerciseRecommendation } from './exerciseRecommendation.service';

describe('exerciseRecommendation.service', () => {
  it('should handle no history', () => {
    const noHistory = calculateExerciseRecommendation(null, { targetReps: { min: 8, max: 12 } });
    expect(noHistory.decision).toBe('NO_HISTORY');
    expect(noHistory.hasHistory).toBe(false);
  });

  it('should keep same charge', () => {
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
    expect(keep.decision).toBe('KEEP');
    expect(keep.recommendedWeight).toBe(15);
  });

  it('should increase charge (advance)', () => {
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
    expect(advance.decision).toBe('ADVANCE');
    expect(advance.recommendedWeight).toBe(85);
  });

  it('should reduce charge (down)', () => {
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
    expect(down.decision).toBe('DOWN');
  });

  it('should handle 4 sets history preference', () => {
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
    expect(fourSets.suggestedSets.length).toBe(4);
  });

  it('should handle bad/incomplete set data', () => {
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
    expect(incomplete.decision).toBe('NO_HISTORY');
  });
});
