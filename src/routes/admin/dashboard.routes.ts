import { Router, Response } from 'express';
import { query } from 'express-validator';
import User from '../../models/User.model';
import Subscription from '../../models/Subscription.model';
import Exercise from '../../models/Exercise.model';
import SessionTemplate from '../../models/SessionTemplate.model';
import LevelTemplate from '../../models/LevelTemplate.model';
import WorkoutSession from '../../models/WorkoutSession.model';
import { AuthRequest } from '../../middleware/auth.middleware';

const router = Router();
const now = new Date();

function getRangeDates(range: string): { start: Date; end: Date } {
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  switch (range) {
    case '7d':
      start.setDate(start.getDate() - 7);
      break;
    case '30d':
      start.setDate(start.getDate() - 30);
      break;
    case '90d':
      start.setDate(start.getDate() - 90);
      break;
    case '12m':
      start.setFullYear(start.getFullYear() - 1);
      break;
    default:
      start.setDate(start.getDate() - 30);
  }
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

// GET /dashboard/stats
router.get(
  '/stats',
  async (req: AuthRequest, res: Response) => {
    try {
      const range = (req.query.range as string) || '30d';
      const { start, end } = getRangeDates(range);
      const expiringEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      const [
        usersTotal,
        usersNewByRange,
        activeSubscriptionsCount,
        expiredSubscriptionsCount,
        expiringSoonCount,
        levelsDistributionAgg,
        subscriptionActionsInRange,
        exercisesCount,
        sessionTemplatesCount,
        levelTemplatesCount,
      ] = await Promise.all([
        User.countDocuments({ role: { $ne: 'admin' } }),
        User.countDocuments({ role: { $ne: 'admin' }, createdAt: { $gte: start, $lte: end } }),
        Subscription.countDocuments({ status: 'ACTIVE', endAt: { $gt: now } }),
        Subscription.countDocuments({ $or: [{ status: 'EXPIRED' }, { status: 'ACTIVE', endAt: { $lt: now } }] }),
        Subscription.countDocuments({ status: 'ACTIVE', endAt: { $gte: now, $lte: expiringEnd } }),
        Subscription.aggregate([
          { $match: { status: 'ACTIVE', endAt: { $gt: now } } },
          { $group: { _id: '$levelTemplateId', count: { $sum: 1 } } },
        ]),
        Subscription.aggregate([
          { $unwind: '$history' },
          { $match: { 'history.date': { $gte: start, $lte: end } } },
          { $group: { _id: '$history.action', count: { $sum: 1 } } },
        ]),
        Exercise.countDocuments(),
        SessionTemplate.countDocuments(),
        LevelTemplate.countDocuments(),
      ]);

      const levelNames: Record<string, number> = {};
      const levelTemplates = await LevelTemplate.find().select('name').lean();
      levelTemplates.forEach((l: any) => { levelNames[l._id.toString()] = 0; });
      levelsDistributionAgg.forEach((item: any) => {
        const id = item._id?.toString();
        if (id) levelNames[id] = item.count;
      });
      const levelsDistribution = levelTemplates.map((l: any) => ({
        levelTemplateId: l._id,
        levelName: l.name,
        count: levelNames[l._id.toString()] ?? 0,
      }));

      const actionCounts: Record<string, number> = { renew: 0, change_level: 0, cancel: 0, assign: 0 };
      subscriptionActionsInRange.forEach((item: any) => {
        actionCounts[item._id] = item.count;
      });

      // Top session templates by usage in level templates (placements)
      const levelDocs = await LevelTemplate.find().select('weeks').lean();
      const sessionUsage: Record<string, number> = {};
      levelDocs.forEach((doc: any) => {
        (doc.weeks || []).forEach((w: any) => {
          const days = w.days || {};
          ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].forEach((d) => {
            (days[d] || []).forEach((p: any) => {
              const sid = p.sessionTemplateId?.toString();
              if (sid) sessionUsage[sid] = (sessionUsage[sid] || 0) + 1;
            });
          });
        });
      });
      const trainingTemplateUsage = Object.entries(sessionUsage)
        .map(([sessionTemplateId, count]) => ({ sessionTemplateId, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      const [expiringSoonList, recentlyExpiredList] = await Promise.all([
        Subscription.find({ status: 'ACTIVE', endAt: { $gte: now, $lte: expiringEnd } })
          .populate('userId', 'name email phone')
          .populate('levelTemplateId', 'name')
          .sort({ endAt: 1 })
          .limit(10)
          .lean(),
        Subscription.find({ status: 'ACTIVE', endAt: { $lt: now } })
          .populate('userId', 'name email phone')
          .populate('levelTemplateId', 'name')
          .sort({ endAt: -1 })
          .limit(10)
          .lean(),
      ]);

      res.json({
        usersTotal,
        usersNewByRange,
        activeSubscriptionsCount,
        expiredSubscriptionsCount,
        expiringSoonCount,
        levelsDistribution,
        subscriptionActionsCount: actionCounts,
        templatesCounts: {
          exercisesCount,
          sessionTemplatesCount,
          levelTemplatesCount,
        },
        trainingTemplateUsage,
        expiringSoonList: expiringSoonList.map((s: any) => ({ ...s, effectiveStatus: 'ACTIVE' })),
        recentlyExpiredList: recentlyExpiredList.map((s: any) => ({ ...s, effectiveStatus: 'EXPIRED' })),
      });
    } catch (err: unknown) {
      res.status(500).json({ message: (err as Error).message });
    }
  }
);

// GET /dashboard/inactive?days=7 — clients with no completed workout in last N days (active subscription)
router.get(
  '/inactive',
  [query('days').optional().isInt({ min: 1, max: 90 })],
  async (req: AuthRequest, res: Response) => {
    try {
      const days = parseInt((req.query.days as string) || '7');
      const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      const activeSubs = await Subscription.find({
        status: 'ACTIVE',
        endAt: { $gt: now },
      })
        .populate('userId', 'name email phone')
        .populate('levelTemplateId', 'name')
        .lean();
      const lastWorkout = await WorkoutSession.aggregate([
        { $match: { status: 'completed' } },
        { $sort: { date: -1 } },
        { $group: { _id: '$userId', lastDate: { $first: '$date' } } },
      ]);
      const lastByUser = new Map(lastWorkout.map((x: any) => [x._id.toString(), x.lastDate]));
      const inactive = (activeSubs as any[])
        .filter((s) => {
          const uid = s.userId?._id?.toString();
          if (!uid) return false;
          const last = lastByUser.get(uid);
          return !last || new Date(last) < since;
        })
        .map((s) => ({
          ...s,
          lastWorkoutDate: lastByUser.get((s.userId as any)?._id?.toString()) || null,
        }))
        .slice(0, 50);
      res.json({ inactive, total: inactive.length });
    } catch (err: unknown) {
      res.status(500).json({ message: (err as Error).message });
    }
  }
);

// GET /dashboard/charts?range=7d|30d|90d|12m
router.get(
  '/charts',
  [query('range').optional().isIn(['7d', '30d', '90d', '12m'])],
  async (req: AuthRequest, res: Response) => {
    try {
      const range = (req.query.range as string) || '30d';
      const { start, end } = getRangeDates(range);

      const dayMs = 24 * 60 * 60 * 1000;
      const days: Date[] = [];
      for (let d = new Date(start); d <= end; d.setTime(d.getTime() + dayMs)) {
        days.push(new Date(d));
      }

      const signupsOverTime = await Promise.all(
        days.map(async (date) => {
          const next = new Date(date.getTime() + dayMs);
          const count = await User.countDocuments({
            role: { $ne: 'admin' },
            createdAt: { $gte: date, $lt: next },
          });
          return { date: date.toISOString().split('T')[0], count };
        })
      );

      const activeVsExpiredOverTime = await Promise.all(
        days.map(async (date) => {
          const next = new Date(date.getTime() + dayMs);
          const active = await Subscription.countDocuments({
            status: 'ACTIVE',
            startAt: { $lt: next },
            endAt: { $gte: date },
          });
          const expired = await Subscription.countDocuments({
            $or: [{ status: 'EXPIRED' }, { status: 'ACTIVE', endAt: { $lt: date } }],
            endAt: { $gte: new Date(start), $lt: next },
          });
          return { date: date.toISOString().split('T')[0], active, expired };
        })
      );

      const levelsAgg = await Subscription.aggregate([
        { $match: { status: 'ACTIVE', endAt: { $gt: now } } },
        { $group: { _id: '$levelTemplateId', count: { $sum: 1 } } },
      ]);
      const levelTemplates = await LevelTemplate.find().select('name').lean();
      const levelMap: Record<string, string> = {};
      levelTemplates.forEach((l: any) => { levelMap[l._id.toString()] = l.name; });
      const distributionByLevel = levelsAgg.map((item: any) => ({
        levelTemplateId: item._id,
        levelName: levelMap[item._id?.toString()] || 'Unknown',
        count: item.count,
      }));

      const expiringByDay = await Promise.all(
        [0, 1, 2, 3, 4, 5, 6].map((offset) => {
          const dayStart = new Date(now);
          dayStart.setDate(dayStart.getDate() + offset);
          dayStart.setHours(0, 0, 0, 0);
          const dayEnd = new Date(dayStart);
          dayEnd.setDate(dayEnd.getDate() + 1);
          return Subscription.countDocuments({
            status: 'ACTIVE',
            endAt: { $gte: dayStart, $lt: dayEnd },
          }).then((count) => ({
            day: dayStart.toISOString().split('T')[0],
            label: ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'][dayStart.getDay()],
            count,
          }));
        })
      );

      const levelDocs = await LevelTemplate.find().select('weeks').lean();
      const sessionUsage: Record<string, number> = {};
      levelDocs.forEach((doc: any) => {
        (doc.weeks || []).forEach((w: any) => {
          const daysObj = w.days || {};
          ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].forEach((d) => {
            (daysObj[d] || []).forEach((p: any) => {
              const sid = p.sessionTemplateId?.toString();
              if (sid) sessionUsage[sid] = (sessionUsage[sid] || 0) + 1;
            });
          });
        });
      });
      const topSessionTemplates = await Promise.all(
        Object.entries(sessionUsage)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(async ([id, count]) => {
            const st = await SessionTemplate.findById(id).select('title').lean();
            return { sessionTemplateId: id, title: (st as any)?.title || 'Unknown', count };
          })
      );

      res.json({
        signupsOverTime,
        activeVsExpiredOverTime,
        distributionByLevel,
        expiringByDay,
        topSessionTemplates,
      });
    } catch (err: unknown) {
      res.status(500).json({ message: (err as Error).message });
    }
  }
);

export default router;
