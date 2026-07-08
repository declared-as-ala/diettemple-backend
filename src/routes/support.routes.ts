import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import Support from '../models/Support.model';

const router = Router();

// POST /api/support — public: submit a support ticket
router.post(
  '/',
  [
    body('name').trim().notEmpty().withMessage('name is required'),
    body('email').isEmail().normalizeEmail().withMessage('valid email is required'),
    body('subject').trim().notEmpty().withMessage('subject is required'),
    body('message').trim().notEmpty().withMessage('message is required'),
    body('category').optional().isIn(['billing', 'technical', 'general', 'feedback']),
    body('priority').optional().isIn(['low', 'medium', 'high']),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ errors: errors.array() });
    }

    try {
      const { name, email, subject, message, category = 'general', priority = 'medium' } = req.body;
      const ticket = await Support.create({
        name,
        email,
        subject,
        message,
        category,
        priority,
      });

      res.status(201).json({
        success: true,
        ticket: {
          _id: ticket._id,
          subject: ticket.subject,
          status: ticket.status,
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: 'error', message: error.message });
    }
  }
);

export default router;
