import { Router } from 'express';
import { body, param } from 'express-validator';
import jwt from 'jsonwebtoken';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import Order from '../models/Order.model';
import Cart from '../models/Cart.model';
import Product from '../models/Product.model';
import { generateOrderReference } from '../utils/order.utils';
import { calculateDeliveryFee, calculateCartTotals } from '../utils/delivery.utils';

const router = Router();

// POST /orders/create - Create new order (for checkout) - PUBLIC (guests allowed)
router.post(
  '/create',
  [
    body('items').isArray().withMessage('Items requis'),
    body('items.*.productId').isMongoId().withMessage('ID produit invalide'),
    body('items.*.name').notEmpty().withMessage('Nom produit requis'),
    body('items.*.price').isFloat({ min: 0 }).withMessage('Prix invalide'),
    body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantité invalide'),
    body('deliveryAddress').isObject().withMessage('Adresse de livraison requise'),
    body('deliveryAddress.fullName').notEmpty().withMessage('Nom et prénom requis'),
    body('deliveryAddress.street').notEmpty().withMessage('Adresse requise'),
    body('deliveryAddress.city').notEmpty().withMessage('Ville requise'),
    body('deliveryAddress.delegation').notEmpty().withMessage('Délégation requise'),
    body('deliveryAddress.phone').notEmpty().withMessage('Téléphone requis'),
    body('deliveryAddress.email').isEmail().withMessage('Email invalide'),
    body('subtotal').isFloat({ min: 0 }).withMessage('Sous-total invalide'),
    body('discount').optional().isFloat({ min: 0 }),
    body('promoCode').optional().isString(),
    body('paymentMethod').isIn(['CASH_ON_DELIVERY', 'CLICKTOPAY']).withMessage('Méthode de paiement requise'),
  ],
  async (req: any, res) => {
    try {
      const { items: orderItems, deliveryAddress, promoCode, subtotal, discount = 0, paymentMethod } = req.body;

      // Debug: Log received data
      console.log('Order creation request:', {
        hasItems: !!orderItems,
        itemsLength: orderItems?.length,
        itemsType: typeof orderItems,
        isArray: Array.isArray(orderItems),
        firstItem: orderItems?.[0],
        hasDeliveryAddress: !!deliveryAddress,
        paymentMethod,
        bodyKeys: Object.keys(req.body),
      });

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
      if (!orderItems || !Array.isArray(orderItems) || orderItems.length === 0) {
        console.error('Order creation failed: Empty or invalid items array', { orderItems });
        return res.status(400).json({ message: 'Panier vide' });
      }

      let calculatedSubtotal = 0;

      for (const item of orderItems) {
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

        // Use provided price or calculate from product
        const itemPrice = item.price || (product.discount 
          ? product.price * (1 - product.discount / 100)
          : product.price);

        calculatedSubtotal += itemPrice * item.quantity;
      }

      // Verify subtotal matches (allow small rounding differences)
      if (Math.abs(calculatedSubtotal - subtotal) > 1) {
        return res.status(400).json({ message: 'Le sous-total ne correspond pas aux articles' });
      }

      // Calculate delivery fee from backend (single source of truth)
      const finalDeliveryFee = calculateDeliveryFee(calculatedSubtotal);
      
      // Calculate total
      const finalDiscount = discount || 0;
      const totalPrice = calculatedSubtotal - finalDiscount + finalDeliveryFee;

      // Determine order status and payment status based on payment method
      let orderStatus = 'pending';
      let paymentStatus = 'PENDING';
      
      if (paymentMethod === 'CASH_ON_DELIVERY') {
        // COD: Order is confirmed, payment is pending (will be validated manually on delivery)
        orderStatus = 'confirmed';
        paymentStatus = 'PENDING';
      } else if (paymentMethod === 'CLICKTOPAY') {
        // ClickToPay: Order is pending until payment is confirmed via webhook
        orderStatus = 'pending';
        paymentStatus = 'PENDING';
      }

      // Create order with payment method
      // Reference will be auto-generated by pre-save hook
      const order = new Order({
        userId: userId || undefined, // Optional - can be null for guests
        items: orderItems,
        subtotal: calculatedSubtotal,
        discount: finalDiscount,
        deliveryFee: finalDeliveryFee,
        totalPrice: Math.max(0, totalPrice),
        status: orderStatus,
        deliveryAddress,
        paymentMethod: paymentMethod || null,
        paymentStatus: paymentStatus,
        promoCode: promoCode || undefined,
      });

      await order.save();

      // Send order confirmation emails (client and admin)
      try {
        const { sendOrderEmails } = await import('../services/email.service');
        await sendOrderEmails(order);
      } catch (error) {
        console.error('Error sending order emails:', error);
        // Don't fail order creation if email fails
      }

      // If user is authenticated, clear their cart
      if (userId && paymentMethod === 'CASH_ON_DELIVERY') {
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

      res.status(201).json({ 
        order,
        paymentUrl: null, // Will be generated by payment endpoint
      });
    } catch (error: any) {
      console.error('Order creation error:', error);
      res.status(500).json({ message: error.message || 'Erreur lors de la création de la commande' });
    }
  }
);

// GET /orders/:id - Get single order (PUBLIC - guests can view orders by ID)
router.get(
  '/:id',
  [param('id').isMongoId().withMessage('Invalid order ID')],
  async (req: any, res) => {
    try {
      const orderId = req.params.id;
      
      // Try to get userId from token if present (optional)
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

      // Find order by ID
      // If user is authenticated, optionally filter by userId for security
      // If guest, allow viewing any order by ID (they created it)
      const order = await Order.findOne({
        _id: orderId,
        ...(userId ? { userId } : {}), // Only filter by userId if authenticated
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

// GET /orders/:id/pdf - Generate PDF invoice (PUBLIC - guests can download their order PDFs)
router.get(
  '/:id/pdf',
  [param('id').isMongoId().withMessage('Invalid order ID')],
  async (req: any, res) => {
    try {
      const orderId = req.params.id;
      
      // Try to get userId from token if present (optional)
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

      // Find order by ID
      // If user is authenticated, optionally filter by userId for security
      // If guest, allow viewing any order by ID (they created it)
      const order = await Order.findOne({
        _id: orderId,
        ...(userId ? { userId } : {}), // Only filter by userId if authenticated
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
  async (req: AuthRequest, res) => {
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

// GET /orders - Get user's orders
router.get('/', async (req: AuthRequest, res) => {
  try {
    const orders = await Order.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .lean();

    res.json({ orders });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
