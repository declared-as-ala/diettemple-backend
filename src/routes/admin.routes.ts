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
import { AuthRequest } from '../middleware/auth.middleware';
import { getStoragePublicRoot, toPublicUrl, sanitizeSegment, publicUrlToFsPath } from '../lib/mediaStorage';
import levelTemplateRoutes from './admin/levelTemplate.routes';
import sessionTemplateRoutes from './admin/sessionTemplate.routes';
import subscriptionRoutes from './admin/subscription.routes';
import dashboardRoutes from './admin/dashboard.routes';
import assignmentsRoutes from './admin/assignments.routes';
import nutritionPlanRoutes from './admin/nutritionPlan.routes';
import nutritionAssignmentRoutes from './admin/nutritionAssignment.routes';
import clientsRoutes from './admin/clients.routes';
import recipesRoutes from './admin/recipes.routes';

const router = Router();

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

// All admin routes require authentication and admin role
// authenticate middleware will be applied in index.ts before this router
// requireAdmin will check the role

// Legacy video dir (for deleting old uploads that used /api/videos)
// On Vercel/serverless, filesystem is read-only except /tmp — use tmp to avoid crash
const isVercel = !!process.env.VERCEL;
const legacyVideoDir = isVercel
  ? path.join(os.tmpdir(), 'diettemple', 'storage', 'video')
  : path.join(__dirname, '../../storage/video');
try {
  if (!fs.existsSync(legacyVideoDir)) {
    fs.mkdirSync(legacyVideoDir, { recursive: true });
  }
} catch {
  // Ignore on read-only filesystem (e.g. Vercel serverless)
}

// New uploads: use writable root (tmp on Vercel, else storage/public)
const writableRoot = isVercel ? path.join(os.tmpdir(), 'diettemple', 'public') : getStoragePublicRoot();
const exercisesVideosRoot = path.join(writableRoot, 'exercises', 'videos');
const videoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const id = sanitizeSegment((req as any).params?.id || 'unknown');
    const dir = path.join(exercisesVideosRoot, id);
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    } catch (e) {
      return cb(e as Error, dir);
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ts = Date.now();
    const ext = (path.extname(file.originalname) || '').toLowerCase();
    const safeExt = ext === '.mp4' || ext === '.webm' ? ext : '.mp4';
    cb(null, `video_${ts}${safeExt}`);
  },
});

const upload = multer({
  storage: videoStorage,
  limits: { fileSize: 300 * 1024 * 1024 }, // 300MB
  fileFilter: (req, file, cb) => {
    const allowed = ['video/mp4', 'video/mpeg', 'video/quicktime', 'video/x-msvideo', 'video/webm'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Invalid file type. Only video files are allowed.'));
  },
});

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
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const {
        name,
        brand,
        category,
        description,
        composition,
        flavors,
        weight,
        price,
        discount,
        promoPrice,
        stock,
        images,
        isActive,
        isFeatured,
        tags,
        nutritionFacts,
      } = req.body;

      const product = new Product({
        name,
        brand,
        category,
        description,
        composition: composition || {},
        flavors: flavors || [],
        weight,
        price,
        discount: discount || 0,
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
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const product = await Product.findById(req.params.id);
      if (!product) {
        return res.status(404).json({ message: 'Product not found' });
      }

      const updates = req.body;
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
        .select('name email photoUri level xp createdAt')
        .sort({ xp: -1 })
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
        .select('name email phone photoUri role level xp createdAt')
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
        .populate('userId', 'name email photoUri level xp')
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
        .populate('userId', 'name email photoUri level xp')
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
      // Delete uploaded video file if exists
      if (exercise.videoSource === 'upload' && exercise.videoUrl) {
        if (exercise.videoUrl.startsWith('/media/')) {
          const oldPath = publicUrlToFsPath(exercise.videoUrl);
          if (oldPath && fs.existsSync(oldPath)) {
            try { fs.unlinkSync(oldPath); } catch (_) {}
          }
        } else if (exercise.videoUrl.startsWith('/api/videos/')) {
          const oldFileName = exercise.videoUrl.replace(/^\/api\/videos\//, '');
          const oldPath = path.join(legacyVideoDir, oldFileName);
          if (fs.existsSync(oldPath)) {
            try { fs.unlinkSync(oldPath); } catch (_) {}
          }
        }
      }
      await Exercise.findByIdAndDelete(req.params.id);
      res.json({ message: 'Exercise deleted successfully' });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }
);

// POST /admin/exercises/:id/video - Update exercise video (file upload)
router.post(
  '/exercises/:id/video',
  [param('id').isMongoId()],
  upload.single('video'),
  async (req: AuthRequest, res: Response) => {
    try {
      const exercise = await Exercise.findById(req.params.id);
      if (!exercise) {
        // Delete uploaded file if exercise not found
        if (req.file) {
          fs.unlinkSync(req.file.path);
        }
        return res.status(404).json({ message: 'Exercise not found' });
      }

      // Delete old video file if exists
      if (exercise.videoSource === 'upload' && exercise.videoUrl) {
        if (exercise.videoUrl.startsWith('/media/')) {
          const oldPath = publicUrlToFsPath(exercise.videoUrl);
          if (oldPath && fs.existsSync(oldPath)) {
            try { fs.unlinkSync(oldPath); } catch (_) {}
          }
        } else if (exercise.videoUrl.startsWith('/api/videos/')) {
          const oldFileName = exercise.videoUrl.replace(/^\/api\/videos\//, '');
          const oldPath = path.join(legacyVideoDir, oldFileName);
          if (fs.existsSync(oldPath)) {
            try { fs.unlinkSync(oldPath); } catch (_) {}
          }
        }
      }

      if (!req.file) {
        return res.status(400).json({
          message: 'Please upload a video file. YouTube and URL links are not supported.',
        });
      }
      if (!fs.existsSync(req.file.path)) {
        return res.status(500).json({ message: 'Video file was not saved correctly' });
      }
      const exerciseId = sanitizeSegment(String(req.params.id));
      const relativePath = `exercises/videos/${exerciseId}/${req.file.filename}`;
      const videoUrl = toPublicUrl(relativePath);
      (exercise as any).videoSource = 'upload';
      (exercise as any).videoFilePath = relativePath;
      exercise.videoUrl = videoUrl;
      await exercise.save();
      const updatedExercise = await Exercise.findById(req.params.id).lean();
      res.json({ exercise: updatedExercise, message: 'Video uploaded successfully', videoUrl });
    } catch (error: any) {
      // Delete uploaded file on error
      if (req.file && req.file.path && fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch (_) {}
      }
      const message = error?.message || 'Failed to update video';
      if (process.env.NODE_ENV !== 'production') {
        console.error('[admin/exercises/:id/video]', error);
      }
      res.status(500).json({ message });
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

// Client analytics and assign-program are under /clients router (GET /:id/analytics, POST /:id/assign-program)

export default router;

