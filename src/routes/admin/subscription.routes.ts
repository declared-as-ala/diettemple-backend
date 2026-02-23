import { Router } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import Subscription from '../../models/Subscription.model';
import User from '../../models/User.model';
import LevelTemplate from '../../models/LevelTemplate.model';
import { AuthRequest } from '../../middleware/auth.middleware';

const router = Router();
const now = new Date();

// Helper: compute effective status (endAt < now => EXPIRED if currently ACTIVE)
function effectiveStatus(sub: { status: string; endAt: Date }): string {
  if (sub.status !== 'ACTIVE') return sub.status;
  return sub.endAt < now ? 'EXPIRED' : 'ACTIVE';
}

// POST /subscriptions/assign — must be before /:id
router.post(
  '/assign',
  [
    body('userId').isMongoId(),
    body('levelTemplateId').isMongoId(),
    body('startAt').isISO8601(),
    body('endAt').isISO8601(),
    body('note').optional().isString(),
  ],
  async (req: AuthRequest, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: errors.array()[0].msg });
      }
      const { userId, levelTemplateId, startAt, endAt, note } = req.body;
      const start = new Date(startAt);
      const end = new Date(endAt);
      if (end <= start) {
        return res.status(400).json({ message: 'endAt must be after startAt' });
      }
      const [user, level] = await Promise.all([
        User.findById(userId),
        LevelTemplate.findById(levelTemplateId),
      ]);
      if (!user) return res.status(404).json({ message: 'User not found' });
      if (!level) return res.status(404).json({ message: 'Level template not found' });

      const activeSub = await Subscription.findOne({
        userId,
        status: 'ACTIVE',
        endAt: { $gt: now },
      });
      if (activeSub) {
        return res.status(400).json({
          message: 'User already has an active subscription. Cancel it first or use change-level.',
        });
      }

      const doc = await Subscription.create({
        userId,
        levelTemplateId,
        status: 'ACTIVE',
        startAt: start,
        endAt: end,
        autoRenew: false,
        history: [
          {
            action: 'assign',
            toLevelTemplateId: levelTemplateId,
            date: new Date(),
            adminId: req.user?._id,
            note,
          },
        ],
      });
      const sub = await Subscription.findById(doc._id)
        .populate('userId', 'name email phone')
        .populate('levelTemplateId', 'name')
        .lean();
      res.status(201).json({ subscription: sub });
    } catch (err: unknown) {
      res.status(500).json({ message: (err as Error).message });
    }
  }
);

// GET /subscriptions
router.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('status').optional().isIn(['ACTIVE', 'EXPIRED', 'CANCELED']),
    query('levelTemplateId').optional().isMongoId(),
    query('searchUser').optional().isString(),
    query('expiringSoonDays').optional().isInt({ min: 1, max: 90 }),
  ],
  async (req: AuthRequest, res) => {
    try {
      const page = parseInt((req.query.page as string) || '1');
      const limit = parseInt((req.query.limit as string) || '20');
      const skip = (page - 1) * limit;
      const filter: Record<string, unknown> = {};

      if (req.query.status) filter.status = req.query.status;
      if (req.query.levelTemplateId) filter.levelTemplateId = req.query.levelTemplateId;
      if (req.query.searchUser) {
        const users = await User.find({
          $or: [
            { name: { $regex: req.query.searchUser, $options: 'i' } },
            { email: { $regex: req.query.searchUser, $options: 'i' } },
            { phone: { $regex: String(req.query.searchUser).replace(/\s/g, '') } },
          ],
        })
          .select('_id')
          .lean();
        filter.userId = { $in: users.map((u) => u._id) };
      }
      if (req.query.expiringSoonDays) {
        const days = parseInt(req.query.expiringSoonDays as string);
        const from = now;
        const to = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
        filter.status = 'ACTIVE';
        filter.endAt = { $gte: from, $lte: to };
      }

      const [list, total] = await Promise.all([
        Subscription.find(filter)
          .populate('userId', 'name email phone')
          .populate('levelTemplateId', 'name')
          .sort({ endAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Subscription.countDocuments(filter),
      ]);

      const subscriptions = list.map((s: any) => ({
        ...s,
        effectiveStatus: effectiveStatus(s),
      }));

      res.json({
        subscriptions,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      });
    } catch (err: unknown) {
      res.status(500).json({ message: (err as Error).message });
    }
  }
);

// GET /subscriptions/:id
router.get(
  '/:id',
  [param('id').isMongoId()],
  async (req: AuthRequest, res) => {
    try {
      const sub = await Subscription.findById(req.params.id)
        .populate('userId', 'name email phone')
        .populate('levelTemplateId', 'name')
        .lean();
      if (!sub) return res.status(404).json({ message: 'Subscription not found' });
      (sub as any).effectiveStatus = effectiveStatus(sub as any);
      res.json({ subscription: sub });
    } catch (err: unknown) {
      res.status(500).json({ message: (err as Error).message });
    }
  }
);

// PUT /subscriptions/:id/renew
router.put(
  '/:id/renew',
  [param('id').isMongoId(), body('newEndAt').isISO8601(), body('note').optional().isString()],
  async (req: AuthRequest, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: errors.array()[0].msg });
      }
      const sub = await Subscription.findById(req.params.id);
      if (!sub) return res.status(404).json({ message: 'Subscription not found' });
      const newEndAt = new Date(req.body.newEndAt);
      if (newEndAt <= sub.endAt) {
        return res.status(400).json({ message: 'newEndAt must be after current endAt' });
      }
      const prevEnd = sub.endAt;
      sub.endAt = newEndAt;
      sub.history = sub.history || [];
      sub.history.push({
        action: 'renew',
        fromLevelTemplateId: sub.levelTemplateId,
        toLevelTemplateId: sub.levelTemplateId,
        date: new Date(),
        adminId: req.user?._id,
        note: req.body.note,
      });
      await sub.save();
      const out = await Subscription.findById(sub._id)
        .populate('userId', 'name email phone')
        .populate('levelTemplateId', 'name')
        .lean();
      (out as any).effectiveStatus = effectiveStatus(out as any);
      res.json({ subscription: out });
    } catch (err: unknown) {
      res.status(500).json({ message: (err as Error).message });
    }
  }
);

// PUT /subscriptions/:id/change-level
router.put(
  '/:id/change-level',
  [
    param('id').isMongoId(),
    body('newLevelTemplateId').isMongoId(),
    body('keepDates').optional().isBoolean(),
    body('newEndAt').optional().isISO8601(),
    body('note').optional().isString(),
  ],
  async (req: AuthRequest, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: errors.array()[0].msg });
      }
      const sub = await Subscription.findById(req.params.id);
      if (!sub) return res.status(404).json({ message: 'Subscription not found' });
      const level = await LevelTemplate.findById(req.body.newLevelTemplateId);
      if (!level) return res.status(404).json({ message: 'Level template not found' });

      const fromId = sub.levelTemplateId;
      sub.levelTemplateId = level._id;
      if (req.body.keepDates !== true && req.body.newEndAt) {
        sub.endAt = new Date(req.body.newEndAt);
      }
      sub.history = sub.history || [];
      sub.history.push({
        action: 'change_level',
        fromLevelTemplateId: fromId,
        toLevelTemplateId: level._id,
        date: new Date(),
        adminId: req.user?._id,
        note: req.body.note,
      });
      await sub.save();
      const out = await Subscription.findById(sub._id)
        .populate('userId', 'name email phone')
        .populate('levelTemplateId', 'name')
        .lean();
      (out as any).effectiveStatus = effectiveStatus(out as any);
      res.json({ subscription: out });
    } catch (err: unknown) {
      res.status(500).json({ message: (err as Error).message });
    }
  }
);

// PUT /subscriptions/:id/cancel
router.put(
  '/:id/cancel',
  [param('id').isMongoId(), body('note').optional().isString()],
  async (req: AuthRequest, res) => {
    try {
      const sub = await Subscription.findById(req.params.id);
      if (!sub) return res.status(404).json({ message: 'Subscription not found' });
      sub.status = 'CANCELED';
      sub.history = sub.history || [];
      sub.history.push({
        action: 'cancel',
        fromLevelTemplateId: sub.levelTemplateId,
        date: new Date(),
        adminId: req.user?._id,
        note: req.body.note,
      });
      await sub.save();
      const out = await Subscription.findById(sub._id)
        .populate('userId', 'name email phone')
        .populate('levelTemplateId', 'name')
        .lean();
      (out as any).effectiveStatus = 'CANCELED';
      res.json({ subscription: out });
    } catch (err: unknown) {
      res.status(500).json({ message: (err as Error).message });
    }
  }
);

export default router;
