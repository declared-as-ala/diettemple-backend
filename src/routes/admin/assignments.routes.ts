import { Router, Response } from 'express';
import { query } from 'express-validator';
import Subscription from '../../models/Subscription.model';
import User from '../../models/User.model';
import LevelTemplate from '../../models/LevelTemplate.model';
import { AuthRequest } from '../../middleware/auth.middleware';

const router = Router();
const now = new Date();

function effectiveStatus(sub: { status: string; endAt: Date }): string {
  if (sub.status !== 'ACTIVE') return sub.status;
  return sub.endAt < now ? 'EXPIRED' : 'ACTIVE';
}

function daysRemaining(endAt: Date): number | null {
  const end = new Date(endAt);
  end.setHours(0, 0, 0, 0);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return Math.ceil((end.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

const expiringSoonDays = 7;
const expiringSoonEnd = new Date(now.getTime() + expiringSoonDays * 24 * 60 * 60 * 1000);

// GET /assignments/board — users + templates for assignment board
router.get(
  '/board',
  [
    query('search').optional().isString(),
    query('status').optional().isIn(['ACTIVE', 'EXPIRED', 'NONE']),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const page = parseInt((req.query.page as string) || '1');
      const limit = parseInt((req.query.limit as string) || '50');
      const skip = (page - 1) * limit;
      const search = (req.query.search as string) || '';
      const statusFilter = (req.query.status as string) || '';

      const userFilter: Record<string, unknown> = { role: { $ne: 'admin' } };
      if (search) {
        userFilter.$or = [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { phone: { $regex: search.replace(/\s/g, ''), $options: 'i' } },
        ];
      }

      const [users, subscriptions, levelTemplates] = await Promise.all([
        User.find(userFilter).select('name email phone').sort({ name: 1 }).skip(skip).limit(limit).lean(),
        Subscription.find({})
          .populate('userId', 'name email phone')
          .populate('levelTemplateId', 'name')
          .lean(),
        LevelTemplate.find({ isActive: true }).select('name').sort({ name: 1 }).lean(),
      ]);

      const subsByUser = new Map<string, typeof subscriptions>();
      subscriptions.forEach((s: any) => {
        const uid = s.userId?._id?.toString();
        if (uid) {
          if (!subsByUser.has(uid)) subsByUser.set(uid, []);
          subsByUser.get(uid)!.push(s);
        }
      });

      const userList = users
        .map((u: any) => {
          const uid = u._id.toString();
          const userSubs = subsByUser.get(uid) || [];
          const activeSub = userSubs.find((s: any) => s.status === 'ACTIVE' && new Date(s.endAt) >= now);
          const latestSub = userSubs.length
            ? userSubs.sort((a: any, b: any) => new Date(b.endAt).getTime() - new Date(a.endAt).getTime())[0]
            : null;
          const sub = activeSub || latestSub;
          const effective = sub ? effectiveStatus(sub) : 'NONE';
          if (statusFilter && effective !== statusFilter) return null;
          const levelName = (sub?.levelTemplateId as { name?: string } | undefined)?.name;
          const levelId = sub?.levelTemplateId?._id?.toString();
          const endAt = sub?.endAt;
          const dr = endAt != null ? daysRemaining(endAt) : null;
          return {
            _id: uid,
            name: u.name,
            email: u.email,
            phone: u.phone,
            subscription: sub
              ? {
                  _id: sub._id.toString(),
                  levelTemplateId: levelId,
                  levelName,
                  status: sub.status,
                  effectiveStatus: effective,
                  startAt: sub.startAt,
                  endAt: sub.endAt,
                  daysRemaining: dr,
                }
              : null,
          };
        })
        .filter(Boolean);

      const templateIds = (levelTemplates as any[]).map((t) => t._id.toString());
      const activeCounts = await Subscription.aggregate([
        { $match: { status: 'ACTIVE', endAt: { $gt: now } } },
        { $group: { _id: '$levelTemplateId', count: { $sum: 1 } } },
      ]);
      const expiringCounts = await Subscription.aggregate([
        { $match: { status: 'ACTIVE', endAt: { $gte: now, $lte: expiringSoonEnd } } },
        { $group: { _id: '$levelTemplateId', count: { $sum: 1 } } },
      ]);
      const activeMap = new Map(activeCounts.map((x: any) => [x._id?.toString(), x.count]));
      const expiringMap = new Map(expiringCounts.map((x: any) => [x._id?.toString(), x.count]));

      const templates = templateIds.map((id) => {
        const t = (levelTemplates as any[]).find((l) => l._id.toString() === id);
        return {
          _id: id,
          name: t?.name ?? id,
          activeCount: activeMap.get(id) ?? 0,
          expiringSoonCount: expiringMap.get(id) ?? 0,
        };
      });

      const totalUsers = await User.countDocuments(userFilter);

      res.json({
        users: userList,
        templates,
        pagination: { page, limit, total: totalUsers, pages: Math.ceil(totalUsers / limit) },
      });
    } catch (err: unknown) {
      res.status(500).json({ message: (err as Error).message });
    }
  }
);

export default router;
