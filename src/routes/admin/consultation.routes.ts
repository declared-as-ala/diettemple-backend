import { Router, Response } from 'express';
import { body, param } from 'express-validator';
import mongoose from 'mongoose';
import Consultation from '../../models/Consultation.model';
import User from '../../models/User.model';
import { AuthRequest } from '../../middleware/auth.middleware';

const router = Router({ mergeParams: true });

// GET /api/admin/clients/:clientId/consultations
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { clientId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(clientId)) {
      return res.status(400).json({ message: 'Invalid clientId' });
    }

    const consultations = await Consultation.find({ userId: clientId })
      .sort({ date: -1, createdAt: -1 })
      .populate('createdByStaffId', 'name firstName lastName')
      .lean();

    res.json({ consultations });
  } catch (err: unknown) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// POST /api/admin/clients/:clientId/consultations
router.post(
  '/',
  [
    body('date').optional().isISO8601().toDate(),
    body('weight').isFloat({ min: 0 }).withMessage('Weight must be a positive number'),
    body('muscleMassPercentage')
      .isFloat({ min: 0, max: 100 })
      .withMessage('Muscle mass must be between 0 and 100%'),
    body('bodyFatPercentage')
      .isFloat({ min: 0, max: 100 })
      .withMessage('Body fat must be between 0 and 100%'),
    body('notes').optional().isString().trim(),
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const { clientId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(clientId)) {
        return res.status(400).json({ message: 'Invalid clientId' });
      }

      const client = await User.findById(clientId);
      if (!client) {
        return res.status(404).json({ message: 'Client not found' });
      }

      const date = req.body.date ? new Date(req.body.date) : new Date();
      const weight = Number(req.body.weight);
      const muscleMassPercentage = Number(req.body.muscleMassPercentage);
      const bodyFatPercentage = Number(req.body.bodyFatPercentage);
      const notes = req.body.notes || '';

      const consultation = await Consultation.create({
        userId: client._id,
        date,
        weight,
        muscleMassPercentage,
        bodyFatPercentage,
        notes,
        createdByStaffId: req.user?._id,
      });

      // Also update the client's current baseline measurements to the latest consultation values
      client.poids = String(weight);
      client.bodyComposition = {
        muscleMassPercentage,
        bodyFatPercentage,
      };
      await client.save();

      res.status(201).json({ consultation });
    } catch (err: unknown) {
      res.status(500).json({ message: (err as Error).message });
    }
  }
);

// DELETE /api/admin/clients/:clientId/consultations/:id
router.delete(
  '/:id',
  [param('id').isMongoId()],
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const consultation = await Consultation.findByIdAndDelete(id);
      if (!consultation) {
        return res.status(404).json({ message: 'Consultation not found' });
      }

      res.json({ message: 'Consultation deleted successfully' });
    } catch (err: unknown) {
      res.status(500).json({ message: (err as Error).message });
    }
  }
);

export default router;
