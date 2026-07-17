/**
 * Admin routes for workout plan management (PlanAssignment).
 * POST /api/admin/workout-plan/assign — Assign a plan to a client
 * POST /api/admin/workout-plan/:userId/change — Change a client's active plan
 * GET  /api/admin/workout-plan/:userId — Get client's plan assignment + progress
 */
import { Router, Response } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import PlanAssignment from '../../models/PlanAssignment.model';
import LevelTemplate from '../../models/LevelTemplate.model';
import WorkoutSession from '../../models/WorkoutSession.model';
const router = Router();
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

function parseStartDate(raw: string): Date {
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Invalid startDate');
  }
  parsed.setHours(0, 0, 0, 0);
  return parsed;
}

router.post(
  '/assign',
  async (req: AuthRequest, res: Response) => {
    try {
      const adminId = req.user?._id;
      const { userId, planTemplateId, startDate, note } = req.body as {
        userId: string;
        planTemplateId: string;
        startDate: string;
        note?: string;
      };

      if (!userId || !planTemplateId || !startDate) {
        return res.status(400).json({ message: 'userId, planTemplateId and startDate are required' });
      }

      const level = await LevelTemplate.findById(planTemplateId).lean();
      if (!level) return res.status(404).json({ message: 'Plan template not found' });
      if (!(level as any).weeks || (level as any).weeks.length === 0) {
        return res.status(400).json({ message: 'Plan template must have at least 1 week' });
      }

      // Check plan completeness
      if ((level as any).minimumSessionsPerWeek === undefined || (level as any).maximumSessionsPerWeek === undefined) {
        return res.status(400).json({
          message: "Ce programme est incomplet (nombre de séances min/max non configuré). Veuillez le mettre à jour avant de l'assigner."
        });
      }

      // Archive any existing active assignment (single active assignment per user).
      await PlanAssignment.updateMany(
        { userId, status: 'active' },
        { status: 'archived', archivedAt: new Date() }
      );

      const assignment = new PlanAssignment({
        userId,
        levelTemplateId: planTemplateId,
        assignedBy: adminId,
        assignedAt: new Date(),
        startDate: parseStartDate(startDate),
        note: note || undefined,
        status: 'active',
      });
      await assignment.save();

      res.json({ assignment, plan: level });
    } catch (e: unknown) {
      res.status(500).json({ message: (e as Error).message });
    }
  }
);

router.post(
  '/:userId/change',
  async (req: AuthRequest, res: Response) => {
    try {
      const adminId = req.user?._id;
      const { userId } = req.params;
      const { planTemplateId, startDate, note } = req.body as {
        planTemplateId: string;
        startDate: string;
        note?: string;
      };

      if (!planTemplateId || !startDate) {
        return res.status(400).json({ message: 'planTemplateId and startDate are required' });
      }

      const existing = await PlanAssignment.findOne({ userId, status: 'active' }).lean();

      const level = await LevelTemplate.findById(planTemplateId).lean();
      if (!level) return res.status(404).json({ message: 'Plan template not found' });
      if (!(level as any).weeks || (level as any).weeks.length === 0) {
        return res.status(400).json({ message: 'Plan template must have at least 1 week' });
      }

      // Check plan completeness
      if ((level as any).minimumSessionsPerWeek === undefined || (level as any).maximumSessionsPerWeek === undefined) {
        return res.status(400).json({
          message: "Ce programme est incomplet (nombre de séances min/max non configuré). Veuillez le mettre à jour avant de l'assigner."
        });
      }

      // Archive old assignment before creating the new one.
      if (existing?._id) {
        await PlanAssignment.updateOne({ _id: (existing as any)._id }, { status: 'archived', archivedAt: new Date() });
      }

      const newAssignment = new PlanAssignment({
        userId,
        levelTemplateId: planTemplateId,
        assignedBy: adminId,
        assignedAt: new Date(),
        startDate: parseStartDate(startDate),
        note: note || undefined,
        status: 'active',
      });
      await newAssignment.save();
      if (existing?._id) {
        await PlanAssignment.updateOne(
          { _id: (existing as any)._id },
          { replacedByAssignmentId: (newAssignment as any)._id }
        );
      }

      res.json({ assignment: newAssignment, plan: level });
    } catch (e: unknown) {
      res.status(500).json({ message: (e as Error).message });
    }
  }
);

router.get(
  '/:userId',
  async (req: AuthRequest, res: Response) => {
    try {
      const { userId } = req.params;
      const assignment = await PlanAssignment.findOne({ userId, status: 'active' }).lean();
      if (!assignment) return res.json({ assignment: null, plan: null, progress: null });

      const level = await LevelTemplate.findById((assignment as any).levelTemplateId).lean();
      const startMs = new Date(assignment.startDate).getTime();
      const planEndMs = new Date(assignment.endDate).getTime();
      const todayMs = Date.now();
      const durationWeeks = assignment.durationWeeks || 5;

      const completed = await WorkoutSession.find({
        userId, status: 'completed',
        date: { $gte: new Date(startMs), $lte: new Date(planEndMs) },
      }).select('date sessionId completionType').lean();

      let totalScheduled = 0, totalCompleted = 0, totalMissed = 0;

      for (let w = 0; w < durationWeeks; w++) {
        const weekTpl = (level as any)?.weeks?.find((wk: any) => wk.weekNumber === w + 1);
        for (let d = 0; d < 7; d++) {
          const pl = (weekTpl?.days as any)?.[DAY_KEYS[d]] || [];
          if (pl.length === 0) continue;
          totalScheduled += pl.length;
          const dayMs = startMs + (w * 7 + d) * MS_PER_DAY;
          if (dayMs > todayMs) continue;
          const key = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
          const done = (completed as any[]).some(c => {
            const ck = key(new Date(c.date));
            const dk = key(new Date(dayMs));
            return ck === dk;
          });
          if (done) totalCompleted += pl.length;
          else totalMissed += pl.length;
        }
      }

      const pct = totalScheduled > 0 ? Math.min(100, Math.round((totalCompleted / totalScheduled) * 100)) : 0;
      const remDays = Math.max(0, Math.ceil((planEndMs - todayMs) / MS_PER_DAY));
      const diff = Math.floor((todayMs - startMs) / MS_PER_DAY);
      const currWk = Math.max(0, Math.min(durationWeeks - 1, Math.floor(diff / 7)));

      res.json({
        assignment: {
          id: String((assignment as any)._id),
          startDate: assignment.startDate,
          endDate: assignment.endDate,
          durationWeeks,
          status: assignment.status,
        },
        plan: level ? {
          id: String((level as any)._id),
          name: (level as any).name,
          gender: (level as any).gender,
        } : null,
        progress: {
          currentWeek: currWk,
          totalWeeks: durationWeeks,
          totalScheduledSessions: totalScheduled,
          completedSessions: totalCompleted,
          missedSessions: totalMissed,
          completionPercent: pct,
          remainingDays: remDays,
          status: todayMs > planEndMs ? 'expired' : todayMs < startMs ? 'not_started' : 'active',
        },
      });
    } catch (e: unknown) {
      res.status(500).json({ message: (e as Error).message });
    }
  }
);

router.post('/:userId/pause', async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const doc = await PlanAssignment.findOne({ userId, status: 'active' });
    if (!doc) return res.status(404).json({ message: 'No active assignment' });
    doc.status = 'paused';
    await doc.save();
    res.json({ message: 'Assignment paused' });
  } catch (e: unknown) { res.status(500).json({ message: (e as Error).message }); }
});

router.post('/:userId/resume', async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const doc = await PlanAssignment.findOne({ userId, status: 'paused' });
    if (!doc) return res.status(404).json({ message: 'No paused assignment' });
    doc.status = 'active';
    await doc.save();
    res.json({ message: 'Assignment resumed' });
  } catch (e: unknown) { res.status(500).json({ message: (e as Error).message }); }
});

router.post('/:userId/archive', async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const doc = await PlanAssignment.findOne({ userId, status: { $in: ['active', 'paused'] } });
    if (!doc) return res.status(404).json({ message: 'No active assignment to archive' });
    doc.status = 'archived';
    doc.archivedAt = new Date();
    await doc.save();
    res.json({ message: 'Assignment archived' });
  } catch (e: unknown) { res.status(500).json({ message: (e as Error).message }); }
});

router.post('/:userId/restart-week1', async (req: AuthRequest, res: Response) => {
  try {
    const adminId = req.user?._id;
    const { userId } = req.params;
    const existing = await PlanAssignment.findOne({ userId, status: 'active' }).lean();
    if (!existing) return res.status(404).json({ message: 'No active assignment found' });

    await PlanAssignment.updateOne(
      { _id: (existing as any)._id },
      { status: 'archived', archivedAt: new Date() }
    );

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const restarted = new PlanAssignment({
      userId,
      levelTemplateId: (existing as any).levelTemplateId,
      assignedBy: adminId,
      assignedAt: new Date(),
      startDate: today,
      status: 'active',
      note: 'Restarted from week 1 by admin',
    });
    await restarted.save();
    await PlanAssignment.updateOne(
      { _id: (existing as any)._id },
      { replacedByAssignmentId: (restarted as any)._id }
    );

    return res.json({ assignment: restarted });
  } catch (e: unknown) {
    return res.status(500).json({ message: (e as Error).message });
  }
});

export default router;