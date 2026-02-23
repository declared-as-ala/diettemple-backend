import { Router } from 'express';
import { body } from 'express-validator';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import PromoCode from '../models/PromoCode.model';

const router = Router();

// POST /promo/validate - Validate promo code
router.post(
  '/validate',
  authenticate,
  [
    body('code').notEmpty().withMessage('Code promo requis'),
    body('subtotal').isFloat({ min: 0 }).withMessage('Sous-total invalide'),
  ],
  async (req: AuthRequest, res) => {
    try {
      const { code, subtotal } = req.body;

      const promoCode = await PromoCode.findOne({
        code: code.toUpperCase().trim(),
        isActive: true,
      });

      if (!promoCode) {
        return res.status(400).json({
          valid: false,
          message: 'ERREUR! Le code promo est incorrect',
        });
      }

      // Check if expired
      if (promoCode.expiresAt < new Date()) {
        return res.status(400).json({
          valid: false,
          message: 'ERREUR! Le code promo a expiré',
        });
      }

      // Check usage limit
      if (promoCode.usageLimit && promoCode.usedCount >= promoCode.usageLimit) {
        return res.status(400).json({
          valid: false,
          message: 'ERREUR! Le code promo a atteint sa limite d\'utilisation',
        });
      }

      // Check minimum purchase
      if (promoCode.minPurchase && subtotal < promoCode.minPurchase) {
        return res.status(400).json({
          valid: false,
          message: `ERREUR! Montant minimum requis: ${promoCode.minPurchase} DT`,
        });
      }

      // Calculate discount
      let discount = 0;
      if (promoCode.type === 'percentage') {
        discount = (subtotal * promoCode.value) / 100;
        if (promoCode.maxDiscount) {
          discount = Math.min(discount, promoCode.maxDiscount);
        }
      } else {
        discount = promoCode.value;
      }

      // Ensure discount doesn't exceed subtotal
      discount = Math.min(discount, subtotal);

      res.json({
        valid: true,
        code: promoCode.code,
        type: promoCode.type,
        value: promoCode.value,
        discount: Math.round(discount * 100) / 100,
        message: 'Code promo appliqué avec succès',
      });
    } catch (error: any) {
      res.status(500).json({
        valid: false,
        message: error.message || 'Erreur lors de la validation du code promo',
      });
    }
  }
);

export default router;


