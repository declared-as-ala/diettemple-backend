import { Router } from 'express';
import { query, param } from 'express-validator';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import Product from '../models/Product.model';
import Favorite from '../models/Favorite.model';

const router = Router();

// GET /products - Get all products with filters and pagination
router.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('category').optional().isString(),
    query('search').optional().isString(),
    query('sort').optional().isIn(['price-asc', 'price-desc', 'popular', 'newest']),
    query('minPrice').optional().isFloat({ min: 0 }),
    query('maxPrice').optional().isFloat({ min: 0 }),
    query('inStock').optional().isBoolean(),
  ],
  async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const skip = (page - 1) * limit;

      // Build filter query
      const filter: any = {};

      if (req.query.category) {
        filter.category = req.query.category;
      }

      if (req.query.search) {
        filter.$text = { $search: req.query.search as string };
      }

      if (req.query.minPrice || req.query.maxPrice) {
        filter.price = {};
        if (req.query.minPrice) {
          filter.price.$gte = parseFloat(req.query.minPrice as string);
        }
        if (req.query.maxPrice) {
          filter.price.$lte = parseFloat(req.query.maxPrice as string);
        }
      }

      if (req.query.inStock === 'true') {
        filter.stock = { $gt: 0 };
      }

      // Build sort
      let sort: any = { createdAt: -1 }; // Default: newest first
      if (req.query.sort === 'price-asc') {
        sort = { price: 1 };
      } else if (req.query.sort === 'price-desc') {
        sort = { price: -1 };
      } else if (req.query.sort === 'popular') {
        sort = { isFeatured: -1, createdAt: -1 };
      }

      const products = await Product.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean();

      const total = await Product.countDocuments(filter);

      res.json({
        products,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }
);

// GET /products/featured - Get featured products
router.get('/featured', async (req, res) => {
  try {
    const products = await Product.find({ isFeatured: true, stock: { $gt: 0 } })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    res.json({ products });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// GET /products/categories - Get all categories
router.get('/categories', async (req, res) => {
  try {
    const categories = await Product.distinct('category');
    res.json({ categories });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// GET /products/:id - Get single product
router.get(
  '/:id',
  [param('id').isMongoId().withMessage('Invalid product ID')],
  async (req, res) => {
    try {
      const product = await Product.findById(req.params.id).lean();

      if (!product) {
        return res.status(404).json({ message: 'Product not found' });
      }

      res.json({ product });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }
);

// GET /products/search/suggestions - Get search suggestions
router.get('/search/suggestions', async (req, res) => {
  try {
    const searchTerm = req.query.q as string;
    if (!searchTerm || searchTerm.length < 2) {
      return res.json({ suggestions: [] });
    }

    const products = await Product.find({
      $text: { $search: searchTerm },
    })
      .select('name category')
      .limit(10)
      .lean();

    const suggestions = products.map((p) => p.name);
    res.json({ suggestions });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

export default router;


