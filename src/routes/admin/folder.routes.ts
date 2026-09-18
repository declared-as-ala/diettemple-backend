import { Router, Response } from 'express';
import { body, param, query } from 'express-validator';
import Folder from '../../models/Folder.model';
import LevelTemplate from '../../models/LevelTemplate.model';
import SessionTemplate from '../../models/SessionTemplate.model';
import { AuthRequest } from '../../middleware/auth.middleware';

const router = Router();

// GET /api/admin/folders
router.get(
  '/',
  [query('type').optional().isIn(['plan', 'session'])],
  async (req: AuthRequest, res: Response) => {
    try {
      const filter: Record<string, unknown> = {};
      if (req.query.type) {
        filter.type = req.query.type;
      }
      const folders = await Folder.find(filter).sort({ order: 1, name: 1 }).lean();
      res.json({ folders });
    } catch (err: unknown) {
      res.status(500).json({ message: (err as Error).message });
    }
  }
);

// POST /api/admin/folders
router.post(
  '/',
  [
    body('name').notEmpty().trim().withMessage('Folder name is required'),
    body('type').isIn(['plan', 'session']).withMessage('Type must be plan or session'),
    body('description').optional().isString().trim(),
    body('order').optional().isInt(),
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const folder = await Folder.create({
        name: req.body.name,
        type: req.body.type,
        description: req.body.description || '',
        order: req.body.order ?? 0,
      });
      res.status(201).json({ folder });
    } catch (err: unknown) {
      res.status(500).json({ message: (err as Error).message });
    }
  }
);

// PUT /api/admin/folders/:id
router.put(
  '/:id',
  [
    param('id').isMongoId(),
    body('name').optional().notEmpty().trim(),
    body('description').optional().isString().trim(),
    body('order').optional().isInt(),
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const folder = await Folder.findById(req.params.id);
      if (!folder) {
        return res.status(404).json({ message: 'Folder not found' });
      }

      if (req.body.name != null) folder.name = req.body.name;
      if (req.body.description != null) folder.description = req.body.description;
      if (req.body.order != null) folder.order = req.body.order;

      await folder.save();
      res.json({ folder });
    } catch (err: unknown) {
      res.status(500).json({ message: (err as Error).message });
    }
  }
);

// DELETE /api/admin/folders/:id
// Safe deletion: unlinks templates from this folder without deleting the templates
router.delete(
  '/:id',
  [param('id').isMongoId()],
  async (req: AuthRequest, res: Response) => {
    try {
      const folder = await Folder.findById(req.params.id);
      if (!folder) {
        return res.status(404).json({ message: 'Folder not found' });
      }

      const folderId = folder._id;

      if (folder.type === 'plan') {
        await LevelTemplate.updateMany({ folderId }, { $unset: { folderId: 1 } });
      } else if (folder.type === 'session') {
        await SessionTemplate.updateMany({ folderId }, { $unset: { folderId: 1 } });
      }

      await Folder.findByIdAndDelete(folderId);
      res.json({ message: 'Folder deleted safely. Contained items were unlinked and preserved.' });
    } catch (err: unknown) {
      res.status(500).json({ message: (err as Error).message });
    }
  }
);

export default router;
