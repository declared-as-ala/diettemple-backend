/**
 * Gym check-in: required before starting workout/reels.
 * POST /api/checkin/gym/start — sessionId + photo (multipart) + capturedAt, deviceInfo, optional gps
 * Server validates image (size, dimensions, screenshot heuristic) + AI gym classification.
 * GET /api/checkin/gym/status — verified for (sessionId, dateKey)
 */
import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { body, query, validationResult } from 'express-validator';
import GymCheckin from '../models/GymCheckin.model';
import { AuthRequest } from '../middleware/auth.middleware';
import { getStoragePublicRoot, toPublicUrl, sanitizeSegment } from '../lib/mediaStorage';
import { validateGymPhoto } from '../lib/gymVerify';
import fs from 'fs';

const router = Router();
const gymCheckinsRoot = path.join(getStoragePublicRoot(), 'gym-checkins');

/** In-memory failed attempt count per user/date (resets on success or new day). */
const gymVerifyAttempts = new Map<string, number>();

function getAttemptKey(userId: string, dateKey: string): string {
  return `${userId}_${dateKey}`;
}

function getAttemptCount(userId: string, dateKey: string): number {
  return gymVerifyAttempts.get(getAttemptKey(userId, dateKey)) ?? 0;
}

function incrementAttemptCount(userId: string, dateKey: string): number {
  const key = getAttemptKey(userId, dateKey);
  const next = (gymVerifyAttempts.get(key) ?? 0) + 1;
  gymVerifyAttempts.set(key, next);
  return next;
}

function clearAttemptCount(userId: string, dateKey: string): void {
  gymVerifyAttempts.delete(getAttemptKey(userId, dateKey));
}

const gymPhotoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const userId = (req as AuthRequest).user?._id?.toString();
    const dir = userId ? path.join(gymCheckinsRoot, sanitizeSegment(userId)) : gymCheckinsRoot;
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '').toLowerCase() || '.jpg';
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? ext : '.jpg';
    cb(null, `checkin_${Date.now()}${safeExt}`);
  },
});

const uploadPhoto = multer({
  storage: gymPhotoStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Type de fichier non autorisé. Utilisez une photo (JPEG/PNG/WebP).'));
  },
});

/** GET /api/checkin/gym/status?dateKey=YYYY-MM-DD — once per day: verified if any check-in for user+dateKey */
router.get(
  '/gym/status',
  [query('dateKey').optional().matches(/^\d{4}-\d{2}-\d{2}$/)],
  async (req: AuthRequest, res: Response) => {
    try {
      const err = validationResult(req);
      if (!err.isEmpty()) return res.status(400).json({ message: err.array()[0].msg });
      const userId = req.user!._id!;
      const dateKey = (req.query.dateKey as string) || getDateKeyLocal();
      const checkin = await GymCheckin.findOne({ userId, dateKey }).lean();
      res.json({
        verified: !!checkin,
        verifiedAt: (checkin as any)?.verifiedAt || null,
        proofUrl: (checkin as any)?.proofUrl || null,
      });
    } catch (e: unknown) {
      res.status(500).json({ message: (e as Error).message });
    }
  }
);

function getDateKeyLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** POST /api/checkin/gym/start — multipart: dateKey, photo (required), sessionId (optional, first of day), capturedAt, deviceInfo, gpsDistanceMeters */
router.post(
  '/gym/start',
  uploadPhoto.single('photo'),
  [
    body('sessionId').optional().isString(),
    body('dateKey').optional().matches(/^\d{4}-\d{2}-\d{2}$/),
    body('capturedAt').optional().isISO8601(),
    body('deviceInfo').optional().isString(),
    body('gpsDistanceMeters').optional().isNumeric(),
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const err = validationResult(req);
      if (!err.isEmpty()) return res.status(400).json({ message: err.array()[0].msg });
      if (!req.file) return res.status(400).json({ message: 'Photo requise pour la vérification.' });
      const userId = req.user!._id!;
      const sessionId = req.body.sessionId as string | undefined;
      const dateKey = (req.body.dateKey as string) || getDateKeyLocal();
      const gpsDistanceMeters = req.body.gpsDistanceMeters != null ? Number(req.body.gpsDistanceMeters) : undefined;

      const attemptCount = getAttemptCount(userId, dateKey);
      const relaxedThreshold = attemptCount >= 2;

      const verify = await validateGymPhoto(req.file.path, {
        gpsDistanceMeters,
        relaxedThreshold,
      });
      if (!verify.accepted) {
        if (req.file.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        const isProviderError = verify.reasonCode === 'provider_error';
        const nextAttemptCount = isProviderError ? getAttemptCount(userId, dateKey) : incrementAttemptCount(userId, dateKey);
        const nextAllowedMethod = nextAttemptCount >= 2 ? 'photo' as const : undefined;
        if (process.env.NODE_ENV !== 'production') {
          console.log('[checkin/gym] REJECTED', {
            reason: verify.reason,
            reasonCode: verify.reasonCode,
            aiScore: verify.aiScore,
            attemptCount: nextAttemptCount,
            isProviderError,
          });
        }
        if (isProviderError) {
          return res.status(503).json({
            verified: false,
            message: verify.reason,
            code: 'GYM_VERIFY_FAILED',
            reason: 'provider_error',
            tips: verify.tips ?? [],
            attemptCount: nextAttemptCount,
          });
        }
        return res.status(400).json({
          verified: false,
          message: verify.reason,
          code: 'GYM_VERIFY_FAILED',
          score: verify.aiScore,
          reason: verify.reasonCode,
          tips: verify.tips ?? [],
          attemptCount: nextAttemptCount,
          nextAllowedMethod,
        });
      }

      clearAttemptCount(userId, dateKey);
      const relativePath = path.relative(getStoragePublicRoot(), req.file.path).replace(/\\/g, '/');
      const proofUrl = toPublicUrl(relativePath);
      await GymCheckin.findOneAndUpdate(
        { userId, dateKey },
        {
          $set: {
            userId,
            dateKey,
            ...(sessionId ? { sessionId } : {}),
            verifiedAt: new Date(),
            proofType: 'photo',
            proofUrl,
            deviceInfo: req.body.deviceInfo,
            aiScore: verify.aiScore,
            gpsDistance: verify.gpsDistance,
            method: 'photo',
          },
        },
        { upsert: true, new: true }
      );
      const checkin = await GymCheckin.findOne({ userId, dateKey }).lean();
      console.log('[checkin/gym] ACCEPTED', { userId, dateKey, aiScore: verify.aiScore, gpsDistance: verify.gpsDistance, acceptedReason: 'gym scene' });
      res.status(201).json({
        verified: true,
        checkinId: (checkin as any)?._id,
        verifiedAt: (checkin as any)?.verifiedAt,
      });
    } catch (e: unknown) {
      if (req.file?.path && fs.existsSync(req.file.path)) try { fs.unlinkSync(req.file.path); } catch (_) {}
      res.status(500).json({ message: (e as Error).message });
    }
  }
);

export default router;
