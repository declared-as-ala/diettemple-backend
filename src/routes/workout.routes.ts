import express, { Request, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import WorkoutSession from '../models/WorkoutSession.model';
import ExerciseProgression from '../models/ExerciseProgression.model';
import ExerciseHistory from '../models/ExerciseHistory.model';
import ExerciseProgram from '../models/ExerciseProgram.model';
import Session from '../models/Session.model';
import SessionTemplate from '../models/SessionTemplate.model';
import Exercise from '../models/Exercise.model';
import User from '../models/User.model';
import GymCheckin from '../models/GymCheckin.model';
import { AuthRequest } from '../middleware/auth.middleware';

const router = express.Router();

function getDateKeyLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Start a new workout session (accepts Session id or SessionTemplate id from /me/today)
// Requires a valid gym check-in for today (userId, sessionId, dateKey).
router.post(
  '/start',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const { sessionId, gymPhotoUrl, dateKey: clientDateKey } = req.body;

      if (!sessionId) {
        return res.status(400).json({ message: 'Session ID is required' });
      }

      const dateKey = clientDateKey || getDateKeyLocal();
      const checkin = await GymCheckin.findOne({
        userId: req.user._id,
        dateKey,
      }).lean();
      if (!checkin) {
        return res.status(403).json({
          message: 'Vérification salle requise',
          code: 'GYM_CHECKIN_REQUIRED',
        });
      }

      let title: string;
      let exerciseSessions: { exerciseId: any; status: string; sets: { setNumber: number }[] }[];

      // 1) Try legacy Session
      const session = await Session.findById(sessionId).populate('exercises');
      if (session) {
        title = session.title;
        const exercises = (session.exercises as any[]) || [];
        exerciseSessions = exercises.map((exercise) => ({
          exerciseId: exercise._id || exercise,
          status: 'pending',
          sets: Array.from({ length: exercise.sets || 3 }, (_, i) => ({
            setNumber: i + 1,
          })),
        }));
      } else {
        // 2) Try SessionTemplate (what /me/today returns)
        const template = await SessionTemplate.findById(sessionId).lean();
        if (!template) {
          return res.status(404).json({ message: 'Session not found' });
        }
        const templateObj = template as any;
        title = templateObj.title;
        const items = templateObj.items || [];
        exerciseSessions = items.map((item: any) => ({
          exerciseId: item.exerciseId,
          status: 'pending',
          sets: Array.from({ length: item.sets || 3 }, (_, i) => ({
            setNumber: i + 1,
          })),
        }));
      }

      const workoutSession = await WorkoutSession.create({
        userId: req.user._id,
        sessionId,
        date: new Date(),
        workoutType: title,
        exercises: exerciseSessions,
        gymPhotoUrl: null,
        startedAt: new Date(),
        status: 'active',
        xpGained: 0,
      });

      res.status(201).json({ workoutSession });
    } catch (error: any) {
      console.error('Error starting workout session:', error);
      res.status(500).json({ message: error.message });
    }
  }
);

// Normalize id from string or { _id: string }
const toIdString = (id: any): string | null => {
  if (id == null) return null;
  if (typeof id === 'string') return id;
  if (typeof id === 'object' && id._id != null) return String(id._id);
  return String(id);
};

// Update exercise set completion
router.post(
  '/exercise/set',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const { workoutSessionId: rawWorkoutSessionId, exerciseId: rawExerciseId, setNumber, weight, repsCompleted, notes } = req.body;

      const workoutSessionId = toIdString(rawWorkoutSessionId);
      const exerciseIdStr = toIdString(rawExerciseId);

      if (!workoutSessionId || !exerciseIdStr || setNumber == null) {
        return res.status(400).json({ message: 'Missing required fields: workoutSessionId, exerciseId, setNumber' });
      }

      const workoutSession = await WorkoutSession.findOne({
        _id: workoutSessionId,
        userId: req.user._id,
      });

      if (!workoutSession) {
        return res.status(404).json({ message: 'Workout session not found' });
      }

      // Find the exercise session (handle both ObjectId and populated exerciseId)
      const exerciseSession = workoutSession.exercises.find((ex: any) => {
        const exId = ex.exerciseId;
        const exIdStr = exId != null ? (exId._id != null ? String(exId._id) : String(exId)) : '';
        return exIdStr === exerciseIdStr;
      });

      if (!exerciseSession) {
        return res.status(404).json({ message: 'Exercise not found in session' });
      }

      // Update the set
      const set = exerciseSession.sets.find((s) => s.setNumber === setNumber);
      if (set) {
        set.weight = weight;
        set.repsCompleted = repsCompleted;
        if (notes !== undefined) {
          set.notes = notes;
        }
        (set as any).completed = true;
        set.completedAt = new Date();
      } else {
        // Create new set if doesn't exist
        exerciseSession.sets.push({
          setNumber: setNumber,
          weight: weight,
          repsCompleted: repsCompleted,
          notes: notes || undefined,
          completed: true,
          completedAt: new Date(),
        } as any);
      }

      // Update exercise status
      if (exerciseSession.status === 'pending') {
        exerciseSession.status = 'in_progress';
        exerciseSession.startedAt = new Date();
      }

      await workoutSession.save();

      res.json({ workoutSession });
    } catch (error: any) {
      console.error('Error updating exercise set:', error);
      res.status(500).json({ message: error.message });
    }
  }
);

// Skip an exercise
router.post(
  '/exercise/skip',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const workoutSessionId = toIdString(req.body.workoutSessionId);
      const exerciseIdStr = toIdString(req.body.exerciseId);

      if (!workoutSessionId || !exerciseIdStr) {
        return res.status(400).json({ message: 'Missing required fields: workoutSessionId, exerciseId' });
      }

      const workoutSession = await WorkoutSession.findOne({
        _id: workoutSessionId,
        userId: req.user._id,
      });

      if (!workoutSession) {
        return res.status(404).json({ message: 'Workout session not found' });
      }

      const exerciseSession = workoutSession.exercises.find((ex: any) => {
        const exId = ex.exerciseId;
        const exIdStr = exId != null ? (exId._id != null ? String(exId._id) : String(exId)) : '';
        return exIdStr === exerciseIdStr;
      });

      if (!exerciseSession) {
        return res.status(404).json({ message: 'Exercise not found in session' });
      }

      exerciseSession.status = 'skipped';
      await workoutSession.save();

      res.json({ workoutSession });
    } catch (error: any) {
      console.error('Error skipping exercise:', error);
      res.status(500).json({ message: error.message });
    }
  }
);

// Complete an exercise (all sets done)
router.post(
  '/exercise/complete',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const workoutSessionId = toIdString(req.body.workoutSessionId);
      const exerciseIdStr = toIdString(req.body.exerciseId);

      if (!workoutSessionId || !exerciseIdStr) {
        return res.status(400).json({ message: 'Missing required fields: workoutSessionId, exerciseId' });
      }

      const workoutSession = await WorkoutSession.findOne({
        _id: workoutSessionId,
        userId: req.user._id,
      }).populate('exercises.exerciseId');

      if (!workoutSession) {
        return res.status(404).json({ message: 'Workout session not found' });
      }

      const exerciseSession = workoutSession.exercises.find((ex: any) => {
        const exId = ex.exerciseId;
        const exIdStr = exId != null ? (exId._id != null ? String(exId._id) : String(exId)) : '';
        return exIdStr === exerciseIdStr;
      });

      if (!exerciseSession) {
        return res.status(404).json({ message: 'Exercise not found in session' });
      }

      // Mark exercise as completed
      exerciseSession.status = 'completed';
      exerciseSession.completedAt = new Date();

      // SMART PROGRESSION LOGIC
      const exercise = exerciseSession.exerciseId as any;
      const completedSets = exerciseSession.sets.filter(s => (s as any).completed && s.weight && s.repsCompleted);
      
      if (completedSets.length > 0) {
        // Get coach program (if exists)
        const program = await ExerciseProgram.findOne({ exerciseId: exerciseIdStr });
        const targetReps = program?.targetReps || exercise.reps || 12;
        const targetRepsMin = typeof targetReps === 'object' ? targetReps.min : targetReps;
        const targetRepsMax = typeof targetReps === 'object' ? targetReps.max : targetReps;

        // Calculate stats
        const weights = completedSets.map(s => s.weight!);
        const reps = completedSets.map(s => s.repsCompleted!);
        const lastWeight = weights[weights.length - 1];
        const totalVolume = completedSets.reduce((sum, s) => sum + (s.weight! * s.repsCompleted!), 0);

        // PROGRESSION RULE 1: All sets must have >= 12 reps (or target max) to be eligible
        const allPassed = completedSets.every(s => s.repsCompleted! >= targetRepsMax);
        
        // Find or create exercise history
        let history = await ExerciseHistory.findOne({
          userId: req.user._id,
          exerciseId: exerciseIdStr,
        });

        if (!history) {
          history = await ExerciseHistory.create({
            userId: req.user._id,
            exerciseId: exerciseIdStr,
            lastWeight: lastWeight,
            lastReps: reps,
            lastSets: completedSets.map((s, idx) => ({
              setNumber: idx + 1,
              weight: s.weight!,
              reps: s.repsCompleted!,
              completed: true,
              completedAt: s.completedAt || new Date(),
            })),
            lastCompletedAt: new Date(),
            totalVolume: totalVolume,
            progressionStatus: allPassed ? 'eligible' : 'failed',
          });
        } else {
          // Update history
          history.lastWeight = lastWeight;
          history.lastReps = reps;
          history.lastSets = completedSets.map((s, idx) => ({
            setNumber: idx + 1,
            weight: s.weight!,
            reps: s.repsCompleted!,
            completed: true,
            completedAt: s.completedAt || new Date(),
          }));
          history.lastCompletedAt = new Date();
          history.totalVolume = totalVolume;
          
          // PROGRESSION RULE 2: Recommend weight increase only if eligible
          if (allPassed) {
            history.progressionStatus = 'eligible';
            history.recommendedNextWeight = lastWeight + 2; // +2kg recommendation
          } else {
            history.progressionStatus = 'failed';
            history.recommendedNextWeight = lastWeight; // Stay same weight
          }
          
          await history.save();
        }

        await workoutSession.save();

        res.json({ 
          workoutSession, 
          history: {
            lastWeight: history.lastWeight,
            lastReps: history.lastReps,
            lastSets: history.lastSets,
            progressionStatus: history.progressionStatus,
            recommendedNextWeight: history.recommendedNextWeight,
            totalVolume: history.totalVolume,
          }
        });
      } else {
        await workoutSession.save();
        res.json({ workoutSession });
      }
    } catch (error: any) {
      console.error('Error completing exercise:', error);
      res.status(500).json({ message: error.message });
    }
  }
);

// Complete workout session
router.post(
  '/complete',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const { workoutSessionId } = req.body;

      if (!workoutSessionId) {
        return res.status(400).json({ message: 'Workout session ID is required' });
      }

      const workoutSession = await WorkoutSession.findOne({
        _id: workoutSessionId,
        userId: req.user._id,
      }).populate('exercises.exerciseId');

      if (!workoutSession) {
        return res.status(404).json({ message: 'Workout session not found' });
      }

      // Calculate XP
      const completedExercises = workoutSession.exercises.filter(
        (ex) => ex.status === 'completed'
      );
      
      // Base XP: 10 per completed exercise
      let xpGained = completedExercises.length * 10;
      
      // Bonus: 20 XP if all exercises completed
      const allCompleted = workoutSession.exercises.every(
        (ex) => ex.status === 'completed' || ex.status === 'skipped'
      );
      if (allCompleted && completedExercises.length > 0) {
        xpGained += 20;
      }

      // Update workout session
      workoutSession.status = 'completed';
      workoutSession.completedAt = new Date();
      workoutSession.xpGained = xpGained;

      await workoutSession.save();

      // Update user XP (level is managed by admin only, not automatically)
      const user = await User.findById(req.user._id);
      if (user) {
        const currentXp = user.xp || 0;
        user.xp = currentXp + xpGained;
        // Note: Level progression is managed by admin only
        // XP is tracked for future use (offers, promo codes, etc.)
        await user.save();
      }

      res.json({
        workoutSession,
        xpGained,
        totalXp: user?.xp || 0,
        level: user?.level || 'Intiate',
      });
    } catch (error: any) {
      console.error('Error completing workout session:', error);
      res.status(500).json({ message: error.message });
    }
  }
);

// Get active workout session
router.get(
  '/active',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const workoutSession = await WorkoutSession.findOne({
        userId: req.user._id,
        status: 'active',
      })
        .populate('sessionId')
        .populate('exercises.exerciseId')
        .sort({ startedAt: -1 });

      if (!workoutSession) {
        return res.status(404).json({ message: 'No active workout session' });
      }

      res.json({ workoutSession });
    } catch (error: any) {
      console.error('Error fetching active workout session:', error);
      res.status(500).json({ message: error.message });
    }
  }
);

// Get exercise history and coach recommendations
router.get(
  '/exercise/history/:exerciseId',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const { exerciseId } = req.params;
      
      // Get coach program
      const program = await ExerciseProgram.findOne({ exerciseId }).populate('exerciseId');
      
      // Get user history
      const history = await ExerciseHistory.findOne({
        userId: req.user._id,
        exerciseId: exerciseId,
      }).populate('exerciseId');

      // Get exercise details
      const exercise = await Exercise.findById(exerciseId);

      res.json({
        program: program ? {
          targetSets: program.targetSets,
          targetReps: program.targetReps,
          baseWeight: program.baseWeight,
          restSeconds: program.restSeconds,
        } : null,
        history: history ? {
          lastWeight: history.lastWeight,
          lastReps: history.lastReps,
          lastSets: history.lastSets,
          lastCompletedAt: history.lastCompletedAt,
          recommendedNextWeight: history.recommendedNextWeight,
          progressionStatus: history.progressionStatus,
          totalVolume: history.totalVolume,
        } : null,
        exercise: exercise ? {
          name: exercise.name,
          muscleGroup: exercise.muscleGroup,
          defaultWeight: exercise.defaultWeight,
        } : null,
      });
    } catch (error: any) {
      console.error('Error fetching exercise history:', error);
      res.status(500).json({ message: error.message });
    }
  }
);

// Get exercise progression for user (legacy - keep for compatibility)
router.get(
  '/progression/:exerciseId',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const { exerciseId } = req.params;

      const progression = await ExerciseProgression.findOne({
        userId: req.user._id,
        exerciseId,
      }).populate('exerciseId');

      if (!progression) {
        // Return default progression
        const exercise = await Exercise.findById(exerciseId);
        return res.json({
          progression: {
            currentWeight: exercise?.defaultWeight || 0,
            targetReps: exercise?.reps || 12,
          },
        });
      }

      res.json({ progression });
    } catch (error: any) {
      console.error('Error fetching progression:', error);
      res.status(500).json({ message: error.message });
    }
  }
);

export default router;

