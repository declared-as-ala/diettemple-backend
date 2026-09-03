import { Router, Response } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import PlanAssignment from '../../models/PlanAssignment.model';
import LevelTemplate from '../../models/LevelTemplate.model';
import WorkoutSession from '../../models/WorkoutSession.model';
import { calculateTrainingWeekProgress } from '../../services/weeklyProgress.service';
import { cancelPlanAssignments, createPlanAssignment, reconcileUserAssignments, renewPlanAssignment } from '../../services/planAssignmentLifecycle.service';
import { addBusinessDays, diffBusinessDays, parseBusinessDate, todayInBusinessTimeZone } from '../../utils/businessDate';

const router = Router();
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

router.post('/assign', async (req: AuthRequest, res: Response) => {
  try {
    const { userId, planTemplateId, startDate, note } = req.body;
    if (!userId || !planTemplateId || !startDate) return res.status(400).json({ message: 'userId, planTemplateId and startDate are required' });
    return res.json(await createPlanAssignment({ userId, planTemplateId, startDate: parseBusinessDate(startDate), action: 'assign', adminId: req.user?._id, note }));
  } catch (error: unknown) { return res.status(400).json({ message: (error as Error).message }); }
});

router.post('/:userId/change', async (req: AuthRequest, res: Response) => {
  try {
    const { planTemplateId, startDate, note } = req.body;
    if (!planTemplateId || !startDate) return res.status(400).json({ message: 'planTemplateId and startDate are required' });
    return res.json(await createPlanAssignment({ userId: req.params.userId, planTemplateId, startDate: parseBusinessDate(startDate), action: 'replace', adminId: req.user?._id, note }));
  } catch (error: unknown) { return res.status(400).json({ message: (error as Error).message }); }
});

router.post('/:userId/renew', async (req: AuthRequest, res: Response) => {
  try { return res.json(await renewPlanAssignment(req.params.userId, req.user?._id, req.body?.note)); }
  catch (error: unknown) { return res.status(400).json({ message: (error as Error).message }); }
});

router.post('/:userId/cancel', async (req: AuthRequest, res: Response) => {
  try { await cancelPlanAssignments(req.params.userId, req.user?._id, req.body?.note); return res.json({ message: 'Assignment cancelled' }); }
  catch (error: unknown) { return res.status(400).json({ message: (error as Error).message }); }
});

router.get('/:userId/history', async (req: AuthRequest, res: Response) => {
  try {
    const assignments = await PlanAssignment.find({ userId: req.params.userId }).sort({ startDate: -1, assignedAt: -1 }).populate('levelTemplateId', 'name clientDisplayName weeks durationWeeks').lean();
    return res.json({ assignments });
  } catch (error: unknown) { return res.status(500).json({ message: (error as Error).message }); }
});

router.get('/:userId', async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    await reconcileUserAssignments(userId);
    const assignment = await PlanAssignment.findOne({ userId, status: { $in: ['active', 'scheduled'] } }).sort({ startDate: 1 }).lean();
    if (!assignment) return res.json({ assignment: null, plan: null, progress: null, weekProgress: [] });
    const level = await LevelTemplate.findById(assignment.levelTemplateId).lean();
    const durationWeeks = Number((assignment as any).durationWeeksSnapshot || assignment.durationWeeks);
    if (!Number.isInteger(durationWeeks) || durationWeeks < 1) return res.status(409).json({ message: 'Assignment is missing its duration snapshot' });

    const start = new Date(assignment.startDate);
    const end = new Date(assignment.endDate);
    const today = todayInBusinessTimeZone();
    const completed = await WorkoutSession.find({ userId, status: 'completed', date: { $gte: start, $lt: end } }).select('date sessionId completionType').lean();
    let totalScheduled = 0, totalCompleted = 0, totalMissed = 0;
    for (let week = 0; week < durationWeeks; week += 1) {
      const weekTemplate = (level as any)?.weeks?.find((item: any) => item.weekNumber === week + 1);
      for (let day = 0; day < 7; day += 1) {
        const placements = (weekTemplate?.days as any)?.[DAY_KEYS[day]] || [];
        if (!placements.length) continue;
        totalScheduled += placements.length;
        const scheduledDate = addBusinessDays(start, week * 7 + day);
        if (scheduledDate > today) continue;
        const done = (completed as any[]).some((item) => diffBusinessDays(new Date(item.date), scheduledDate) === 0);
        if (done) totalCompleted += placements.length; else totalMissed += placements.length;
      }
    }
    const diff = diffBusinessDays(today, start);
    const currentWeek = Math.max(0, Math.min(durationWeeks - 1, Math.floor(diff / 7)));
    let weekProgress: Array<Awaited<ReturnType<typeof calculateTrainingWeekProgress>>> = [];
    try { weekProgress = await Promise.all(Array.from({ length: durationWeeks }, (_, index) => calculateTrainingWeekProgress(userId, (assignment as any)._id, index + 1))); } catch { weekProgress = []; }

    return res.json({
      assignment: { id: String((assignment as any)._id), startDate: start, endDate: end, startsAt: start, expiresAt: end, finalActiveDate: addBusinessDays(end, -1), durationWeeks, durationDays: durationWeeks * 7, status: assignment.status },
      plan: level ? { id: String((level as any)._id), name: (level as any).name, gender: (level as any).gender } : null,
      progress: {
        currentWeek, totalWeeks: durationWeeks, totalScheduledSessions: totalScheduled, completedSessions: totalCompleted,
        missedSessions: totalMissed, completionPercent: totalScheduled ? Math.min(100, Math.round((totalCompleted / totalScheduled) * 100)) : 0,
        remainingDays: Math.max(0, diffBusinessDays(end, today)), status: today >= end ? 'expired' : today < start ? 'not_started' : 'active',
      },
      weekProgress,
    });
  } catch (error: unknown) { return res.status(500).json({ message: (error as Error).message }); }
});

router.post('/:userId/pause', async (req: AuthRequest, res: Response) => {
  const assignment = await PlanAssignment.findOne({ userId: req.params.userId, status: 'active' });
  if (!assignment) return res.status(404).json({ message: 'No active assignment' });
  assignment.status = 'paused'; await assignment.save(); return res.json({ message: 'Assignment paused' });
});

router.post('/:userId/resume', async (req: AuthRequest, res: Response) => {
  const assignment = await PlanAssignment.findOne({ userId: req.params.userId, status: 'paused' });
  if (!assignment) return res.status(404).json({ message: 'No paused assignment' });
  assignment.status = assignment.startDate > todayInBusinessTimeZone() ? 'scheduled' : 'active'; await assignment.save(); return res.json({ message: 'Assignment resumed' });
});

router.post('/:userId/archive', async (req: AuthRequest, res: Response) => {
  await cancelPlanAssignments(req.params.userId, req.user?._id, req.body?.note); return res.json({ message: 'Assignment cancelled' });
});

router.post('/:userId/restart-week1', async (req: AuthRequest, res: Response) => {
  try {
    const current = await PlanAssignment.findOne({ userId: req.params.userId, status: 'active' });
    if (!current) return res.status(404).json({ message: 'No active assignment found' });
    return res.json(await createPlanAssignment({ userId: req.params.userId, planTemplateId: current.levelTemplateId, startDate: todayInBusinessTimeZone(), action: 'replace', adminId: req.user?._id, note: req.body?.note || 'Restarted from week 1 by admin' }));
  } catch (error: unknown) { return res.status(400).json({ message: (error as Error).message }); }
});

export default router;
