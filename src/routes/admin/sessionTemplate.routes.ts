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
    query('folderId').optional().isString(),
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
          { displayName: { $regex: req.query.search, $options: 'i' } },
          { internalName: { $regex: req.query.search, $options: 'i' } },
          { description: { $regex: req.query.search, $options: 'i' } },
        ];
      }
      if (req.query.difficulty) filter.difficulty = req.query.difficulty;
      if (req.query.folderId !== undefined) {
        if (req.query.folderId === 'unassigned' || req.query.folderId === 'null') {
          filter.folderId = { $in: [null, undefined] };
        } else {
          filter.folderId = req.query.folderId;
        }
      }

      const [sessionTemplates, total] = await Promise.all([
        SessionTemplate.find(filter)
          .populate('folderId', 'name')
          .populate('items.exerciseId', 'name muscleGroup difficulty equipment')
          .sort({ title: 1 })
          .skip(skip)
          .limit(limit)
          .lean(),
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
        .populate('folderId', 'name')
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
    body('title').optional().trim(),
    body('internalName').optional().trim(),
    body('displayName').optional().trim(),
    body('folderId').optional({ nullable: true }),
    body('description').optional().isString(),
    body('difficulty').optional().isIn(['beginner', 'intermediate', 'advanced']),
    body('durationMinutes').optional().isInt({ min: 0 }),
    body('items').optional().isArray(),
    body('tags').optional().isArray(),
    body('warmup').optional().isObject(),
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const title = req.body.title || req.body.displayName || req.body.internalName || 'Nouvelle séance';
      const doc = await SessionTemplate.create({
        title,
        internalName: req.body.internalName || title,
        displayName: req.body.displayName || title,
        folderId: req.body.folderId || null,
        description: req.body.description,
        difficulty: req.body.difficulty,
        durationMinutes: req.body.durationMinutes,
        items: req.body.items || [],
        tags: req.body.tags || [],
        warmup: req.body.warmup,
      });
      res.status(201).json({ sessionTemplate: doc.toObject() });
    } catch (err: unknown) {
      res.status(500).json({ message: (err as Error).message });
    }
  }
);

// POST /session-templates/:id/duplicate
// Creates an independent deep-copy with new unique _id, copy suffix, and preserves all exercise configs
router.post(
  '/:id/duplicate',
  [param('id').isMongoId()],
  async (req: AuthRequest, res: Response) => {
    try {
      const original = await SessionTemplate.findById(req.params.id).lean();
      if (!original) {
        return res.status(404).json({ message: 'Session template not found' });
      }

      const orig = original as any;
      const copySuffix = ' - Copie';
      const newInternalName = `${orig.internalName || orig.title || 'Séance'}${copySuffix}`;
      const newDisplayName = `${orig.displayName || orig.title || 'Séance'}${copySuffix}`;
      const newTitle = `${orig.title || 'Séance'}${copySuffix}`;

      // Deep clone items with fresh subdocument identities
      const clonedItems = (orig.items || []).map((item: any, idx: number) => ({
        exerciseId: item.exerciseId?._id || item.exerciseId,
        alternatives: (item.alternatives || []).map((alt: any) => alt?._id || alt),
        sets: item.sets,
        targetReps: item.targetReps,
        recommendedStartingWeightKg: item.recommendedStartingWeightKg,
        progressionRules: item.progressionRules || [],
        instruction: item.instruction,
        message: item.message,
        notes: item.notes,
        clientInstruction: item.clientInstruction,
        order: item.order ?? idx,
      }));

      const clonedWarmup = orig.warmup
        ? {
            title: orig.warmup.title,
            notes: orig.warmup.notes,
            items: (orig.warmup.items || []).map((w: any, idx: number) => ({
              title: w.title,
              durationSeconds: w.durationSeconds,
              reps: w.reps,
              notes: w.notes,
              order: w.order ?? idx,
            })),
          }
        : undefined;

      const duplicatedDoc = await SessionTemplate.create({
        title: newTitle,
        internalName: newInternalName,
        displayName: newDisplayName,
        folderId: orig.folderId || null,
        description: orig.description,
        difficulty: orig.difficulty,
        durationMinutes: orig.durationMinutes,
        tags: orig.tags || [],
        items: clonedItems,
        warmup: clonedWarmup,
      });

      res.status(201).json({ sessionTemplate: duplicatedDoc.toObject() });
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
      if (req.body.internalName != null) doc.internalName = req.body.internalName;
      if (req.body.displayName != null) {
        doc.displayName = req.body.displayName;
        if (!req.body.title) doc.title = req.body.displayName;
      }
      if (req.body.folderId !== undefined) doc.folderId = req.body.folderId || null;
      if (req.body.description != null) doc.description = req.body.description;
      if (req.body.difficulty != null) doc.difficulty = req.body.difficulty;
      if (req.body.durationMinutes != null) doc.durationMinutes = req.body.durationMinutes;
      if (Array.isArray(req.body.items)) doc.items = req.body.items;
      if (Array.isArray(req.body.tags)) doc.tags = req.body.tags;
      if (req.body.warmup !== undefined) (doc as any).warmup = req.body.warmup;
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
