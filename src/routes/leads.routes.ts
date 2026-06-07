import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import Lead from '../models/Lead.model';
import { sendNewLeadNotification } from '../services/email.service';

const router = Router();

// POST /api/leads — public: submit a rendez-vous request from website or mobile
router.post(
  '/',
  [
    body('name').trim().notEmpty().withMessage('name is required'),
    body('email').isEmail().normalizeEmail().withMessage('valid email is required'),
    body('phone').trim().notEmpty().withMessage('phone is required'),
    body('goal').optional().isString(),
    body('plan').optional().isString(),
    body('gender').optional().isIn(['homme', 'femme', '']),
    body('source').optional().isString(),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ errors: errors.array() });
    }
    try {
      const { name, email, phone, goal, plan, gender, source } = req.body;
      const leadSource = source || 'website';
      const lead = await Lead.create({ name, email, phone, goal, plan, gender, source: leadSource });

      // Fire-and-forget email to admin
      sendNewLeadNotification({ name, email, phone, goal, gender, source: leadSource }).catch(() => {});

      res.status(201).json({ success: true, lead: { _id: lead._id, name: lead.name } });
    } catch (error: any) {
      res.status(500).json({ error: 'error', message: error.message });
    }
  }
);

export default router;
