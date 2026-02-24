import { Router, Response } from 'express';
import { body, param, query } from 'express-validator';
import LevelTemplate from '../../models/LevelTemplate.model';
import { AuthRequest } from '../../middleware/auth.middleware';

const router = Router();
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

function countWeekSessions(week: { days?: Record<string, unknown[]> }): number {
  return DAY_KEYS.reduce((sum, d) => sum + (week.days?.[d]?.length ?? 0), 0);
}

function validateWeeks(weeks: unknown[]): { valid: boolean; message?: string } {
  if (!Array.isArray(weeks) || weeks.length !== 5) {
    return { valid: false, message: 'Exactly 5 weeks required' };
  }
  const seen = new Set<number>();
  for (let i = 0; i < weeks.length; i++) {
    const w = weeks[i] as Record<string, unknown>;
    const num = w?.weekNumber as number;
    if (num == null || num < 1 || num > 5) {
      return { valid: false, message: `Week ${i + 1}: weekNumber must be 1–5` };
    }
    if (seen.has(num)) {
      return { valid: false, message: `Duplicate weekNumber: ${num}` };
    }
    seen.add(num);
    const count = countWeekSessions(w as { days?: Record<string, unknown[]> });
    if (count < 4 || count > 7) {
      return { valid: false, message: `Week ${num}: sessions per week must be 4–7 (got ${count})` };
    }
  }
  return { valid: true };
}

// GET /level-templates
router.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('search').optional().isString(),
    query('active').optional().isIn(['true', 'false']),
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const page = parseInt((req.query.page as string) || '1');
      const limit = parseInt((req.query.limit as string) || '20');
      const skip = (page - 1) * limit;
      const filter: Record<string, unknown> = {};
      if (req.query.search) {
        filter.$or = [
          { name: { $regex: req.query.search, $options: 'i' } },
          { description: { $regex: req.query.search, $options: 'i' } },
        ];
      }
      if (req.query.active === 'true') filter.isActive = true;
      if (req.query.active === 'false') filter.isActive = false;

      const [levelTemplates, total] = await Promise.all([
        LevelTemplate.find(filter).sort({ name: 1 }).skip(skip).limit(limit).lean(),
        LevelTemplate.countDocuments(filter),
      ]);
      res.json({
        levelTemplates,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      });
    } catch (err: unknown) {
      res.status(500).json({ message: (err as Error).message });
    }
  }
);

// GET /level-templates/:id
router.get(
  '/:id',
  [param('id').isMongoId()],
  async (req: AuthRequest, res: Response) => {
    try {
      const levelTemplate = await LevelTemplate.findById(req.params.id).lean();
      if (!levelTemplate) {
        return res.status(404).json({ message: 'Level template not found' });
      }
      res.json({ levelTemplate });
    } catch (err: unknown) {
      res.status(500).json({ message: (err as Error).message });
    }
  }
);

// POST /level-templates
router.post(
  '/',
  [
    body('name').notEmpty().trim().withMessage('Name is required'),
    body('description').optional().isString(),
    body('imageUrl').optional().isString(),
    body('isActive').optional().isBoolean(),
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const plan = await LevelTemplate.create({
        name: req.body.name,
        description: req.body.description,
        imageUrl: req.body.imageUrl,
        isActive: req.body.isActive !== false,
      });
      res.status(201).json({ levelTemplate: plan.toObject() });
    } catch (err: unknown) {
      res.status(500).json({ message: (err as Error).message });
    }
  }
);

// PUT /level-templates/:id
router.put(
  '/:id',
  [param('id').isMongoId()],
  async (req: AuthRequest, res: Response) => {
    try {
      const plan = await LevelTemplate.findById(req.params.id);
      if (!plan) {
        return res.status(404).json({ message: 'Level template not found' });
      }
      if (req.body.name != null) plan.name = req.body.name;
      if (req.body.description != null) plan.description = req.body.description;
      if (req.body.imageUrl !== undefined) plan.imageUrl = req.body.imageUrl;
      if (req.body.isActive != null) plan.isActive = req.body.isActive;
      await plan.save();
      res.json({ levelTemplate: plan.toObject() });
    } catch (err: unknown) {
      res.status(500).json({ message: (err as Error).message });
    }
  }
);

// PUT /level-templates/:id/weeks
router.put(
  '/:id/weeks',
  [param('id').isMongoId(), body('weeks').isArray().withMessage('weeks must be an array')],
  async (req: AuthRequest, res: Response) => {
    try {
      const validation = validateWeeks(req.body.weeks);
      if (!validation.valid) {
        return res.status(400).json({ message: validation.message });
      }
      const plan = await LevelTemplate.findById(req.params.id);
      if (!plan) {
        return res.status(404).json({ message: 'Level template not found' });
      }
      const weeks = req.body.weeks.map((w: Record<string, unknown>) => ({
        weekNumber: w.weekNumber,
        days: {
          mon: (w.days as Record<string, unknown[]>)?.mon || [],
          tue: (w.days as Record<string, unknown[]>)?.tue || [],
          wed: (w.days as Record<string, unknown[]>)?.wed || [],
          thu: (w.days as Record<string, unknown[]>)?.thu || [],
          fri: (w.days as Record<string, unknown[]>)?.fri || [],
          sat: (w.days as Record<string, unknown[]>)?.sat || [],
          sun: (w.days as Record<string, unknown[]>)?.sun || [],
        },
      }));
      plan.weeks = weeks;
      await plan.save();
      res.json({ levelTemplate: plan.toObject() });
    } catch (err: unknown) {
      res.status(500).json({ message: (err as Error).message });
    }
  }
);

// DELETE /level-templates/:id
router.delete(
  '/:id',
  [param('id').isMongoId()],
  async (req: AuthRequest, res: Response) => {
    try {
      const plan = await LevelTemplate.findByIdAndDelete(req.params.id);
      if (!plan) {
        return res.status(404).json({ message: 'Level template not found' });
      }
      res.json({ message: 'Level template deleted' });
    } catch (err: unknown) {
      res.status(500).json({ message: (err as Error).message });
    }
  }
);

export default router;
