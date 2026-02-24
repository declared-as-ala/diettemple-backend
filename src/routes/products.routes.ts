import { Router, Request, Response } from 'express';
import { query, param } from 'express-validator';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import Product from '../models/Product.model';
import Favorite from '../models/Favorite.model';

const router = Router();

// List card fields only — keeps serverless response fast
const LIST_SELECT = 'name brand category price discount images stock isFeatured createdAt';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 24;
/** Abort MongoDB queries after this (avoids 504 on slow Atlas). */
const QUERY_TIMEOUT_MS = 10_000;

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
  async (req: Request, res: Response) => {
    const t0 = Date.now();
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(
        parseInt(req.query.limit as string) || DEFAULT_PAGE_SIZE,
        MAX_PAGE_SIZE
      );
      const skip = (page - 1) * limit;

      const filter: any = {};
      if (req.query.category) filter.category = req.query.category;
      if (req.query.search) filter.$text = { $search: req.query.search as string };
      if (req.query.minPrice || req.query.maxPrice) {
        filter.price = {};
        if (req.query.minPrice) filter.price.$gte = parseFloat(req.query.minPrice as string);
        if (req.query.maxPrice) filter.price.$lte = parseFloat(req.query.maxPrice as string);
      }
      if (req.query.inStock === 'true') filter.stock = { $gt: 0 };

      let sort: any = { createdAt: -1 };
      if (req.query.sort === 'price-asc') sort = { price: 1 };
      else if (req.query.sort === 'price-desc') sort = { price: -1 };
      else if (req.query.sort === 'popular') sort = { isFeatured: -1, createdAt: -1 };

      const t1 = Date.now();
      const [products, total] = await Promise.all([
        Product.find(filter).maxTimeMS(QUERY_TIMEOUT_MS).select(LIST_SELECT).sort(sort).skip(skip).limit(limit).lean(),
        Product.countDocuments(filter).maxTimeMS(QUERY_TIMEOUT_MS),
      ]);
      const t2 = Date.now();

      res.json({
        products,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      });
      console.log(`[products list] query=${t2 - t1}ms total=${t2 - t0}ms`);
    } catch (error: any) {
      res.status(500).json({ error: 'error', message: error.message });
    }
  }
);

// GET /products/featured - Get featured products (lightweight for serverless)
router.get('/featured', async (req: Request, res: Response) => {
  const t0 = Date.now();
  try {
    const t1 = Date.now();
    const products = await Product.find({ isFeatured: true, stock: { $gt: 0 } })
      .maxTimeMS(QUERY_TIMEOUT_MS)
      .select(LIST_SELECT)
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();
    const t2 = Date.now();
    res.json({ products });
    console.log(`[products featured] query=${t2 - t1}ms total=${t2 - t0}ms`);
  } catch (error: any) {
    res.status(500).json({ error: 'error', message: error.message });
  }
});

// GET /products/categories - Get all categories
router.get('/categories', async (req: Request, res: Response) => {
  try {
    const categories = await Product.distinct('category').maxTimeMS(QUERY_TIMEOUT_MS);
    res.json({ categories });
  } catch (error: any) {
    res.status(500).json({ error: 'error', message: error.message });
  }
});

// GET /products/:id - Get single product
router.get(
  '/:id',
  [param('id').isMongoId().withMessage('Invalid product ID')],
  async (req: Request, res: Response) => {
    try {
      const product = await Product.findById(req.params.id).maxTimeMS(QUERY_TIMEOUT_MS).lean();

      if (!product) {
        return res.status(404).json({ message: 'Product not found' });
      }

      res.json({ product });
    } catch (error: any) {
      res.status(500).json({ error: 'error', message: error.message });
    }
  }
);

// GET /products/search/suggestions - Get search suggestions
router.get('/search/suggestions', async (req: Request, res: Response) => {
  try {
    const searchTerm = req.query.q as string;
    if (!searchTerm || searchTerm.length < 2) {
      return res.json({ suggestions: [] });
    }

    const products = await Product.find({ $text: { $search: searchTerm } })
      .maxTimeMS(QUERY_TIMEOUT_MS)
      .select('name category')
      .limit(10)
      .lean();

    const suggestions = products.map((p) => p.name);
    res.json({ suggestions });
  } catch (error: any) {
    res.status(500).json({ error: 'error', message: error.message });
  }
});

export default router;


