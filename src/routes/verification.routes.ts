/**
 * Gym Presence Verification API.
 * POST /api/verification/gym-presence — image + GPS + uploadSource → verified, confidence, trustLevel, etc.
 * Uses OpenRouter vision API for gym detection; geofence + decision logic; temp file cleanup.
 */
import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { body, validationResult } from 'express-validator';
import { AuthRequest } from '../middleware/auth.middleware';
import { classifyGymSceneOpenRouter } from '../lib/openRouterGymDetection.service';
import { checkGeofence } from '../lib/geofence';
import { decideVerification, type UploadSource } from '../lib/gymVerificationDecision';
import GymPresenceVerification from '../models/GymPresenceVerification.model';

const router = Router();

const MAX_UPLOAD_MB = parseInt(process.env.MAX_UPLOAD_SIZE_MB || '5', 10) || 5;
const STORE_IMAGES = process.env.STORE_VERIFICATION_IMAGES === 'true';

const tempDir = path.join(os.tmpdir(), 'diettemple-verification');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, tempDir),
  filename: (_req, file, cb) => {
    const ext = (path.extname(file.originalname) || '').toLowerCase();
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? ext : '.jpg';
    const safe = `verify_${Date.now()}_${Math.random().toString(36).slice(2, 10)}${safeExt}`;
    cb(null, safe);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Invalid file type. Use JPEG, PNG or WebP.'));
  },
});

/** Simple rate limit: max 10 requests per user per minute. */
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 10;

function rateLimit(userId: string): boolean {
  const now = Date.now();
  let times = rateLimitMap.get(userId) || [];
  times = times.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (times.length >= RATE_LIMIT_MAX) return false;
  times.push(now);
  rateLimitMap.set(userId, times);
  return true;
}

/** POST /api/verification/gym-presence — multipart: image, latitude, longitude, accuracy?, timestamp? */
router.post(
  '/gym-presence',
  upload.single('image'),
  [
    body('latitude').optional().isFloat({ min: -90, max: 90 }).withMessage('latitude must be between -90 and 90'),
    body('longitude').optional().isFloat({ min: -180, max: 180 }).withMessage('longitude must be between -180 and 180'),
    body('accuracy').optional().isFloat({ min: 0 }).withMessage('accuracy must be a positive number'),
    body('timestamp').optional().isISO8601().withMessage('timestamp must be ISO8601'),
    body('uploadSource').optional().isIn(['camera', 'gallery']).withMessage('uploadSource must be camera or gallery'),
  ],
  async (req: AuthRequest, res: Response) => {
    let filePath: string | null = req.file?.path ?? null;

    try {
      const err = validationResult(req);
      if (!err.isEmpty()) {
        if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
        return res.status(400).json({
          message: err.array()[0]?.msg || 'Validation failed',
          errors: err.array(),
        });
      }

      if (!req.file) {
        return res.status(400).json({ message: 'Image is required.' });
      }

      const userId = req.user?._id?.toString();
      if (!userId) {
        if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
        return res.status(401).json({ message: 'Authentication required' });
      }

      if (!rateLimit(userId)) {
        if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
        return res.status(429).json({ message: 'Too many verification attempts. Try again in a minute.' });
      }

      const latitude = req.body.latitude != null ? Number(req.body.latitude) : undefined;
      const longitude = req.body.longitude != null ? Number(req.body.longitude) : undefined;
      const accuracy = req.body.accuracy != null ? Number(req.body.accuracy) : undefined;
      const clientTimestamp = req.body.timestamp ? new Date(req.body.timestamp) : undefined;
      const uploadSource: UploadSource =
        req.body.uploadSource === 'camera' || req.body.uploadSource === 'gallery' ? req.body.uploadSource : 'unknown';

      const geofence = checkGeofence(latitude, longitude);

      let classification;
      try {
        classification = await classifyGymSceneOpenRouter(req.file.path);
      } catch (e: any) {
        if (filePath && fs.existsSync(filePath)) {
          try {
            fs.unlinkSync(filePath);
          } catch (_) {}
        }
        console.error('[verification/gym-presence] Classification failed:', e?.message);
        const serverTimestamp = new Date();
        const safeChecks = {
          aiScene: false,
          gpsProvided: geofence.gpsProvided,
          geofenceMatch: geofence.geofenceMatch,
          nearestGymDistanceMeters: geofence.nearestGymDistanceMeters ?? undefined,
          uploadSource,
        };
        const safeThresholds = {
          threshold: parseFloat(process.env.GYM_VERIFY_THRESHOLD || '0.40'),
          margin: parseFloat(process.env.GYM_VERIFY_MARGIN || '0.05'),
        };
        await GymPresenceVerification.create({
          userId: req.user._id,
          verified: false,
          confidence: 0,
          topPrediction: 'unknown',
          reason: 'AI classification unavailable. Please try again.',
          checks: safeChecks,
          serverTimestamp,
          clientTimestamp: req.body.timestamp ? new Date(req.body.timestamp) : undefined,
          latitude,
          longitude,
          accuracy,
          manualReviewFlag: false,
          classificationModel: 'none',
          topPredictions: [],
          thresholds: safeThresholds,
          uploadSource,
          trustLevel: 'low',
          geofenceMatch: geofence.geofenceMatch,
          nearestGymDistanceMeters: geofence.nearestGymDistanceMeters ?? undefined,
        });
        return res.status(200).json({
          verified: false,
          confidence: 0,
          topPrediction: 'unknown',
          reason: 'AI classification unavailable. Please try again.',
          manualReviewFlag: false,
          trustLevel: 'low',
          topPredictions: [],
          model: 'none',
          thresholds: safeThresholds,
          checks: safeChecks,
          serverTimestamp: serverTimestamp.toISOString(),
        });
      }

      const decision = decideVerification({
        classification: {
          topPrediction: classification.topPrediction,
          confidence: classification.confidence,
          topPredictions: classification.topPredictions,
        },
        geofence,
        uploadSource,
      });

      const reason =
        classification.model === 'none'
          ? 'AI service unavailable or inconclusive.'
          : decision.reason;

      const serverTimestamp = new Date();
      const checks = {
        aiScene: classification.confidence > 0,
        gpsProvided: geofence.gpsProvided,
        geofenceMatch: geofence.geofenceMatch,
        nearestGymDistanceMeters: geofence.nearestGymDistanceMeters ?? undefined,
        uploadSource,
      };

      const doc = {
        userId: req.user._id,
        verified: decision.verified,
        confidence: classification.confidence,
        topPrediction: classification.topPrediction,
        reason,
        checks,
        serverTimestamp,
        clientTimestamp,
        latitude,
        longitude,
        accuracy,
        manualReviewFlag: decision.manualReviewFlag,
        classificationModel: classification.model,
        topPredictions: classification.topPredictions,
        thresholds: decision.thresholds,
        uploadSource,
        trustLevel: decision.trustLevel,
        geofenceMatch: geofence.geofenceMatch,
        nearestGymDistanceMeters: geofence.nearestGymDistanceMeters ?? undefined,
        ...(STORE_IMAGES && filePath ? { imagePath: filePath } : {}),
      };

      await GymPresenceVerification.create(doc);

      if (!STORE_IMAGES && filePath && fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (_) {}
        filePath = null;
      }

      return res.status(200).json({
        verified: decision.verified,
        confidence: classification.confidence,
        topPrediction: classification.topPrediction,
        reason,
        manualReviewFlag: decision.manualReviewFlag,
        trustLevel: decision.trustLevel,
        topPredictions: classification.topPredictions,
        model: classification.model,
        thresholds: decision.thresholds,
        checks,
        serverTimestamp: serverTimestamp.toISOString(),
        ...(classification.modelResponses && { modelResponses: classification.modelResponses }),
      });
    } catch (e: any) {
      if (filePath && fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (_) {}
      }
      console.error('[verification/gym-presence]', e);
      return res.status(500).json({
        message: e?.message || 'Verification failed. Please try again.',
        verified: false,
        reason: 'Server error during verification.',
      });
    }
  }
);

export default router;
