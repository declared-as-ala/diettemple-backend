/**
 * Admin side of exercise voice messages (mounted behind authenticate + requireAdmin).
 *   GET    /api/admin/voice-messages/clients/:clientId                          per-exercise counters
 *   GET    /api/admin/voice-messages/clients/:clientId/exercises/:exerciseId    conversation
 *   POST   /api/admin/voice-messages/clients/:clientId/exercises/:exerciseId    multipart: audio (file), durationSec, body, sessionId, programId
 *   GET    /api/admin/voice-messages/:id/audio
 *   DELETE /api/admin/voice-messages/:id
 */
import { Router, Response, NextFunction } from 'express';
import multer from 'multer';
import { AuthRequest } from '../../middleware/auth.middleware';
import { rateLimit } from '../../middleware/rateLimit.middleware';
import { MAX_AUDIO_BYTES } from '../../services/audio';
import { createMessage, deleteMessage, listForAdmin, listForExerciseAdmin, serialize, summaryForAdmin, summaryForExercises } from '../../services/voice.service';
import { fail, streamAudio } from '../voiceMessages.shared';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_AUDIO_BYTES, files: 1 } }).single('audio');
const withUpload = (req: AuthRequest, res: Response, next: NextFunction) =>
  upload(req as any, res, (err: unknown) => {
    if (!err) return next();
    const code = (err as { code?: string }).code;
    res.status(400).json({ message: code === 'LIMIT_FILE_SIZE' ? 'Message vocal trop lourd (8 Mo maximum).' : "Impossible de lire l'enregistrement." });
  });
const sendLimiter = rateLimit({ name: 'voice-send', windowMs: 60 * 60 * 1000, max: 120, message: 'Trop de messages envoyés. Réessayez plus tard.' });

router.get('/exercises', async (_req: AuthRequest, res) => {
  try {
    res.json({ exercises: await summaryForExercises() });
  } catch (e) {
    fail(res, e);
  }
});

router.get('/exercises/:exerciseId', async (req: AuthRequest, res) => {
  try {
    res.json({ messages: (await listForExerciseAdmin(req.params.exerciseId)).map((m) => serialize(m, true)) });
  } catch (e) {
    fail(res, e);
  }
});

router.post('/exercises/:exerciseId', sendLimiter, withUpload, async (req: AuthRequest, res) => {
  try {
    const msg = await createMessage(req.user._id, { clientId: null, exerciseId: req.params.exerciseId, body: req.body?.body, durationSec: req.body?.durationSec, audio: (req as any).file });
    res.status(201).json({ message: serialize(msg, true) });
  } catch (e) {
    fail(res, e);
  }
});

router.get('/clients/:clientId', async (req: AuthRequest, res) => {
  try {
    res.json({ exercises: await summaryForAdmin(req.params.clientId) });
  } catch (e) {
    fail(res, e);
  }
});

router.get('/clients/:clientId/exercises/:exerciseId', async (req: AuthRequest, res) => {
  try {
    const list = await listForAdmin(req.params.clientId, req.params.exerciseId);
    res.json({ messages: list.map((m) => serialize(m, true)) });
  } catch (e) {
    fail(res, e);
  }
});

router.post('/clients/:clientId/exercises/:exerciseId', sendLimiter, withUpload, async (req: AuthRequest, res) => {
  try {
    const msg = await createMessage(req.user._id, {
      clientId: req.params.clientId,
      exerciseId: req.params.exerciseId,
      sessionId: req.body?.sessionId,
      programId: req.body?.programId,
      body: req.body?.body,
      durationSec: req.body?.durationSec,
      audio: (req as any).file,
    });
    res.status(201).json({ message: serialize(msg, true) });
  } catch (e) {
    fail(res, e);
  }
});

router.get('/:id/audio', async (req: AuthRequest, res) => {
  try {
    await streamAudio(req, res, req.params.id, { userId: req.user._id, isAdmin: true });
  } catch (e) {
    fail(res, e);
  }
});

router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    await deleteMessage(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    fail(res, e);
  }
});

export default router;
