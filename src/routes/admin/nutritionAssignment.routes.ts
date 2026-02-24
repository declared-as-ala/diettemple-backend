import { Router, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import UserNutritionPlan from '../../models/UserNutritionPlan.model';
import User from '../../models/User.model';
import NutritionPlanTemplate from '../../models/NutritionPlanTemplate.model';
import { AuthRequest } from '../../middleware/auth.middleware';

const router = Router();
const now = new Date();

function effectiveStatus(a: { status: string; endAt: Date }): string {
  if (a.status !== 'ACTIVE') return a.status;
  return a.endAt < now ? 'EXPIRED' : 'ACTIVE';
}

// POST /assign (before :id)
router.post(
  '/assign',
  [
    body('userId').isMongoId(),
    body('nutritionPlanTemplateId').isMongoId(),
    body('startAt').isISO8601(),
    body('endAt').isISO8601(),
    body('overrides').optional().isObject(),
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const { userId, nutritionPlanTemplateId, startAt, endAt, overrides } = req.body;
      const start = new Date(startAt);
      const end = new Date(endAt);
      if (end <= start) return res.status(400).json({ message: 'endAt must be after startAt' });

      const [user, template] = await Promise.all([
        User.findById(userId),
        NutritionPlanTemplate.findById(nutritionPlanTemplateId),
      ]);
      if (!user) return res.status(404).json({ message: 'User not found' });
      if (!template) return res.status(404).json({ message: 'Nutrition plan template not found' });

      await UserNutritionPlan.updateMany(
        { userId, status: 'ACTIVE' },
        { $set: { status: 'PAUSED' } }
      );

      const doc = await UserNutritionPlan.create({
        userId,
        nutritionPlanTemplateId,
        startAt: start,
        endAt: end,
        status: 'ACTIVE',
        adjustments: overrides || undefined,
      });
      const out = await UserNutritionPlan.findById(doc._id)
        .populate('userId', 'name email')
        .populate('nutritionPlanTemplateId', 'name dailyCalories')
        .lean();
      res.status(201).json({ assignment: out });
    } catch (e: unknown) {
      res.status(500).json({ message: (e as Error).message });
    }
  }
);

// GET / (list assignments)
router.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('status').optional().isIn(['ACTIVE', 'EXPIRED', 'PAUSED']),
    query('searchUser').optional().isString(),
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const page = parseInt((req.query.page as string) || '1');
      const limit = parseInt((req.query.limit as string) || '20');
      const skip = (page - 1) * limit;
      const filter: any = {};
      if (req.query.status) filter.status = req.query.status;
      if (req.query.searchUser) {
        const users = await User.find({
          $or: [
            { name: { $regex: req.query.searchUser, $options: 'i' } },
            { email: { $regex: req.query.searchUser, $options: 'i' } },
          ],
        }).select('_id').lean();
        filter.userId = { $in: users.map((u: any) => u._id) };
      }
      const [list, total] = await Promise.all([
        UserNutritionPlan.find(filter)
          .populate('userId', 'name email')
          .populate('nutritionPlanTemplateId', 'name dailyCalories')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        UserNutritionPlan.countDocuments(filter),
      ]);
      const withEffective = list.map((a: any) => ({
        ...a,
        effectiveStatus: effectiveStatus(a),
      }));
      res.json({
        assignments: withEffective,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      });
    } catch (e: unknown) {
      res.status(500).json({ message: (e as Error).message });
    }
  }
);

router.get(
  '/:id',
  [param('id').isMongoId()],
  async (req: AuthRequest, res: Response) => {
    try {
      const doc = await UserNutritionPlan.findById(req.params.id)
        .populate('userId', 'name email')
        .populate('nutritionPlanTemplateId')
        .lean();
      if (!doc) return res.status(404).json({ message: 'Assignment not found' });
      (doc as any).effectiveStatus = effectiveStatus(doc as any);
      res.json({ assignment: doc });
    } catch (e: unknown) {
      res.status(500).json({ message: (e as Error).message });
    }
  }
);

// PATCH /:id — update adjustments (daily targets per user)
router.patch(
  '/:id',
  [
    param('id').isMongoId(),
    body('adjustments').optional().isObject(),
    body('adjustments.dailyCalories').optional().isNumeric(),
    body('adjustments.proteinG').optional().isNumeric(),
    body('adjustments.carbsG').optional().isNumeric(),
    body('adjustments.fatG').optional().isNumeric(),
    body('adjustments.notes').optional().isString(),
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const err = validationResult(req);
      if (!err.isEmpty()) return res.status(400).json({ message: err.array()[0].msg });
      const doc = await UserNutritionPlan.findById(req.params.id);
      if (!doc) return res.status(404).json({ message: 'Assignment not found' });
      const adj = req.body.adjustments;
      if (adj != null) {
        const updates: Record<string, unknown> = {};
        if (adj.dailyCalories !== undefined) updates['adjustments.dailyCalories'] = adj.dailyCalories;
        if (adj.proteinG !== undefined) updates['adjustments.proteinG'] = adj.proteinG;
        if (adj.carbsG !== undefined) updates['adjustments.carbsG'] = adj.carbsG;
        if (adj.fatG !== undefined) updates['adjustments.fatG'] = adj.fatG;
        if (adj.notes !== undefined) updates['adjustments.notes'] = adj.notes;
        if (Object.keys(updates).length) await doc.updateOne({ $set: updates });
      }
      const out = await UserNutritionPlan.findById(doc._id)
        .populate('userId', 'name email')
        .populate('nutritionPlanTemplateId')
        .lean();
      (out as any).effectiveStatus = effectiveStatus(out as any);
      res.json({ assignment: out });
    } catch (e: unknown) {
      res.status(500).json({ message: (e as Error).message });
    }
  }
);

export default router;
