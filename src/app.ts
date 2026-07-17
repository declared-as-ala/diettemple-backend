/**
 * Express app factory — used by both local server (index.ts) and Vercel serverless (api/index.ts).
 * Do not call mongoose.connect() or app.listen() here.
 */
import dotenv from 'dotenv';
import path from 'path';

const envPath = path.resolve(__dirname, '../.env');
const result = dotenv.config({ path: envPath });
if (result.error) {
  dotenv.config();
}

import express from 'express';
import cors from 'cors';
import fs from 'fs';
import authRoutes from './routes/auth.routes';
import productsRoutes from './routes/products.routes';
import favoritesRoutes from './routes/favorites.routes';
import cartRoutes from './routes/cart.routes';
import ordersRoutes from './routes/orders.routes';
import promoRoutes from './routes/promo.routes';
import homeRoutes from './routes/home.routes';
import workoutRoutes from './routes/workout.routes';
import exercisesRoutes from './routes/exercises.routes';
import adminRoutes from './routes/admin.routes';
import meRoutes from './routes/me.routes';
import recipesRoutes from './routes/recipes.routes';
import workoutPlanAdminRoutes from './routes/admin/workoutPlan.routes';
import checkinRoutes from './routes/checkin.routes';
import verificationRoutes from './routes/verification.routes';
import foodsRoutes from './routes/foods.routes';
import leadsRoutes from './routes/leads.routes';
import landingRoutes from './routes/landing.routes';
import supportRoutes from './routes/support.routes';
import { authenticate } from './middleware/auth.middleware';
import { requireAdmin, requireAdminOrEmployee } from './middleware/admin.middleware';
import { requestLogger, errorLogger } from './middleware/logger.middleware';
import { requestTimeoutMiddleware } from './middleware/requestTimeout.middleware';
// mediaStorage helpers used by upload routes (not app.ts itself)

if (!process.env.JWT_SECRET) {
  throw new Error('❌ CRITICAL: JWT_SECRET is missing. Set it in .env or Vercel environment variables.');
}
if (process.env.JWT_SECRET.length < 32) {
  console.warn('⚠️  JWT_SECRET should be at least 32 characters.');
}

const app = express();
app.set('etag', false); // Disable ETags — always return 200 with fresh data, never 304

// CORS: allow requests from any origin (admin, mobile, web). Restrict via CORS_ORIGIN in production if needed.
const corsOrigin = process.env.CORS_ORIGIN;
app.use(
  cors({
    origin: corsOrigin === undefined || corsOrigin === '' ? true : corsOrigin.split(',').map((o) => o.trim()),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
    credentials: true,
  })
);
// Higher limit for scan-meal (base64 image: 6MB raw → ~8MB base64 + overhead)
app.use('/api/me/nutrition/scan-meal', express.json({ limit: '12mb' }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Fail fast before platform 504 (Vercel maxDuration)
app.use(requestTimeoutMiddleware);

// ── Storage: MinIO owns all files ────────────────────────────────────────────
// All uploads (images, videos) go directly to MinIO via minioUpload.ts helpers.
// Caddy proxies /media/* and /videos/* to the MinIO container.
// Express serves NO static files — it is API-only.
// MinIO buckets are initialised in index.ts after MongoDB connects.

app.use(requestLogger);

app.use('/api/auth', authRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/favorites', favoritesRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/promo', promoRoutes);
app.use('/api/home', authenticate, homeRoutes);
app.use('/api/workout', workoutRoutes);
app.use('/api/exercises', exercisesRoutes);
app.use('/api/checkin', authenticate, checkinRoutes);
app.use('/api/verification', authenticate, verificationRoutes);
app.use('/api/me', authenticate, meRoutes);
app.use('/api/users/me', authenticate, meRoutes);
app.use('/api/admin', authenticate, requireAdminOrEmployee, adminRoutes);
app.use('/api/admin/workout-plan', authenticate, requireAdminOrEmployee, workoutPlanAdminRoutes);
app.use('/api/foods', authenticate, foodsRoutes);
app.use('/api/recipes', recipesRoutes);
app.use('/api/leads', leadsRoutes);
app.use('/api/landing', landingRoutes);
app.use('/api/support', supportRoutes);

app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'DietTemple API', health: '/health' });
});
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'DietTemple API is running' });
});
app.get('/health/db', async (req, res) => {
  try {
    const mongoose = (await import('mongoose')).default;
    const start = Date.now();
    await mongoose.connection.db?.admin().ping();
    const ms = Date.now() - start;
    res.json({ status: 'OK', db: 'connected', pingMs: ms });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    res.status(503).json({ status: 'error', db: 'disconnected', message });
  }
});

app.use((_req, res) => {
  res.status(404).json({ message: 'Not found', path: _req.path });
});
app.use(errorLogger);

export default app;
