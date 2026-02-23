import express, { Request, Response } from 'express';
import mongoose from 'mongoose';
import { authenticate } from '../middleware/auth.middleware';
import DailyProgram from '../models/DailyProgram.model';
import Session from '../models/Session.model';
import SessionTemplate from '../models/SessionTemplate.model';
import Exercise from '../models/Exercise.model';
import Program from '../models/Program.model';
import BodyProgressPhoto from '../models/BodyProgressPhoto.model';
import CoachEvent from '../models/CoachEvent.model';
import { AuthRequest } from '../middleware/auth.middleware';

const router = express.Router();

// Get daily program for a specific date (date optional, default today)
router.get(
  '/daily-program',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const dateStr = (req.query.date as string) || new Date().toISOString().split('T')[0];
      const targetDate = new Date(dateStr);
      // Set to start of day for accurate comparison
      targetDate.setHours(0, 0, 0, 0);
      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);

      const dailyProgram = await DailyProgram.findOne({
        userId: req.user._id,
        date: {
          $gte: targetDate,
          $lte: endOfDay,
        },
      }).populate({
        path: 'sessionId',
        populate: {
          path: 'exercises',
          model: 'Exercise',
        },
      });

      if (!dailyProgram) {
        return res.status(200).json({ dailyProgram: null });
      }

      // Get user's program status
      const program = await Program.findOne({ userId: req.user._id });

      // Calculate next nutritionist visit (every 4-5 weeks after program start)
      let nextNutritionistVisit: Date | null = null;
      if (program) {
        const programStartDate = new Date(program.startDate);
        const now = new Date();
        const weeksSinceStart = Math.floor((now.getTime() - programStartDate.getTime()) / (7 * 24 * 60 * 60 * 1000));
        
        // Nutritionist visits every 4 weeks
        const visitInterval = 4; // weeks
        const nextVisitWeek = Math.ceil((weeksSinceStart + 1) / visitInterval) * visitInterval;
        const nextVisit = new Date(programStartDate);
        nextVisit.setDate(programStartDate.getDate() + (nextVisitWeek * 7));
        
        if (nextVisit > now) {
          nextNutritionistVisit = nextVisit;
        }
      }

      // Transform to include session as separate field
      const dailyProgramObj = dailyProgram.toObject() as any;
      let populatedSession = dailyProgramObj.sessionId;
      let sessionIdString = populatedSession?._id?.toString() || populatedSession?.toString() || dailyProgramObj.sessionId?.toString() || null;

      // When daily program uses sessionTemplateId (no legacy sessionId), fetch template as session
      if (!populatedSession && dailyProgramObj.sessionTemplateId) {
        sessionIdString = dailyProgramObj.sessionTemplateId.toString();
        const template = await SessionTemplate.findById(dailyProgramObj.sessionTemplateId)
          .populate('items.exerciseId', 'name muscleGroup equipment difficulty description videoUrl videoSource videoFilePath imageUrl')
          .populate('items.alternatives', 'name muscleGroup equipment videoUrl imageUrl')
          .lean();
        if (template) {
          const t = template as any;
          const items = t.items || [];
          populatedSession = {
            _id: t._id,
            title: t.title,
            description: t.description,
            difficulty: t.difficulty,
            durationMinutes: t.durationMinutes,
            exercises: items.map((item: any) => {
              const ex = item.exerciseId?.toObject ? item.exerciseId.toObject() : item.exerciseId || {};
              return { _id: ex._id, name: ex.name, muscleGroup: ex.muscleGroup, equipment: ex.equipment, difficulty: ex.difficulty, description: ex.description, videoUrl: ex.videoUrl, imageUrl: ex.imageUrl, sets: item.sets, targetReps: item.targetReps, restTimeSeconds: item.restTimeSeconds, alternatives: item.alternatives || [] };
            }),
            exerciseConfigs: items.map((item: any) => ({ sets: item.sets, targetReps: item.targetReps, restTimeSeconds: item.restTimeSeconds, order: item.order, exerciseId: item.exerciseId, alternatives: item.alternatives || [] })),
          };
        }
      }

      const response = {
        ...dailyProgramObj,
        session: populatedSession && typeof populatedSession === 'object' ? populatedSession : null,
        sessionId: sessionIdString,
        programStatus: program?.status || 'ACTIVE',
        isProgramCompleted: program?.status === 'COMPLETED',
        programStartDate: program?.startDate || null,
        programEndDate: program ? (() => {
          const endDate = new Date(program.startDate);
          endDate.setDate(program.startDate.getDate() + (program.durationWeeks * 7));
          return endDate;
        })() : null,
        nextNutritionistVisit,
      };

      res.json({ dailyProgram: response });
    } catch (error: any) {
      console.error('Error fetching daily program:', error);
      res.status(500).json({ message: error.message });
    }
  }
);

// Get session details (supports both Session and SessionTemplate ids; /me/today returns sessionTemplateId)
router.get(
  '/session/:sessionId',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const { sessionId } = req.params;

      if (!mongoose.Types.ObjectId.isValid(sessionId)) {
        return res.status(400).json({ message: 'Invalid session ID' });
      }

      // 1) Try legacy Session (exercises array)
      let session = await Session.findById(sessionId)
        .populate('exercises')
        .populate({
          path: 'exerciseConfigs',
          populate: [
            { path: 'exerciseId' },
            { path: 'alternatives' },
          ],
        })
        .lean();

      if (session) {
        const sessionObj = session as any;
        const exercises = sessionObj.exerciseConfigs?.length
          ? sessionObj.exerciseConfigs.map((c: any) => ({ ...c.exerciseId?.toObject?.() || c.exerciseId, sets: c.sets, targetReps: c.targetReps, restTime: c.restTime, order: c.order }))
          : sessionObj.exercises || [];
        return res.json({
          session: {
            _id: sessionObj._id,
            title: sessionObj.title,
            description: sessionObj.description,
            duration: sessionObj.duration,
            difficulty: sessionObj.difficulty,
            exercises: Array.isArray(exercises) ? exercises : [],
            exerciseConfigs: sessionObj.exerciseConfigs || undefined,
          },
        });
      }

      // 2) Try SessionTemplate (what /me/today returns as sessionTemplateId)
      const template = await SessionTemplate.findById(sessionId)
        .populate('items.exerciseId', 'name muscleGroup equipment difficulty description videoUrl videoSource videoFilePath imageUrl')
        .populate('items.alternatives', 'name muscleGroup equipment videoUrl imageUrl')
        .lean();

      if (!template) {
        return res.status(404).json({ message: 'Session not found' });
      }

      const templateObj = template as any;
      const items = templateObj.items || [];
      const exercises = items.map((item: any) => {
        const ex = item.exerciseId?.toObject ? item.exerciseId.toObject() : item.exerciseId || {};
        return {
          _id: ex._id,
          name: ex.name,
          muscleGroup: ex.muscleGroup,
          equipment: ex.equipment,
          difficulty: ex.difficulty,
          description: ex.description,
          videoUrl: ex.videoUrl,
          imageUrl: ex.imageUrl,
          sets: item.sets,
          targetReps: item.targetReps,
          restTimeSeconds: item.restTimeSeconds,
          alternatives: item.alternatives || [],
        };
      });

      const sessionPayload = {
        _id: templateObj._id,
        title: templateObj.title,
        description: templateObj.description,
        difficulty: templateObj.difficulty,
        duration: templateObj.durationMinutes ?? undefined,
        exercises,
        exerciseConfigs: items.map((item: any) => ({
          _id: item._id,
          sets: item.sets,
          targetReps: item.targetReps,
          restTime: item.restTimeSeconds,
          recommendedStartingWeight: item.recommendedStartingWeightKg,
          order: item.order,
          progressionRules: item.progressionRules,
          exerciseId: item.exerciseId?.toObject ? item.exerciseId.toObject() : item.exerciseId,
          alternatives: item.alternatives || [],
        })),
      };

      return res.json({ session: sessionPayload });
    } catch (error: any) {
      console.error('Error fetching session:', error);
      res.status(500).json({ message: error.message });
    }
  }
);

// Get all exercises (for admin/exercise list)
router.get(
  '/exercises',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const exercises = await Exercise.find().sort({ name: 1 });

      res.json({ exercises });
    } catch (error: any) {
      console.error('Error fetching exercises:', error);
      res.status(500).json({ message: error.message });
    }
  }
);

// Get user's program status with detailed information
router.get(
  '/program',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const program = await Program.findOne({ userId: req.user._id })
        .sort({ startDate: -1 }); // Get most recent program

      if (!program) {
        return res.status(200).json({ current_program: null });
      }

      const programStartDate = new Date(program.startDate);
      programStartDate.setHours(0, 0, 0, 0);
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      
      // Calculate program end date (start date + duration weeks - 1 day, since start day is day 1)
      const programEndDate = new Date(programStartDate);
      programEndDate.setDate(programStartDate.getDate() + (program.durationWeeks * 7) - 1);
      programEndDate.setHours(23, 59, 59, 999);
      
      // Calculate next nutritionist visit (end date + 1 day)
      const nextNutritionistVisit = new Date(programEndDate);
      nextNutritionistVisit.setDate(programEndDate.getDate() + 1);
      nextNutritionistVisit.setHours(0, 0, 0, 0);

      // Calculate total days in program
      const totalDays = program.durationWeeks * 7;

      // Calculate completed days (days from start to today, capped at total days)
      const daysSinceStart = Math.floor((now.getTime() - programStartDate.getTime()) / (24 * 60 * 60 * 1000)) + 1;
      const completedDays = Math.min(Math.max(0, daysSinceStart), totalDays);
      
      // Calculate current day (Day X of Y)
      const currentDay = Math.min(Math.max(1, daysSinceStart), totalDays);

      // Calculate current week
      const currentWeek = Math.min(Math.ceil(currentDay / 7), program.durationWeeks);

      // Calculate days remaining
      const daysRemaining = Math.max(0, totalDays - completedDays);

      // Determine program status
      let programStatus: 'ongoing' | 'completed' | 'upcoming' = 'ongoing';
      if (now > programEndDate) {
        programStatus = 'completed';
      } else if (now < programStartDate) {
        programStatus = 'upcoming';
      }

      res.json({ 
        current_program: {
          _id: program._id,
          startDate: programStartDate.toISOString().split('T')[0],
          endDate: programEndDate.toISOString().split('T')[0],
          lengthWeeks: program.durationWeeks,
          nextNutritionistVisit: nextNutritionistVisit.toISOString().split('T')[0],
          completedDays,
          totalDays,
          currentDay,
          daysRemaining,
          currentWeek,
          status: program.status,
          programStatus, // 'ongoing' | 'completed' | 'upcoming'
          progressPercentage: totalDays > 0 ? Math.round((completedDays / totalDays) * 100) : 0,
        }
      });
    } catch (error: any) {
      console.error('Error fetching program:', error);
      res.status(500).json({ message: error.message });
    }
  }
);

// Get program history (all programs for user)
router.get(
  '/programs/history',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const programs = await Program.find({ userId: req.user._id })
        .sort({ startDate: -1 }); // Most recent first

      const now = new Date();
      now.setHours(0, 0, 0, 0);

      const programHistory = programs.map((program) => {
        const programStartDate = new Date(program.startDate);
        programStartDate.setHours(0, 0, 0, 0);
        
        const programEndDate = new Date(programStartDate);
        programEndDate.setDate(programStartDate.getDate() + (program.durationWeeks * 7) - 1);
        programEndDate.setHours(23, 59, 59, 999);
        
        const nextNutritionistVisit = new Date(programEndDate);
        nextNutritionistVisit.setDate(programEndDate.getDate() + 1);
        nextNutritionistVisit.setHours(0, 0, 0, 0);

        const totalDays = program.durationWeeks * 7;
        const daysSinceStart = Math.floor((now.getTime() - programStartDate.getTime()) / (24 * 60 * 60 * 1000)) + 1;
        const completedDays = Math.min(Math.max(0, daysSinceStart), totalDays);
        const currentDay = Math.min(Math.max(1, daysSinceStart), totalDays);
        const daysRemaining = Math.max(0, totalDays - completedDays);

        let programStatus: 'ongoing' | 'completed' | 'upcoming' = 'ongoing';
        if (now > programEndDate) {
          programStatus = 'completed';
        } else if (now < programStartDate) {
          programStatus = 'upcoming';
        }

        return {
          _id: program._id,
          startDate: programStartDate.toISOString().split('T')[0],
          endDate: programEndDate.toISOString().split('T')[0],
          lengthWeeks: program.durationWeeks,
          nextNutritionistVisit: nextNutritionistVisit.toISOString().split('T')[0],
          completedDays,
          totalDays,
          currentDay,
          daysRemaining,
          status: program.status,
          programStatus,
          progressPercentage: totalDays > 0 ? Math.round((completedDays / totalDays) * 100) : 0,
        };
      });

      res.json({ programs: programHistory });
    } catch (error: any) {
      console.error('Error fetching program history:', error);
      res.status(500).json({ message: error.message });
    }
  }
);

// Get body progress photo for a specific date (date optional, default today; 200 + null when none)
router.get(
  '/body-photo',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const dateStr = (req.query.date as string) || new Date().toISOString().split('T')[0];
      const targetDate = new Date(dateStr);
      targetDate.setHours(0, 0, 0, 0);
      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);

      const photo = await BodyProgressPhoto.findOne({
        userId: req.user._id,
        date: {
          $gte: targetDate,
          $lte: endOfDay,
        },
      });

      return res.status(200).json({ photo: photo || null });
    } catch (error: any) {
      console.error('Error fetching body photo:', error);
      res.status(500).json({ message: error.message });
    }
  }
);

// Upload body progress photo
router.post(
  '/body-photo',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const { date, imageUrl, notes, weight } = req.body;
      
      if (!date || !imageUrl) {
        return res.status(400).json({ message: 'Date and imageUrl are required' });
      }

      const targetDate = new Date(date);
      targetDate.setHours(0, 0, 0, 0);
      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);

      // Check if photo already exists for this date
      const existingPhoto = await BodyProgressPhoto.findOne({
        userId: req.user._id,
        date: {
          $gte: targetDate,
          $lte: endOfDay,
        },
      });

      let photo;
      if (existingPhoto) {
        // Update existing photo
        existingPhoto.imageUrl = imageUrl;
        if (notes !== undefined) existingPhoto.notes = notes;
        if (weight !== undefined) existingPhoto.weight = weight;
        photo = await existingPhoto.save();
      } else {
        // Create new photo
        photo = await BodyProgressPhoto.create({
          userId: req.user._id,
          date: targetDate,
          imageUrl,
          notes,
          weight,
        });
      }

      res.json({ photo });
    } catch (error: any) {
      console.error('Error uploading body photo:', error);
      res.status(500).json({ message: error.message });
    }
  }
);

// Get coach event for a specific date (date optional, default today; 200 + null when none)
router.get(
  '/coach-event',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const dateStr = (req.query.date as string) || new Date().toISOString().split('T')[0];
      const targetDate = new Date(dateStr);
      targetDate.setHours(0, 0, 0, 0);
      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);

      const event = await CoachEvent.findOne({
        userId: req.user._id,
        date: {
          $gte: targetDate,
          $lte: endOfDay,
        },
      });

      return res.status(200).json({ event: event || null });
    } catch (error: any) {
      console.error('Error fetching coach event:', error);
      res.status(500).json({ message: error.message });
    }
  }
);

export default router;

