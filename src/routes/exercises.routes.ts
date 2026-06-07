import express, { Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import Exercise from '../models/Exercise.model';
import ExerciseProgram from '../models/ExerciseProgram.model';
import WorkoutSession from '../models/WorkoutSession.model';
import { calculateExerciseRecommendation, normalizeExerciseName } from '../services/exerciseRecommendation.service';

const router = express.Router();

router.get('/:exerciseId/recommendation', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { exerciseId } = req.params;
    const exerciseNameQuery = typeof req.query.exerciseName === 'string' ? req.query.exerciseName : '';
    const normalizedQueryName = normalizeExerciseName(exerciseNameQuery);

    const exercise = await Exercise.findById(exerciseId).lean();
    const normalizedExerciseName = exercise?.name ? normalizeExerciseName(exercise.name) : '';

    const latestCompletedSessions = await WorkoutSession.find({
      userId: req.user._id,
      status: 'completed',
    })
      .sort({ completedAt: -1, date: -1 })
      .limit(80)
      .lean();

    let matchedExercise: any = null;
    let matchedSession: any = null;
    for (const session of latestCompletedSessions) {
      const sessionExercises = Array.isArray(session.exercises) ? session.exercises : [];
      const byId = sessionExercises.find((ex: any) => String(ex.exerciseId) === String(exerciseId));
      if (byId) {
        matchedExercise = byId;
        matchedSession = session;
        break;
      }
      const byName = sessionExercises.find((ex: any) => {
        const exName = normalizeExerciseName(ex.exerciseName || '');
        return !!exName && (exName === normalizedExerciseName || exName === normalizedQueryName);
      });
      if (byName) {
        matchedExercise = byName;
        matchedSession = session;
        break;
      }
    }

    const program = await ExerciseProgram.findOne({ exerciseId }).lean();
    const recommendation = calculateExerciseRecommendation(
      matchedExercise
        ? {
            exerciseId,
            exerciseName: matchedExercise.exerciseName || exercise?.name || exerciseNameQuery || '',
            sessionDate: matchedSession?.completedAt || matchedSession?.date,
            sets: (matchedExercise.sets || []).map((set: any) => ({
              setNumber: set.setNumber,
              weight: set.weight,
              reps: set.repsCompleted,
            })),
          }
        : null,
      {
        targetReps: (program as any)?.targetReps ?? exercise?.reps ?? null,
        muscleGroup: exercise?.muscleGroup ?? null,
      }
    );

    return res.json(recommendation);
  } catch (error: any) {
    console.error('Error getting exercise recommendation:', error);
    return res.status(500).json({ message: error.message || 'Failed to compute recommendation' });
  }
});

export default router;

