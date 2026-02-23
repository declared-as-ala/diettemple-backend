import { Router } from 'express';
import { body, param } from 'express-validator';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import Cart from '../models/Cart.model';
import Product from '../models/Product.model';
import { calculateCartTotals } from '../utils/delivery.utils';

const router = Router();

// All routes require authentication
router.use(authenticate);

// GET /cart - Get user's cart with calculated totals
router.get('/', async (req: AuthRequest, res) => {
  try {
    let cart = await Cart.findOne({ userId: req.user._id }).populate('items.productId');

    if (!cart) {
      cart = new Cart({ userId: req.user._id, items: [] });
      await cart.save();
    }

    // Calculate totals from backend (single source of truth)
    const totals = calculateCartTotals(cart.items);

    res.json({
      cart,
      totals: {
        subtotal: totals.subtotal,
        deliveryFee: totals.deliveryFee,
        total: totals.total,
      },
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// POST /cart - Add item to cart
router.post(
  '/',
  [
    body('productId').isMongoId().withMessage('Invalid product ID'),
    body('quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  ],
  async (req: AuthRequest, res) => {
    try {
      const { productId, quantity } = req.body;

      // Check if product exists and is in stock
      const product = await Product.findById(productId);
      if (!product) {
        return res.status(404).json({ message: 'Product not found' });
      }

      if (product.stock < quantity) {
        return res.status(400).json({ message: 'Insufficient stock' });
      }

      let cart = await Cart.findOne({ userId: req.user._id });

      if (!cart) {
        cart = new Cart({ userId: req.user._id, items: [] });
      }

      // Check if item already exists in cart
      const existingItemIndex = cart.items.findIndex(
        (item) => item.productId.toString() === productId
      );

      if (existingItemIndex >= 0) {
        // Update quantity
        cart.items[existingItemIndex].quantity += quantity;
        if (cart.items[existingItemIndex].quantity > product.stock) {
          return res.status(400).json({ message: 'Insufficient stock' });
        }
      } else {
        // Add new item
        cart.items.push({ productId, quantity });
      }

      await cart.save();
      await cart.populate('items.productId');

      // Calculate totals
      const totals = calculateCartTotals(cart.items);

      res.json({
        cart,
        totals: {
          subtotal: totals.subtotal,
          deliveryFee: totals.deliveryFee,
          total: totals.total,
        },
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }
);

// PUT /cart/item/:productId - Update item quantity
router.put(
  '/item/:productId',
  [
    param('productId').isMongoId().withMessage('Invalid product ID'),
    body('quantity').isInt({ min: 0 }).withMessage('Quantity must be 0 or greater'),
  ],
  async (req: AuthRequest, res) => {
    try {
      const { productId } = req.params;
      const { quantity } = req.body;

      const cart = await Cart.findOne({ userId: req.user._id });
      if (!cart) {
        return res.status(404).json({ message: 'Cart not found' });
      }

      if (quantity === 0) {
        // Remove item
        cart.items = cart.items.filter(
          (item) => item.productId.toString() !== productId
        );
      } else {
        // Check stock
        const product = await Product.findById(productId);
        if (!product) {
          return res.status(404).json({ message: 'Product not found' });
        }

        if (product.stock < quantity) {
          return res.status(400).json({ message: 'Insufficient stock' });
        }

        // Update quantity
        const item = cart.items.find((item) => item.productId.toString() === productId);
        if (item) {
          item.quantity = quantity;
        } else {
          return res.status(404).json({ message: 'Item not found in cart' });
        }
      }

      await cart.save();
      await cart.populate('items.productId');

      // Calculate totals
      const totals = calculateCartTotals(cart.items);

      res.json({
        cart,
        totals: {
          subtotal: totals.subtotal,
          deliveryFee: totals.deliveryFee,
          total: totals.total,
        },
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }
);

// DELETE /cart/item/:productId - Remove item from cart
router.delete(
  '/item/:productId',
  [param('productId').isMongoId().withMessage('Invalid product ID')],
  async (req: AuthRequest, res) => {
    try {
      const cart = await Cart.findOne({ userId: req.user._id });
      if (!cart) {
        return res.status(404).json({ message: 'Cart not found' });
      }

      cart.items = cart.items.filter(
        (item) => item.productId.toString() !== req.params.productId
      );

      await cart.save();
      await cart.populate('items.productId');

      // Calculate totals
      const totals = calculateCartTotals(cart.items);

      res.json({
        cart,
        totals: {
          subtotal: totals.subtotal,
          deliveryFee: totals.deliveryFee,
          total: totals.total,
        },
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }
);

// DELETE /cart - Clear cart
router.delete('/', async (req: AuthRequest, res) => {
  try {
    const cart = await Cart.findOne({ userId: req.user._id });
    if (!cart) {
      return res.status(404).json({ message: 'Cart not found' });
    }

    cart.items = [];
    await cart.save();

    res.json({ message: 'Cart cleared successfully', cart });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

export default router;

