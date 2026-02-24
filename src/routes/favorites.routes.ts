import { Router, Response } from 'express';
import { body, param } from 'express-validator';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import Favorite from '../models/Favorite.model';
import Product from '../models/Product.model';

const router = Router();

// All routes require authentication
router.use(authenticate);

// GET /favorites - Get user's favorites
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const favorites = await Favorite.find({ userId: req.user._id })
      .populate('productId')
      .sort({ createdAt: -1 })
      .lean();

    res.json({ favorites });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// POST /favorites - Add product to favorites
router.post(
  '/',
  [body('productId').isMongoId().withMessage('Invalid product ID')],
  async (req: AuthRequest, res: Response) => {
    try {
      const { productId } = req.body;

      // Check if product exists
      const product = await Product.findById(productId);
      if (!product) {
        return res.status(404).json({ message: 'Product not found' });
      }

      // Check if already favorited
      const existing = await Favorite.findOne({
        userId: req.user._id,
        productId,
      });

      if (existing) {
        return res.status(400).json({ message: 'Product already in favorites' });
      }

      const favorite = new Favorite({
        userId: req.user._id,
        productId,
      });

      await favorite.save();
      await favorite.populate('productId');

      res.status(201).json({ favorite });
    } catch (error: any) {
      if (error.code === 11000) {
        return res.status(400).json({ message: 'Product already in favorites' });
      }
      res.status(500).json({ message: error.message });
    }
  }
);

// DELETE /favorites/:id - Remove product from favorites
router.delete(
  '/:id',
  [param('id').isMongoId().withMessage('Invalid favorite ID')],
  async (req: AuthRequest, res: Response) => {
    try {
      const favorite = await Favorite.findOneAndDelete({
        _id: req.params.id,
        userId: req.user._id,
      });

      if (!favorite) {
        return res.status(404).json({ message: 'Favorite not found' });
      }

      res.json({ message: 'Favorite removed successfully' });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }
);

// DELETE /favorites/product/:productId - Remove by product ID
router.delete(
  '/product/:productId',
  [param('productId').isMongoId().withMessage('Invalid product ID')],
  async (req: AuthRequest, res: Response) => {
    try {
      const favorite = await Favorite.findOneAndDelete({
        productId: req.params.productId,
        userId: req.user._id,
      });

      if (!favorite) {
        return res.status(404).json({ message: 'Favorite not found' });
      }

      res.json({ message: 'Favorite removed successfully' });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }
);

// GET /favorites/check/:productId - Check if product is favorited
router.get(
  '/check/:productId',
  [param('productId').isMongoId().withMessage('Invalid product ID')],
  async (req: AuthRequest, res: Response) => {
    try {
      const favorite = await Favorite.findOne({
        productId: req.params.productId,
        userId: req.user._id,
      });

      res.json({ isFavorited: !!favorite });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }
);

export default router;


