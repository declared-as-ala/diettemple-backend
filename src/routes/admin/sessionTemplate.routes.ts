import { Router, Response } from 'express';
import { body, param, query } from 'express-validator';
import SessionTemplate from '../../models/SessionTemplate.model';
import { AuthRequest } from '../../middleware/auth.middleware';

const router = Router();

// GET /session-templates
router.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('search').optional().isString(),
    query('difficulty').optional().isIn(['beginner', 'intermediate', 'advanced']),
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const page = parseInt((req.query.page as string) || '1');
      const limit = parseInt((req.query.limit as string) || '20');
      const skip = (page - 1) * limit;
      const filter: Record<string, unknown> = {};
      if (req.query.search) {
        filter.$or = [
          { title: { $regex: req.query.search, $options: 'i' } },
          { description: { $regex: req.query.search, $options: 'i' } },
        ];
      }
      if (req.query.difficulty) filter.difficulty = req.query.difficulty;

      const [sessionTemplates, total] = await Promise.all([
        SessionTemplate.find(filter).sort({ title: 1 }).skip(skip).limit(limit).lean(),
        SessionTemplate.countDocuments(filter),
      ]);
      res.json({
        sessionTemplates,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      });
    } catch (err: unknown) {
      res.status(500).json({ message: (err as Error).message });
    }
  }
);

// GET /session-templates/:id
router.get(
  '/:id',
  [param('id').isMongoId()],
  async (req: AuthRequest, res: Response) => {
    try {
      const sessionTemplate = await SessionTemplate.findById(req.params.id)
        .populate('items.exerciseId', 'name muscleGroup difficulty equipment')
        .lean();
      if (!sessionTemplate) {
        return res.status(404).json({ message: 'Session template not found' });
      }
      res.json({ sessionTemplate });
    } catch (err: unknown) {
      res.status(500).json({ message: (err as Error).message });
    }
  }
);

// POST /session-templates
router.post(
  '/',
  [
    body('title').notEmpty().trim().withMessage('Title is required'),
    body('description').optional().isString(),
    body('difficulty').optional().isIn(['beginner', 'intermediate', 'advanced']),
    body('durationMinutes').optional().isInt({ min: 0 }),
    body('items').optional().isArray(),
    body('tags').optional().isArray(),
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const doc = await SessionTemplate.create({
        title: req.body.title,
        description: req.body.description,
        difficulty: req.body.difficulty,
        durationMinutes: req.body.durationMinutes,
        items: req.body.items || [],
        tags: req.body.tags || [],
      });
      res.status(201).json({ sessionTemplate: doc.toObject() });
    } catch (err: unknown) {
      res.status(500).json({ message: (err as Error).message });
    }
  }
);

// PUT /session-templates/:id
router.put(
  '/:id',
  [param('id').isMongoId()],
  async (req: AuthRequest, res: Response) => {
    try {
      const doc = await SessionTemplate.findById(req.params.id);
      if (!doc) {
        return res.status(404).json({ message: 'Session template not found' });
      }
      if (req.body.title != null) doc.title = req.body.title;
      if (req.body.description != null) doc.description = req.body.description;
      if (req.body.difficulty != null) doc.difficulty = req.body.difficulty;
      if (req.body.durationMinutes != null) doc.durationMinutes = req.body.durationMinutes;
      if (Array.isArray(req.body.items)) doc.items = req.body.items;
      if (Array.isArray(req.body.tags)) doc.tags = req.body.tags;
      await doc.save();
      res.json({ sessionTemplate: doc.toObject() });
    } catch (err: unknown) {
      res.status(500).json({ message: (err as Error).message });
    }
  }
);

// DELETE /session-templates/:id
router.delete(
  '/:id',
  [param('id').isMongoId()],
  async (req: AuthRequest, res: Response) => {
    try {
      const doc = await SessionTemplate.findByIdAndDelete(req.params.id);
      if (!doc) {
        return res.status(404).json({ message: 'Session template not found' });
      }
      res.json({ message: 'Session template deleted' });
    } catch (err: unknown) {
      res.status(500).json({ message: (err as Error).message });
    }
  }
);

export default router;
