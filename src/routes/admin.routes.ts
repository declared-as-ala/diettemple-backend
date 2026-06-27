import { Router, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import bcrypt from 'bcrypt';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import os from 'os';
import Product from '../models/Product.model';
import Order from '../models/Order.model';
import User from '../models/User.model';
import Program from '../models/Program.model';
import WorkoutSession from '../models/WorkoutSession.model';
import Session from '../models/Session.model';
import Exercise from '../models/Exercise.model';
import WeeklyTemplate from '../models/WeeklyTemplate.model';
import SessionExerciseConfig from '../models/SessionExerciseConfig.model';
import DailyProgram from '../models/DailyProgram.model';
import LevelHomeContent from '../models/LevelHomeContent.model';
import { AuthRequest } from '../middleware/auth.middleware';
import { getStoragePublicRoot, toPublicUrl, sanitizeSegment, publicUrlToFsPath } from '../lib/mediaStorage';
import { emitUserUpdated } from '../realtime/userRealtime';
import levelTemplateRoutes from './admin/levelTemplate.routes';
import sessionTemplateRoutes from './admin/sessionTemplate.routes';
import subscriptionRoutes from './admin/subscription.routes';
import dashboardRoutes from './admin/dashboard.routes';
import assignmentsRoutes from './admin/assignments.routes';
import nutritionPlanRoutes from './admin/nutritionPlan.routes';
import nutritionAssignmentRoutes from './admin/nutritionAssignment.routes';
import clientsRoutes from './admin/clients.routes';
import recipesRoutes from './admin/recipes.routes';
import landingVideoRoutes from './admin/landingVideo.routes';

const router = Router();
const LEVEL_SLUG_REGEX = /^[a-z0-9-]+$/;

function toLevelSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Coaching
router.use('/level-templates', levelTemplateRoutes);
router.use('/session-templates', sessionTemplateRoutes);
router.use('/subscriptions', subscriptionRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/assignments', assignmentsRoutes);
router.use('/clients', clientsRoutes);
// Nutrition
router.use('/nutrition-plans', nutritionPlanRoutes);
router.use('/nutrition-assignments', nutritionAssignmentRoutes);
router.use('/recipes', recipesRoutes);
// Landing page videos
router.use('/landing-videos', landingVideoRoutes);

// All admin routes require authentication and admin role
// authenticate middleware will be applied in index.ts before this router
// requireAdmin will check the role

// ── MinIO upload helpers (replaces all multer.diskStorage) ───────────────────
import { videoUpload, uploadToMinio, deleteFromMinio, buildFilename } from '../lib/minioUpload';
import { BUCKETS } from '../lib/minioClient';
const upload = videoUpload;                  // exercise video upload
const levelHomeVideoUpload = videoUpload;    // level-home video upload

// Async error wrapper to catch all async errors
const asyncHandler = (fn: Function) => {
  return (req: any, res: any, next: any) => {
    Promise.resolve(fn(req, res, next)).catch((error) => {
      console.error('🔥 [ASYNC HANDLER] Caught async error:', error);
      next(error);
    });
  };
};

// ==================== PRODUCTS MANAGEMENT ====================

// ==================== LEVEL HOME CONTENT ====================

// GET /admin/level-home-content
router.get('/level-home-content', async (req: AuthRequest, res: Response) => {
  try {
    const items = await LevelHomeContent.find().sort({ levelSlug: 1 }).lean();
    res.json({ items });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// PUT /admin/level-home-content/:levelSlug
router.put(
  '/level-home-content/:levelSlug',
  [
    param('levelSlug')
      .matches(LEVEL_SLUG_REGEX)
      .withMessage('levelSlug must contain only lowercase letters, numbers and hyphens'),
    body('title').optional().isString(),
    body('instructions').optional().isString(),
    body('videoUrl').optional({ nullable: true }).isString(),
    body('isActive').optional().isBoolean(),
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: errors.array()[0].msg });
      }

      const levelSlug = toLevelSlug(req.params.levelSlug);
      const existing = await LevelHomeContent.findOne({ levelSlug }).lean();
      const prevUrl = (existing as any)?.videoUrl as string | undefined;

      const nextVideoUrl =
        typeof req.body.videoUrl === 'string'
          ? req.body.videoUrl.trim()
          : String((existing as any)?.videoUrl ?? '');

      if (prevUrl && prevUrl.startsWith('/media/') && nextVideoUrl === '') {
        const oldPath = publicUrlToFsPath(prevUrl);
        if (oldPath && fs.existsSync(oldPath)) {
          try { fs.unlinkSync(oldPath); } catch (_) {}
        }
      }

      const updates = {
        title: typeof req.body.title === 'string' ? req.body.title.trim() : '',
        instructions: typeof req.body.instructions === 'string' ? req.body.instructions.trim() : '',
        videoUrl: nextVideoUrl,
        isActive: typeof req.body.isActive === 'boolean' ? req.body.isActive : true,
      };

      const item = await LevelHomeContent.findOneAndUpdate(
        { levelSlug },
        { $set: updates },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      ).lean();

      res.json({ item });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }
);

// POST /admin/level-home-content/:levelSlug/video — upload video to MinIO
router.post(
  '/level-home-content/:levelSlug/video',
  [
    param('levelSlug')
      .matches(LEVEL_SLUG_REGEX)
      .withMessage('levelSlug must contain only lowercase letters, numbers and hyphens'),
  ],
  levelHomeVideoUpload.single('video'),
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        if (req.file) try { fs.unlinkSync(req.file.path); } catch {}
        return res.status(400).json({ message: errors.array()[0].msg });
      }
      if (!req.file) {
        return res.status(400).json({ message: 'Veuillez envoyer un fichier vidéo (champ video).' });
      }

      const levelSlug = toLevelSlug(req.params.levelSlug);

      // Delete old video from MinIO
      const existing = await LevelHomeContent.findOne({ levelSlug }).lean();
      const prevUrl = (existing as any)?.videoUrl as string | undefined;
      await deleteFromMinio(prevUrl);

      // Upload new video: bucket=videos, key=level-home/{slug}/video_{ts}.mp4
      const filename  = buildFilename(req.file.originalname, 'video', ['.mp4', '.webm']);
      const objectKey = `level-home/${sanitizeSegment(levelSlug)}/${filename}`;
      const videoUrl  = await uploadToMinio(req.file, BUCKETS.VIDEOS, objectKey);

      const item = await LevelHomeContent.findOneAndUpdate(
        { levelSlug },
        { $set: { videoUrl } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      ).lean();

      res.json({ item, videoUrl, message: 'Video uploaded successfully' });
    } catch (error: any) {
      if (req.file) try { fs.unlinkSync(req.file.path); } catch {}
      res.status(500).json({ message: error.message });
    }
  }
);

// GET /admin/products - Get all products with pagination
router.get(
  '/products',
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('search').optional().isString(),
    query('category').optional().isString(),
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const skip = (page - 1) * limit;

      const filter: any = {};
      if (req.query.search) {
        filter.$or = [
          { name: { $regex: req.query.search, $options: 'i' } },
          { description: { $regex: req.query.search, $options: 'i' } },
        ];
      }
      if (req.query.category) {
        filter.category = req.query.category;
      }

      const products = await Product.find(filter)
        .sort({ createdAt: -1 })
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

// GET /admin/products/:id - Get single product
router.get(
  '/products/:id',
  [param('id').isMongoId()],
  async (req: AuthRequest, res: Response) => {
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

// POST /admin/products - Create product
router.post(
  '/products',
  [
    body('name').notEmpty().withMessage('Name is required'),
    body('brand').notEmpty().withMessage('Brand is required'),
    body('category').notEmpty().withMessage('Category is required'),
    body('description').notEmpty().withMessage('Description is required'),
    body('price').isFloat({ min: 0 }).withMessage('Price must be a positive number'),
    body('stock').isInt({ min: 0 }).withMessage('Stock must be a non-negative integer'),
    body('weight').notEmpty().withMessage('Weight is required'),
    body('uhPrice').optional({ nullable: true }).isFloat({ min: 0 }).withMessage('UH price must be positive'),
    body('isUhExclusive').optional().isBoolean(),
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const {
        name, brand, category, description, composition, flavors, weight,
        price, discount, stock, images, isFeatured, tags, nutritionFacts,
        uhPrice, isUhExclusive,
      } = req.body;

      // Validate uhPrice <= price
      if (uhPrice != null && uhPrice > price) {
        return res.status(400).json({ message: 'Le prix UH doit être inférieur ou égal au prix normal' });
      }

      const product = new Product({
        name, brand, category, description,
        composition: composition || {},
        flavors: flavors || [],
        weight, price,
        discount: discount || 0,
        uhPrice: uhPrice ?? null,
        isUhExclusive: isUhExclusive || false,
        stock: stock || 0,
        images: images || [],
        isFeatured: isFeatured || false,
        tags: tags || [],
        ...(nutritionFacts && { composition: { ...composition, ...nutritionFacts } }),
      });

      await product.save();
      res.status(201).json({ product });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }
);

// PUT /admin/products/:id - Update product
router.put(
  '/products/:id',
  [
    param('id').isMongoId(),
    body('price').optional().isFloat({ min: 0 }),
    body('stock').optional().isInt({ min: 0 }),
    body('uhPrice').optional({ nullable: true }).isFloat({ min: 0 }),
    body('isUhExclusive').optional().isBoolean(),
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const product = await Product.findById(req.params.id);
      if (!product) {
        return res.status(404).json({ message: 'Product not found' });
      }

      const updates = req.body;

      // Validate uhPrice <= effective price
      const effectivePrice = updates.price ?? product.price;
      if (updates.uhPrice != null && updates.uhPrice > effectivePrice) {
        return res.status(400).json({ message: 'Le prix UH doit être inférieur ou égal au prix normal' });
      }
      // Allow explicitly setting uhPrice to null to remove it
      if ('uhPrice' in updates && (updates.uhPrice === null || updates.uhPrice === '')) {
        updates.uhPrice = null;
      }

      Object.assign(product, updates);
      await product.save();

      res.json({ product });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }
);

// DELETE /admin/products/:id - Delete product (soft delete)
router.delete(
  '/products/:id',
  [param('id').isMongoId()],
  async (req: AuthRequest, res: Response) => {
    try {
      const product = await Product.findById(req.params.id);
      if (!product) {
        return res.status(404).json({ message: 'Product not found' });
      }

      // Soft delete: set stock to 0 and isFeatured to false
      product.stock = 0;
      product.isFeatured = false;
      await product.save();

      res.json({ message: 'Product deleted successfully' });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }
);

// POST /admin/products/:id/images - Update product images (accepts array of image URLs)
router.post(
  '/products/:id/images',
  [param('id').isMongoId(), body('images').isArray().withMessage('Images must be an array')],
  async (req: AuthRequest, res: Response) => {
    try {
      const product = await Product.findById(req.params.id);
      if (!product) {
        return res.status(404).json({ message: 'Product not found' });
      }

      const { images } = req.body;
      if (!Array.isArray(images)) {
        return res.status(400).json({ message: 'Images must be an array' });
      }

      product.images = images;
      await product.save();

      res.json({ images: product.images });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }
);

// GET /admin/products/categories - Get all categories
router.get('/products/categories', async (req: AuthRequest, res: Response) => {
  try {
    const categories = await Product.distinct('category');
    res.json({ categories });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// ==================== ORDERS MANAGEMENT ====================

// GET /admin/orders - Get all orders
router.get(
  '/orders',
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('status').optional().isString(),
    query('paymentStatus').optional().isString(),
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const skip = (page - 1) * limit;

      const filter: any = {};
      if (req.query.status) {
        filter.status = req.query.status;
      }
      if (req.query.paymentStatus) {
        filter.paymentStatus = req.query.paymentStatus;
      }

      const orders = await Order.find(filter)
        .populate('userId', 'name email phone')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      const total = await Order.countDocuments(filter);

      res.json({
        orders,
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

// GET /admin/orders/:id - Get single order
router.get(
  '/orders/:id',
  [param('id').isMongoId()],
  async (req: AuthRequest, res: Response) => {
    try {
      const order = await Order.findById(req.params.id)
        .populate('userId', 'name email phone level')
        .lean();

      if (!order) {
        return res.status(404).json({ message: 'Order not found' });
      }

      res.json({ order });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }
);

// PUT /admin/orders/:id/status - Update order status
router.put(
  '/orders/:id/status',
  [
    param('id').isMongoId(),
    body('status')
      .isIn(['pending', 'pending_payment', 'paid', 'failed', 'confirmed', 'preparing', 'shipped', 'delivered', 'cancelled'])
      .withMessage('Invalid status'),
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const order = await Order.findById(req.params.id);
      if (!order) {
        return res.status(404).json({ message: 'Order not found' });
      }

      order.status = req.body.status;
      
      // Auto-update payment status when order is delivered
      if (req.body.status === 'delivered' && order.paymentMethod === 'CASH_ON_DELIVERY') {
        order.paymentStatus = 'PAID';
      }

      await order.save();

      res.json({ order });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }
);

// PUT /admin/orders/:id/payment-status - Update payment status
router.put(
  '/orders/:id/payment-status',
  [
    param('id').isMongoId(),
    body('paymentStatus')
      .isIn(['PENDING', 'PAID', 'FAILED'])
      .withMessage('Invalid payment status'),
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const order = await Order.findById(req.params.id);
      if (!order) {
        return res.status(404).json({ message: 'Order not found' });
      }

      order.paymentStatus = req.body.paymentStatus;
      await order.save();

      res.json({ order });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }
);

// ==================== USERS MANAGEMENT ====================

// GET /admin/users - Get all users
router.get(
  '/users',
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('search').optional().isString(),
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const skip = (page - 1) * limit;

      const filter: any = { role: { $ne: 'admin' } }; // Don't show admins in user list
      if (req.query.search) {
        filter.$or = [
          { name: { $regex: req.query.search, $options: 'i' } },
          { email: { $regex: req.query.search, $options: 'i' } },
          { phone: { $regex: req.query.search, $options: 'i' } },
        ];
      }

      const users = await User.find(filter)
        .select('-passwordHash -otp -otpExpires')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      // Get order counts for each user
      const usersWithOrders = await Promise.all(
        users.map(async (user) => {
          const orderCount = await Order.countDocuments({ userId: user._id });
          return { ...user, orderCount };
        })
      );

      const total = await User.countDocuments(filter);

      res.json({
        users: usersWithOrders,
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

// IMPORTANT: Specific routes MUST come BEFORE parameterized routes like /users/:id
// Otherwise Express will match /users/levels to /users/:id with id="levels"

// GET /admin/users/levels - Get users by level (MUST be before /users/:id)
router.get(
  '/users/levels',
  [
    query('level').optional().isIn(['Intiate', 'Fighter', 'Warrior', 'Champion', 'Elite']),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
  ],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: errors.array()[0].msg });
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const skip = (page - 1) * limit;

      const filter: any = { role: { $ne: 'admin' } };
      if (req.query.level) {
        filter.level = req.query.level;
      }

      const users = await User.find(filter)
        .select('name email photoUri level createdAt')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      // Ensure all users have a level (default to 'Intiate')
      const usersWithLevel = users.map((user: any) => ({
        ...user,
        level: user.level || 'Intiate',
      }));

      const total = await User.countDocuments(filter);

      // Get level distribution - handle null levels
      const allUsersForDist = await User.find({ role: { $ne: 'admin' } }).select('level').lean();
      
      const distMap: Record<string, number> = {
        Intiate: 0,
        Fighter: 0,
        Warrior: 0,
        Champion: 0,
        Elite: 0,
      };
      
      allUsersForDist.forEach((user: any) => {
        const level = user.level || 'Intiate';
        if (distMap.hasOwnProperty(level)) {
          distMap[level] = (distMap[level] || 0) + 1;
        } else {
          distMap['Intiate'] = (distMap['Intiate'] || 0) + 1;
        }
      });
      
      const levelDistribution = Object.entries(distMap).map(([_id, count]) => ({ 
        _id, 
        count 
      }));

      res.json({
        users: usersWithLevel,
        levelDistribution,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      });
    } catch (error: any) {
      throw error;
    }
  })
);

// GET /admin/users/roles - Get all users with their roles (MUST be before /users/:id)
router.get(
  '/users/roles',
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('role').optional().isIn(['user', 'admin', 'coach', 'nutritionist']),
    query('search').optional().isString(),
  ],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: errors.array()[0].msg });
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const skip = (page - 1) * limit;

      const filter: any = {};
      if (req.query.role) {
        filter.role = req.query.role;
      }
      if (req.query.search) {
        filter.$or = [
          { name: { $regex: req.query.search, $options: 'i' } },
          { email: { $regex: req.query.search, $options: 'i' } },
          { phone: { $regex: req.query.search, $options: 'i' } },
        ];
      }

      const users = await User.find(filter)
        .select('name email phone photoUri role level createdAt')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      const total = await User.countDocuments(filter);

      // Get role distribution
      const roleDistribution = await User.aggregate([
        { $group: { _id: '$role', count: { $sum: 1 } } },
      ]);

      res.json({
        users,
        roleDistribution: roleDistribution.map((r) => ({ role: r._id || 'user', count: r.count })),
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      });
    } catch (error: any) {
      throw error;
    }
  })
);

// GET /admin/users/:id - Get single user
router.get(
  '/users/:id',
  [param('id').isMongoId()],
  async (req: AuthRequest, res: Response) => {
    try {
      const user = await User.findById(req.params.id)
        .select('-passwordHash -otp -otpExpires')
        .lean();

      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      const orderCount = await Order.countDocuments({ userId: user._id });
      const orders = await Order.find({ userId: user._id })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean();

      res.json({
        user: { ...user, orderCount },
        recentOrders: orders,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }
);

// PUT /admin/users/:id/disable - Disable user (soft delete)
router.put(
  '/users/:id/disable',
  [param('id').isMongoId()],
  async (req: AuthRequest, res: Response) => {
    try {
      const user = await User.findById(req.params.id);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      // You can add an isActive field to User model if needed
      // For now, we'll just return success
      res.json({ message: 'User disabled successfully', user });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }
);

// POST /admin/users - Create user
router.post(
  '/users',
  [
    body('name').optional().trim(),
    body('email').optional().isEmail(),
    body('phone').optional().isString(),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('level').optional().isIn(['Intiate', 'Fighter', 'Warrior', 'Champion', 'Elite']),
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: errors.array()[0].msg });
      }
      const { name, email, phone, password, level } = req.body;
      if (!email && !phone) {
        return res.status(400).json({ message: 'Either email or phone is required' });
      }
      const existing = await User.findOne(email ? { email: email.toLowerCase() } : { phone: phone?.trim() });
      if (existing) {
        return res.status(400).json({ message: email ? 'Email already in use' : 'Phone already in use' });
      }
      const passwordHash = await bcrypt.hash(password, 10);
      const user = await User.create({
        name: name || undefined,
        email: email?.toLowerCase(),
        phone: phone?.trim() || undefined,
        passwordHash,
        level: level || 'Intiate',
        role: 'user',
      });
      const u = user.toObject();
      delete (u as any).passwordHash;
      delete (u as any).otp;
      delete (u as any).otpExpires;
      res.status(201).json({ user: u });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }
);

// PUT /admin/users/:id - Update user
router.put(
  '/users/:id',
  [
    param('id').isMongoId(),
    body('name').optional().trim(),
    body('email').optional().isEmail(),
    body('phone').optional().isString(),
    body('level').optional().isIn(['Intiate', 'Fighter', 'Warrior', 'Champion', 'Elite']),
    body('password').optional().isLength({ min: 6 }),
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: errors.array()[0].msg });
      }
      const user = await User.findById(req.params.id);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      if (req.body.name != null) user.name = req.body.name;
      if (req.body.email != null) user.email = req.body.email.toLowerCase();
      if (req.body.phone != null) user.phone = req.body.phone.trim();
      if (req.body.level != null) user.level = req.body.level;
      if (req.body.password) {
        user.passwordHash = await bcrypt.hash(req.body.password, 10);
      }
      await user.save();
      const u = user.toObject();
      delete (u as any).passwordHash;
      delete (u as any).otp;
      delete (u as any).otpExpires;
      await emitUserUpdated(String(user._id));
      res.json({ user: u });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }
);

// DELETE /admin/users/:id - Delete user
router.delete(
  '/users/:id',
  [param('id').isMongoId()],
  async (req: AuthRequest, res: Response) => {
    try {
      const user = await User.findByIdAndDelete(req.params.id);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      res.json({ message: 'User deleted' });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }
);

// ==================== PROGRAMS MANAGEMENT ====================

// GET /admin/programs - Get all programs
router.get(
  '/programs',
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('status').optional().isIn(['ACTIVE', 'COMPLETED', 'PAUSED']),
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const skip = (page - 1) * limit;

      const filter: any = {};
      if (req.query.status) {
        filter.status = req.query.status;
      }

      const programs = await Program.find(filter)
        .populate('userId', 'name email photoUri level')
        .populate('weeklyTemplateId')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      const total = await Program.countDocuments(filter);

      res.json({
        programs,
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

// GET /admin/programs/:id - Get single program
router.get(
  '/programs/:id',
  [param('id').isMongoId()],
  async (req: AuthRequest, res: Response) => {
    try {
      const program = await Program.findById(req.params.id)
        .populate('userId', 'name email photoUri level')
        .populate('weeklyTemplateId')
        .lean();

      if (!program) {
        return res.status(404).json({ message: 'Program not found' });
      }

      res.json({ program });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }
);

// PUT /admin/programs/:id/status - Update program status
router.put(
  '/programs/:id/status',
  [param('id').isMongoId(), body('status').isIn(['ACTIVE', 'COMPLETED', 'PAUSED'])],
  async (req: AuthRequest, res: Response) => {
    try {
      const program = await Program.findById(req.params.id);
      if (!program) {
        return res.status(404).json({ message: 'Program not found' });
      }

      program.status = req.body.status;
      await program.save();

      res.json({ program });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }
);

// ==================== LEVELS MANAGEMENT ====================


// PUT /admin/users/:id/level - Update user level
router.put(
  '/users/:id/level',
  [param('id').isMongoId(), body('level').isIn(['Intiate', 'Fighter', 'Warrior', 'Champion', 'Elite'])],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: errors.array()[0].msg });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.level = req.body.level;
    await user.save();
    await emitUserUpdated(String(user._id));

    res.json({ user });
  })
);


// PUT /admin/users/:id/role - Assign or update user role
router.put(
  '/users/:id/role',
  [
    param('id').isMongoId(),
    body('role').isIn(['user', 'admin', 'coach', 'nutritionist']).withMessage('Invalid role'),
  ],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: errors.array()[0].msg });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Prevent self-demotion from admin
    if (user._id.toString() === req.user?._id?.toString() && req.body.role !== 'admin' && user.role === 'admin') {
      return res.status(403).json({ message: 'You cannot revoke your own admin role' });
    }

    const oldRole = user.role;
    user.role = req.body.role;
    await user.save();
    await emitUserUpdated(String(user._id));

    res.json({
      user,
      message: `User role updated from ${oldRole} to ${req.body.role}`,
    });
  })
);

// DELETE /admin/users/:id/role - Revoke role (set to 'user')
router.delete(
  '/users/:id/role',
  [param('id').isMongoId()],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: errors.array()[0].msg });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Prevent self-demotion from admin
    if (user._id.toString() === req.user?._id?.toString() && user.role === 'admin') {
      return res.status(403).json({ message: 'You cannot revoke your own admin role' });
    }

    const oldRole = user.role;
    user.role = 'user';
    await user.save();
    await emitUserUpdated(String(user._id));

    res.json({
      user,
      message: `User role revoked from ${oldRole} to user`,
    });
  })
);

// ==================== WORKOUTS MANAGEMENT ====================

// GET /admin/workouts - Get all workout sessions
router.get(
  '/workouts',
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('status').optional().isIn(['active', 'completed', 'abandoned']),
    query('userId').optional().isMongoId(),
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const skip = (page - 1) * limit;

      const filter: any = {};
      if (req.query.status) {
        filter.status = req.query.status;
      }
      if (req.query.userId) {
        filter.userId = req.query.userId;
      }

      const workouts = await WorkoutSession.find(filter)
        .populate('userId', 'name email photoUri level')
        .populate('sessionId')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      const total = await WorkoutSession.countDocuments(filter);

      res.json({
        workouts,
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

// GET /admin/workouts/:id - Get single workout session
router.get(
  '/workouts/:id',
  [param('id').isMongoId()],
  async (req: AuthRequest, res: Response) => {
    try {
      const workout = await WorkoutSession.findById(req.params.id)
        .populate('userId', 'name email photoUri level')
        .populate('sessionId')
        .populate('exercises.exerciseId')
        .lean();

      if (!workout) {
        return res.status(404).json({ message: 'Workout session not found' });
      }

      res.json({ workout });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }
);

// ==================== EXERCISES MANAGEMENT ====================

// GET /admin/exercises - Get all exercises
router.get(
  '/exercises',
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('search').optional().isString(),
    query('muscleGroup').optional().isString(),
    query('difficulty').optional().isString(),
    query('equipment').optional().isString(),
    query('hasVideo').optional().isIn(['true', 'false']),
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const skip = (page - 1) * limit;

      const filter: any = {};
      if (req.query.search) {
        filter.$or = [
          { name: { $regex: req.query.search, $options: 'i' } },
          { description: { $regex: req.query.search, $options: 'i' } },
        ];
      }
      if (req.query.muscleGroup) {
        filter.muscleGroup = req.query.muscleGroup;
      }
      if (req.query.difficulty) {
        filter.difficulty = req.query.difficulty;
      }
      if (req.query.equipment) {
        filter.equipment = req.query.equipment;
      }
      if (req.query.hasVideo === 'true') {
        filter.videoUrl = { $exists: true, $nin: [null, ''] };
      } else if (req.query.hasVideo === 'false') {
        filter.$and = (filter.$and || []).concat([
          { $or: [{ videoUrl: { $exists: false } }, { videoUrl: null }, { videoUrl: '' }] },
        ]);
      }

      const exercises = await Exercise.find(filter)
        .sort({ name: 1 })
        .skip(skip)
        .limit(limit)
        .lean();

      const total = await Exercise.countDocuments(filter);

      res.json({
        exercises,
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

// GET /admin/exercises/muscle-groups - Get all muscle groups
// NOTE: This must come before /exercises/:id to avoid route conflicts
router.get('/exercises/muscle-groups', async (req: AuthRequest, res: Response) => {
  try {
    const muscleGroups = await Exercise.distinct('muscleGroup');
    res.json({ muscleGroups });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// GET /admin/exercises/:id - Get single exercise
router.get(
  '/exercises/:id',
  [param('id').isMongoId()],
  async (req: AuthRequest, res: Response) => {
    try {
      const exercise = await Exercise.findById(req.params.id).lean();
      if (!exercise) {
        return res.status(404).json({ message: 'Exercise not found' });
      }
      res.json({ exercise });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }
);

// POST /admin/exercises - Create exercise
router.post(
  '/exercises',
  [
    body('name').notEmpty().withMessage('Name is required'),
    body('muscleGroup').notEmpty().withMessage('Muscle group is required'),
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const exercise = new Exercise(req.body);
      await exercise.save();
      res.status(201).json({ exercise });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }
);

// PUT /admin/exercises/:id - Update exercise
router.put(
  '/exercises/:id',
  [param('id').isMongoId()],
  async (req: AuthRequest, res: Response) => {
    try {
      const exercise = await Exercise.findById(req.params.id);
      if (!exercise) {
        return res.status(404).json({ message: 'Exercise not found' });
      }

      Object.assign(exercise, req.body);
      await exercise.save();

      res.json({ exercise });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }
);

// DELETE /admin/exercises/:id - Delete exercise
router.delete(
  '/exercises/:id',
  [param('id').isMongoId()],
  async (req: AuthRequest, res: Response) => {
    try {
      const exercise = await Exercise.findById(req.params.id);
      if (!exercise) {
        return res.status(404).json({ message: 'Exercise not found' });
      }
      // Delete uploaded video from MinIO if it was an uploaded file
      if ((exercise as any).videoSource === 'upload' && exercise.videoUrl) {
        await deleteFromMinio(exercise.videoUrl);
      }
      await Exercise.findByIdAndDelete(req.params.id);
      res.json({ message: 'Exercise deleted successfully' });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }
);

// POST /admin/exercises/:id/video - Update exercise video (MinIO upload)
router.post(
  '/exercises/:id/video',
  [param('id').isMongoId()],
  upload.single('video'),
  async (req: AuthRequest, res: Response) => {
    try {
      const exercise = await Exercise.findById(req.params.id);
      if (!exercise) {
        if (req.file) try { fs.unlinkSync(req.file.path); } catch {}
        return res.status(404).json({ message: 'Exercise not found' });
      }
      if (!req.file) {
        return res.status(400).json({ message: 'Veuillez envoyer un fichier vidéo.' });
      }

      // Delete old video from MinIO if it was an uploaded file
      if ((exercise as any).videoSource === 'upload' && exercise.videoUrl) {
        await deleteFromMinio(exercise.videoUrl);
      }

      // Upload new video to MinIO: bucket=videos, key=exercises/{id}/video_{ts}.mp4
      const exerciseId = sanitizeSegment(String(req.params.id));
      const filename   = buildFilename(req.file.originalname, 'video', ['.mp4', '.webm']);
      const objectKey  = `exercises/${exerciseId}/${filename}`;
      const videoUrl   = await uploadToMinio(req.file, BUCKETS.VIDEOS, objectKey);

      (exercise as any).videoSource   = 'upload';
      (exercise as any).videoFilePath = objectKey;
      exercise.videoUrl = videoUrl;
      await exercise.save();

      const updatedExercise = await Exercise.findById(req.params.id).lean();
      res.json({ exercise: updatedExercise, message: 'Video uploaded successfully', videoUrl });
    } catch (error: any) {
      if (req.file) try { fs.unlinkSync(req.file.path); } catch {}
      res.status(500).json({ message: error?.message || 'Failed to update video' });
    }
  }
);

// ==================== SESSIONS MANAGEMENT ====================

// GET /admin/sessions - Get all sessions
router.get(
  '/sessions',
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('search').optional().isString(),
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const skip = (page - 1) * limit;

      const filter: any = {};
      if (req.query.search) {
        filter.$or = [
          { title: { $regex: req.query.search, $options: 'i' } },
          { description: { $regex: req.query.search, $options: 'i' } },
        ];
      }

      const sessions = await Session.find(filter)
        .populate('exercises')
        .populate('exerciseConfigs')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      const total = await Session.countDocuments(filter);

      res.json({
        sessions,
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

// GET /admin/sessions/:id - Get single session
router.get(
  '/sessions/:id',
  [param('id').isMongoId()],
  async (req: AuthRequest, res: Response) => {
    try {
      const session = await Session.findById(req.params.id)
        .populate('exercises')
        .populate({
          path: 'exerciseConfigs',
          populate: {
            path: 'exerciseId alternatives',
            model: 'Exercise',
          },
        })
        .lean();

      if (!session) {
        return res.status(404).json({ message: 'Session not found' });
      }

      res.json({ session });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }
);

// POST /admin/sessions - Create session
router.post(
  '/sessions',
  [
    body('title').notEmpty().withMessage('Title is required'),
    body('exerciseConfigs').optional().isArray(),
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const { title, description, duration, difficulty, exerciseConfigs } = req.body;

      // Create exercise configs if provided
      let configIds: any[] = [];
      if (exerciseConfigs && Array.isArray(exerciseConfigs)) {
        for (const config of exerciseConfigs) {
          const exerciseConfig = new SessionExerciseConfig(config);
          await exerciseConfig.save();
          configIds.push(exerciseConfig._id);
        }
      }

      const session = new Session({
        title,
        description,
        duration,
        difficulty,
        exerciseConfigs: configIds,
      });

      await session.save();

      const populatedSession = await Session.findById(session._id)
        .populate({
          path: 'exerciseConfigs',
          populate: {
            path: 'exerciseId alternatives',
            model: 'Exercise',
          },
        })
        .lean();

      res.status(201).json({ session: populatedSession });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }
);

// PUT /admin/sessions/:id - Update session
router.put(
  '/sessions/:id',
  [param('id').isMongoId()],
  async (req: AuthRequest, res: Response) => {
    try {
      const session = await Session.findById(req.params.id);
      if (!session) {
        return res.status(404).json({ message: 'Session not found' });
      }

      const { exerciseConfigs, ...updateData } = req.body;

      // Update exercise configs if provided
      if (exerciseConfigs && Array.isArray(exerciseConfigs)) {
        // Delete old configs
        await SessionExerciseConfig.deleteMany({ _id: { $in: session.exerciseConfigs } });

        // Create new configs
        const configIds: any[] = [];
        for (const config of exerciseConfigs) {
          const exerciseConfig = new SessionExerciseConfig(config);
          await exerciseConfig.save();
          configIds.push(exerciseConfig._id);
        }

        updateData.exerciseConfigs = configIds;
      }

      Object.assign(session, updateData);
      await session.save();

      const populatedSession = await Session.findById(session._id)
        .populate({
          path: 'exerciseConfigs',
          populate: {
            path: 'exerciseId alternatives',
            model: 'Exercise',
          },
        })
        .lean();

      res.json({ session: populatedSession });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }
);

// DELETE /admin/sessions/:id - Delete session
router.delete(
  '/sessions/:id',
  [param('id').isMongoId()],
  async (req: AuthRequest, res: Response) => {
    try {
      const session = await Session.findById(req.params.id);
      if (!session) {
        return res.status(404).json({ message: 'Session not found' });
      }

      // Delete exercise configs
      if (session.exerciseConfigs && session.exerciseConfigs.length > 0) {
        await SessionExerciseConfig.deleteMany({ _id: { $in: session.exerciseConfigs } });
      }

      await Session.deleteOne({ _id: session._id });

      res.json({ message: 'Session deleted successfully' });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }
);

// ==================== WEEKLY TEMPLATES MANAGEMENT ====================

// GET /admin/weekly-templates - Get all weekly templates
router.get(
  '/weekly-templates',
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const skip = (page - 1) * limit;

      const templates = await WeeklyTemplate.find()
        .populate('monday tuesday wednesday thursday friday saturday sunday')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      const total = await WeeklyTemplate.countDocuments();

      res.json({
        templates,
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

// POST /admin/weekly-templates - Create weekly template
router.post(
  '/weekly-templates',
  [body('name').notEmpty().withMessage('Name is required')],
  async (req: AuthRequest, res: Response) => {
    try {
      const template = new WeeklyTemplate(req.body);
      await template.save();

      const populatedTemplate = await WeeklyTemplate.findById(template._id)
        .populate('monday tuesday wednesday thursday friday saturday sunday')
        .lean();

      res.status(201).json({ template: populatedTemplate });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }
);

// PUT /admin/weekly-templates/:id - Update weekly template
router.put(
  '/weekly-templates/:id',
  [param('id').isMongoId()],
  async (req: AuthRequest, res: Response) => {
    try {
      const template = await WeeklyTemplate.findById(req.params.id);
      if (!template) {
        return res.status(404).json({ message: 'Weekly template not found' });
      }

      Object.assign(template, req.body);
      await template.save();

      const populatedTemplate = await WeeklyTemplate.findById(template._id)
        .populate('monday tuesday wednesday thursday friday saturday sunday')
        .lean();

      res.json({ template: populatedTemplate });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }
);

// ==================== ANALYTICS: WEIGHT LIFTED ====================

// GET /admin/analytics/weight-lifted — all users volume summary
router.get(
  '/analytics/weight-lifted',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    // Aggregate sessions per user
    const userSummaries = await WorkoutSession.aggregate([
      { $match: { status: 'completed' } },
      {
        $group: {
          _id: '$userId',
          totalVolumeKg: { $sum: '$totalSessionVolumeKg' },
          totalSessions: { $sum: 1 },
          lastSessionAt: { $max: '$completedAt' },
        },
      },
      { $sort: { totalVolumeKg: -1 } },
    ]);

    // Per-exercise top volumes per user
    const exerciseAgg = await WorkoutSession.aggregate([
      { $match: { status: 'completed', 'exercises.0': { $exists: true } } },
      { $unwind: '$exercises' },
      {
        $group: {
          _id: { userId: '$userId', exerciseName: '$exercises.exerciseName' },
          totalVolumeKg: { $sum: '$exercises.totalVolumeKg' },
          maxWeightKg: { $max: { $max: '$exercises.sets.weight' } },
        },
      },
      { $sort: { '_id.userId': 1, totalVolumeKg: -1 } },
    ]);

    // Build exercise map per user
    const exerciseMap: Record<string, { exerciseName: string; maxWeightKg: number; totalVolumeKg: number }[]> = {};
    for (const ex of exerciseAgg) {
      const uid = String(ex._id.userId);
      if (!exerciseMap[uid]) exerciseMap[uid] = [];
      if (exerciseMap[uid].length < 3 && ex._id.exerciseName) {
        exerciseMap[uid].push({
          exerciseName: ex._id.exerciseName,
          maxWeightKg: ex.maxWeightKg ?? 0,
          totalVolumeKg: ex.totalVolumeKg ?? 0,
        });
      }
    }

    // Populate user details
    const userIds = userSummaries.map((u) => u._id);
    const users = await User.find({ _id: { $in: userIds } }).select('name email').lean();
    const userMap = new Map(users.map((u) => [String(u._id), u]));

    const result = userSummaries.map((u) => {
      const userData = userMap.get(String(u._id));
      return {
        userId: u._id,
        name: userData?.name ?? 'Unknown',
        email: (userData as any)?.email ?? '',
        totalVolumeKg: u.totalVolumeKg ?? 0,
        totalSessions: u.totalSessions ?? 0,
        lastSessionAt: u.lastSessionAt ?? null,
        topExercises: exerciseMap[String(u._id)] ?? [],
      };
    });

    res.json({ users: result });
  })
);

// GET /admin/analytics/weight-lifted/:userId — detailed session history for one user
router.get(
  '/analytics/weight-lifted/:userId',
  [param('userId').isMongoId()],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const userId = req.params.userId;
    const user = await User.findById(userId).select('name email createdAt').lean();
    if (!user) return res.status(404).json({ message: 'User not found' });

    const sessions = await WorkoutSession.find({ userId, status: 'completed' })
      .sort({ completedAt: -1 })
      .limit(50)
      .lean();

    const formatted = sessions.map((s) => ({
      sessionId: s._id,
      completedAt: s.completedAt,
      durationSeconds: (s as any).durationSeconds ?? null,
      totalVolumeKg: (s as any).totalSessionVolumeKg ?? 0,
      exercises: (s.exercises ?? []).map((ex: any) => ({
        exerciseName: ex.exerciseName ?? 'Inconnu',
        totalVolumeKg: ex.totalVolumeKg ?? 0,
        sets: (ex.sets ?? []).map((set: any) => ({
          setNumber: set.setNumber,
          reps: set.repsCompleted ?? 0,
          weightKg: set.weight ?? 0,
        })),
      })),
    }));

    res.json({
      user: { name: (user as any).name, email: (user as any).email },
      sessions: formatted,
    });
  })
);

// Client analytics and assign-program are under /clients router (GET /:id/analytics, POST /:id/assign-program)

// ============================================================
// LEADS — website callback requests
// ============================================================
import Lead from '../models/Lead.model';

router.get('/leads', async (req: AuthRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const skip = (page - 1) * limit;
    const status = req.query.status as string | undefined;

    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;

    const [leads, total] = await Promise.all([
      Lead.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Lead.countDocuments(filter),
    ]);

    res.json({ leads, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error: any) {
    res.status(500).json({ error: 'error', message: error.message });
  }
});

router.patch('/leads/:id/status', async (req: AuthRequest, res: Response) => {
  try {
    const { status, notes } = req.body;
    const update: Record<string, unknown> = {};
    if (status) update.status = status;
    if (notes !== undefined) update.notes = notes;

    const lead = await Lead.findByIdAndUpdate(req.params.id, update, { new: true }).lean();
    if (!lead) return res.status(404).json({ message: 'Lead not found' });
    res.json({ lead });
  } catch (error: any) {
    res.status(500).json({ error: 'error', message: error.message });
  }
});

// POST /admin/daily-programs/:userId/:date/main-objective/video - Upload main objective video
router.post(
  '/daily-programs/:userId/:date/main-objective/video',
  upload.single('video'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { userId, date } = req.params;

      if (!req.file) {
        return res.status(400).json({ message: 'Video file is required' });
      }

      // Parse date
      const targetDate = new Date(date);
      if (isNaN(targetDate.getTime())) {
        if (req.file) try { fs.unlinkSync(req.file.path); } catch {}
        return res.status(400).json({ message: 'Invalid date format' });
      }

      targetDate.setHours(0, 0, 0, 0);
      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);

      // Check if daily program exists
      const dailyProgram = await DailyProgram.findOne({
        userId,
        date: {
          $gte: targetDate,
          $lte: endOfDay,
        },
      });

      if (!dailyProgram) {
        if (req.file) try { fs.unlinkSync(req.file.path); } catch {}
        return res.status(404).json({ message: 'Daily program not found for this user and date' });
      }

      // Upload video to MinIO
      const sanitizedUserId = sanitizeSegment(userId);
      const dateStr = date.replace(/\//g, '-');
      const filename = buildFilename(req.file.originalname, 'objective', ['.mp4', '.webm']);
      const objectKey = `daily-programs/${sanitizedUserId}/${dateStr}/${filename}`;
      const videoUrl = await uploadToMinio(req.file, BUCKETS.VIDEOS, objectKey);

      res.json({
        message: 'Video uploaded successfully',
        videoUrl,
      });
    } catch (error: any) {
      if (req.file) try { fs.unlinkSync(req.file.path); } catch {}
      console.error('Error uploading objective video:', error);
      res.status(500).json({ message: error.message });
    }
  }
);

// PUT /admin/daily-programs/:userId/:date/main-objective - Update daily program's main objective (video & instructions)
router.put(
  '/daily-programs/:userId/:date/main-objective',
  async (req: AuthRequest, res: Response) => {
    try {
      const { userId, date } = req.params;
      const { title, description, videoUrl } = req.body;

      if (!title) {
        return res.status(400).json({ message: 'Title is required' });
      }

      // Parse date
      const targetDate = new Date(date);
      if (isNaN(targetDate.getTime())) {
        return res.status(400).json({ message: 'Invalid date format' });
      }

      targetDate.setHours(0, 0, 0, 0);
      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);

      // Update daily program
      const dailyProgram = await DailyProgram.findOneAndUpdate(
        {
          userId,
          date: {
            $gte: targetDate,
            $lte: endOfDay,
          },
        },
        {
          mainObjective: {
            title,
            description: description || '',
            videoUrl: videoUrl || null,
          },
        },
        { new: true }
      );

      if (!dailyProgram) {
        return res.status(404).json({ message: 'Daily program not found for this user and date' });
      }

      res.json({
        message: 'Main objective updated successfully',
        dailyProgram
      });
    } catch (error: any) {
      console.error('Error updating main objective:', error);
      res.status(500).json({ message: error.message });
    }
  }
);

// GET /admin/users-simple - Get list of users for dropdown/search in daily objectives
router.get(
  '/users-simple',
  async (req: AuthRequest, res: Response) => {
    try {
      const search = (req.query.search as string) || '';
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const skip = (page - 1) * limit;

      const query: any = {};
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
        ];
      }

      const users = await User.find(query)
        .select('_id name email level')
        .sort({ name: 1 })
        .skip(skip)
        .limit(limit)
        .lean();

      const total = await User.countDocuments(query);

      res.json({
        users: users.map(u => ({
          id: u._id,
          name: u.name,
          email: u.email,
          level: u.level,
        })),
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

// PUT /admin/landing/settings - Update landing page settings (contact phone, etc.)
router.put(
  '/landing/settings',
  async (req: AuthRequest, res: Response) => {
    try {
      const { contactPhone } = req.body;

      if (!contactPhone) {
        return res.status(400).json({ message: 'Contact phone is required' });
      }

      // Store settings in a simple document (you can extend this with more settings)
      const settings = {
        contactPhone,
        updatedAt: new Date(),
        updatedBy: req.user?._id,
      };

      // For now, store in a Settings collection or update a config document
      // If you don't have a Settings model, you can create a simple in-memory storage or add to environment
      res.json({ message: 'Settings updated', settings });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }
);

export default router;

