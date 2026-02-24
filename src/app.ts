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
import paymentsRoutes from './routes/payments.routes';
import homeRoutes from './routes/home.routes';
import workoutRoutes from './routes/workout.routes';
import adminRoutes from './routes/admin.routes';
import meRoutes from './routes/me.routes';
import recipesRoutes from './routes/recipes.routes';
import checkinRoutes from './routes/checkin.routes';
import verificationRoutes from './routes/verification.routes';
import foodsRoutes from './routes/foods.routes';
import { authenticate } from './middleware/auth.middleware';
import { requireAdmin } from './middleware/admin.middleware';
import { requestLogger, errorLogger } from './middleware/logger.middleware';
import { getStoragePublicRoot } from './lib/mediaStorage';

if (!process.env.JWT_SECRET) {
  throw new Error('❌ CRITICAL: JWT_SECRET is missing. Set it in .env or Vercel environment variables.');
}
if (process.env.JWT_SECRET.length < 32) {
  console.warn('⚠️  JWT_SECRET should be at least 32 characters.');
}

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Storage: public media served at /media
try {
  const storagePublicRoot = getStoragePublicRoot();
  const mediaSubdirs = ['users/avatars', 'progress/before-after', 'products', 'exercises/videos', 'exercises/thumbs', 'gym-checkins'];
  mediaSubdirs.forEach((sub) => {
    const dir = path.join(storagePublicRoot, sub);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
  const mediaHeaders = (res: any, filePath: string) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (/avatar_\d+\.webp|video_\d+\.mp4|_\d+\.(webp|jpg|jpeg|png)/.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  };
  app.use('/media', express.static(storagePublicRoot, { setHeaders: mediaHeaders }));
} catch (e) {
  console.warn('Media storage init skipped (e.g. serverless):', (e as Error).message);
}

// Legacy video storage
try {
  const videoStoragePath = path.resolve(__dirname, '../storage/video');
  if (!fs.existsSync(videoStoragePath)) {
    fs.mkdirSync(videoStoragePath, { recursive: true });
  }
  const videoHeaders = (res: any, filePath: string) => {
    if (filePath.endsWith('.mp4')) res.setHeader('Content-Type', 'video/mp4');
    else if (filePath.endsWith('.webm')) res.setHeader('Content-Type', 'video/webm');
    res.setHeader('Access-Control-Allow-Origin', '*');
  };
  app.use('/api/videos', express.static(videoStoragePath, { setHeaders: videoHeaders }));
  app.use('/videos', express.static(videoStoragePath, { setHeaders: videoHeaders }));
  app.get('/videos/exercises/:muscleGroup/:filename', (req, res) => {
    const { muscleGroup, filename } = req.params;
    const possiblePaths = [
      path.join(videoStoragePath, filename),
      path.join(videoStoragePath, `${muscleGroup}-${filename}`),
      path.join(videoStoragePath, `exercise-${filename}`),
    ];
    for (const filePath of possiblePaths) {
      if (fs.existsSync(filePath)) {
        return res.sendFile(filePath);
      }
    }
    res.status(404).json({ message: 'Video not found' });
  });
} catch (e) {
  console.warn('Video storage init skipped:', (e as Error).message);
}

app.use(requestLogger);

app.use('/api/auth', authRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/favorites', favoritesRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/promo', promoRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/home', authenticate, homeRoutes);
app.use('/api/workout', workoutRoutes);
app.use('/api/checkin', authenticate, checkinRoutes);
app.use('/api/verification', authenticate, verificationRoutes);
app.use('/api/me', authenticate, meRoutes);
app.use('/api/foods', authenticate, foodsRoutes);
app.use('/api/recipes', recipesRoutes);
app.use('/api/admin', authenticate, requireAdmin, adminRoutes);

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
