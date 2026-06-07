import { Router, Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import jwt from 'jsonwebtoken';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import Order from '../models/Order.model';
import Cart from '../models/Cart.model';
import Product from '../models/Product.model';
import Subscription from '../models/Subscription.model';
import PromoCode from '../models/PromoCode.model';
import { calculateDeliveryFee } from '../utils/delivery.utils';

/** Returns true if a userId has an ACTIVE subscription that hasn't expired yet */
async function isUhSubscribed(userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const now = new Date();
  const sub = await Subscription.findOne({
    userId,
    status: 'ACTIVE',
    endAt: { $gte: now },
  }).lean();
  return !!sub;
}

async function calculatePromoDiscount(
  promoCodeValue: unknown,
  subtotal: number
): Promise<{ code?: string; discount: number; promoId?: string }> {
  if (typeof promoCodeValue !== 'string' || !promoCodeValue.trim()) {
    return { discount: 0 };
  }

  const promo = await PromoCode.findOne({
    code: promoCodeValue.toUpperCase().trim(),
    isActive: true,
    expiresAt: { $gte: new Date() },
  });

  if (!promo) throw new Error('Code promo invalide ou expire');
  if (promo.usageLimit && promo.usedCount >= promo.usageLimit) {
    throw new Error('Ce code promo a atteint sa limite d’utilisation');
  }
  if (promo.minPurchase && subtotal < promo.minPurchase) {
    throw new Error(`Montant minimum requis: ${promo.minPurchase} DT`);
  }

  let discount =
    promo.type === 'percentage'
      ? (subtotal * promo.value) / 100
      : promo.value;
  if (promo.maxDiscount) discount = Math.min(discount, promo.maxDiscount);

  return {
    code: promo.code,
    discount: Math.round(Math.min(discount, subtotal) * 100) / 100,
    promoId: String(promo._id),
  };
}

const router = Router();

// POST /orders/create - Create new order (for checkout) - PUBLIC (guests allowed)
router.post(
  '/create',
  [
    body('items').isArray().withMessage('Items requis'),
    body('items.*.productId').isMongoId().withMessage('ID produit invalide'),
    body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantité invalide'),
    body('deliveryAddress').isObject().withMessage('Adresse de livraison requise'),
    body('deliveryAddress.fullName').notEmpty().withMessage('Nom et prénom requis'),
    body('deliveryAddress.street').notEmpty().withMessage('Adresse requise'),
    body('deliveryAddress.city').notEmpty().withMessage('Ville requise'),
    body('deliveryAddress.delegation').notEmpty().withMessage('Délégation requise'),
    body('deliveryAddress.phone').notEmpty().withMessage('Téléphone requis'),
    body('deliveryAddress.email').isEmail().withMessage('Email invalide'),
    body('promoCode').optional().isString(),
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: errors.array()[0]?.msg || 'Commande invalide' });
      }

      const { items: requestedItems, deliveryAddress, promoCode } = req.body;

      // Check if user is authenticated (optional)
      let userId = null;
      if (req.headers.authorization && process.env.JWT_SECRET) {
        try {
          const token = req.headers.authorization.replace('Bearer ', '');
          const decoded = jwt.verify(token, process.env.JWT_SECRET) as { userId: string };
          userId = decoded.userId;
        } catch (error) {
          // Token invalid or missing - continue as guest
          userId = null;
        }
      }

      // Validate items and stock
      if (!requestedItems || !Array.isArray(requestedItems) || requestedItems.length === 0) {
        return res.status(400).json({ message: 'Panier vide' });
      }

      // Determine if the user is UH subscribed (for server-enforced UH pricing)
      const uhSubscribed = await isUhSubscribed(userId);

      let calculatedSubtotal = 0;
      const orderItems = [];

      for (const item of requestedItems) {
        // Validate product exists and check stock
        const product = await Product.findById(item.productId);
        if (!product) {
          return res.status(404).json({ message: `Produit introuvable: ${item.productId}` });
        }

        if (product.stock < item.quantity) {
          return res.status(400).json({
            message: `Stock insuffisant pour ${product.name}. Disponible: ${product.stock}, Demandé: ${item.quantity}`
          });
        }

        // Server-side price: UH price for UH subscribers, else regular discount price
        let itemPrice: number;
        if (uhSubscribed && product.uhPrice != null && product.uhPrice > 0) {
          itemPrice = product.uhPrice;
        } else {
          itemPrice = product.discount
            ? product.price * (1 - product.discount / 100)
            : product.price;
        }

        calculatedSubtotal += itemPrice * item.quantity;
        orderItems.push({
          productId: product._id,
          name: product.name,
          price: Math.round(itemPrice * 100) / 100,
          quantity: item.quantity,
          image: product.images?.[0],
        });
      }

      calculatedSubtotal = Math.round(calculatedSubtotal * 100) / 100;

      const finalDeliveryFee = calculateDeliveryFee(calculatedSubtotal);
      let promoResult;
      try {
        promoResult = await calculatePromoDiscount(promoCode, calculatedSubtotal);
      } catch (error) {
        return res.status(400).json({
          message: error instanceof Error ? error.message : 'Code promo invalide',
        });
      }
      const finalDiscount = promoResult.discount;
      const totalPrice = calculatedSubtotal - finalDiscount + finalDeliveryFee;

      const reservedItems: Array<{ productId: unknown; quantity: number }> = [];
      for (const item of orderItems) {
        const reservation = await Product.updateOne(
          { _id: item.productId, stock: { $gte: item.quantity } },
          { $inc: { stock: -item.quantity } }
        );
        if (reservation.modifiedCount !== 1) {
          await Promise.all(
            reservedItems.map((reserved) =>
              Product.updateOne(
                { _id: reserved.productId },
                { $inc: { stock: reserved.quantity } }
              )
            )
          );
          return res.status(409).json({
            message: `Le stock de ${item.name} vient de changer. Veuillez réessayer.`,
          });
        }
        reservedItems.push({ productId: item.productId, quantity: item.quantity });
      }

      const order = new Order({
        userId: userId || undefined,
        items: orderItems,
        subtotal: calculatedSubtotal,
        discount: finalDiscount,
        deliveryFee: finalDeliveryFee,
        totalPrice: Math.max(0, totalPrice),
        status: 'confirmed',
        deliveryAddress,
        paymentMethod: null,
        paymentStatus: 'PENDING',
        promoCode: promoResult.code,
      });

      try {
        await order.save();
      } catch (error) {
        await Promise.all(
          reservedItems.map((reserved) =>
            Product.updateOne(
              { _id: reserved.productId },
              { $inc: { stock: reserved.quantity } }
            )
          )
        );
        throw error;
      }
      if (promoResult.promoId) {
        await PromoCode.updateOne({ _id: promoResult.promoId }, { $inc: { usedCount: 1 } });
      }

      // If user is authenticated, clear their cart
      if (userId) {
        try {
          const cart = await Cart.findOne({ userId });
          if (cart) {
            cart.items = [];
            await cart.save();
          }
        } catch (error) {
          // Cart clearing is not critical - continue
          console.log('Could not clear cart:', error);
        }
      }

      res.status(201).json({ order });

      void import('../services/email.service')
        .then(({ sendOrderEmails }) => sendOrderEmails(order))
        .catch((error) => {
          console.error('Error sending order emails:', error);
        });
    } catch (error: any) {
      console.error('Order creation error:', error);
      res.status(500).json({ message: error.message || 'Erreur lors de la création de la commande' });
    }
  }
);

// GET /orders/:id - Authenticated owner only
router.get(
  '/:id',
  authenticate,
  [param('id').isMongoId().withMessage('Invalid order ID')],
  async (req: AuthRequest, res: Response) => {
    try {
      const orderId = req.params.id;
      const order = await Order.findOne({
        _id: orderId,
        userId: req.user._id,
      }).lean();

      if (!order) {
        return res.status(404).json({ message: 'Order not found' });
      }

      res.json({ order });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }
);

// GET /orders/:id/pdf - Authenticated owner only
router.get(
  '/:id/pdf',
  authenticate,
  [param('id').isMongoId().withMessage('Invalid order ID')],
  async (req: AuthRequest, res: Response) => {
    try {
      const orderId = req.params.id;
      const order = await Order.findOne({
        _id: orderId,
        userId: req.user._id,
      });

      if (!order) {
        return res.status(404).json({ message: 'Order not found' });
      }

      // Generate PDF
      const { generateOrderPDF } = await import('../utils/pdfGenerator');
      const pdfBuffer = await generateOrderPDF(order);

      // Set response headers for PDF
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=order_${order.reference}.pdf`);
      res.setHeader('Content-Length', pdfBuffer.length);

      // Send PDF
      res.send(pdfBuffer);
    } catch (error: any) {
      console.error('PDF Generation Error:', error);
      res.status(500).json({ message: error.message || 'Erreur lors de la génération du PDF' });
    }
  }
);

// All other routes require authentication
router.use(authenticate);

// POST /orders - Create new order from cart (legacy route)
router.post(
  '/',
  [
    body('deliveryAddress').optional().isObject(),
    body('paymentMethod').optional().isString(),
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const { deliveryAddress, paymentMethod } = req.body;

      // Get user's cart
      const cart = await Cart.findOne({ userId: req.user._id }).populate('items.productId');
      if (!cart || cart.items.length === 0) {
        return res.status(400).json({ message: 'Cart is empty' });
      }

      // Validate stock and build order items
      const orderItems = [];
      let calculatedSubtotal = 0;

      for (const cartItem of cart.items) {
        const product = cartItem.productId as any;
        
        if (!product) {
          return res.status(404).json({ message: `Product not found for item ${cartItem.productId}` });
        }

        if (product.stock < cartItem.quantity) {
          return res.status(400).json({ 
            message: `Insufficient stock for ${product.name}. Available: ${product.stock}, Requested: ${cartItem.quantity}` 
          });
        }

        const itemPrice = product.discount 
          ? product.price * (1 - product.discount / 100)
          : product.price;

        orderItems.push({
          productId: product._id,
          name: product.name,
          price: itemPrice,
          quantity: cartItem.quantity,
          image: product.images?.[0],
        });

        calculatedSubtotal += itemPrice * cartItem.quantity;
      }

      // Calculate delivery fee from backend (single source of truth)
      const deliveryFee = calculateDeliveryFee(calculatedSubtotal);
      const totalPrice = calculatedSubtotal + deliveryFee;

      // Create order
      const order = new Order({
        userId: req.user._id,
        items: orderItems,
        subtotal: calculatedSubtotal,
        discount: 0,
        deliveryFee,
        totalPrice,
        status: 'pending',
        deliveryAddress,
        paymentMethod: paymentMethod || null,
      });

      await order.save();

      // Clear cart
      cart.items = [];
      await cart.save();

      res.status(201).json({ order });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }
);

const ORDERS_QUERY_TIMEOUT_MS = 10_000;
const MAX_ORDERS_LIST = 100;

// GET /orders - Get user's orders (bounded, with timeout)
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const limit = Math.min(parseInt((req.query.limit as string) || '50', 10) || 50, MAX_ORDERS_LIST);
    const orders = await Order.find({ userId: req.user._id })
      .maxTimeMS(ORDERS_QUERY_TIMEOUT_MS)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    res.json({ orders });
  } catch (error: any) {
    res.status(500).json({ error: 'error', message: error.message });
  }
});

export default router;
