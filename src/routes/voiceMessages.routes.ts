/**
 * Client side of exercise voice messages (mounted behind authenticate). Everything is scoped to the caller.
 *   GET  /api/voice-messages/unread-count              { unread, byExercise }
 *   GET  /api/voice-messages/exercises/:exerciseId     the coach's messages for this exercise
 *   POST /api/voice-messages/read                      { ids: [...] }
 *   GET  /api/voice-messages/:id/audio                 Range-capable private stream
 */
import { Router } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { listForClient, markRead, serialize, unreadForClient } from '../services/voice.service';
import { fail, streamAudio } from './voiceMessages.shared';

const router = Router();

router.get('/unread-count', async (req: AuthRequest, res) => {
  try {
    res.json(await unreadForClient(req.user._id));
  } catch (e) {
    fail(res, e);
  }
});

router.get('/exercises/:exerciseId', async (req: AuthRequest, res) => {
  try {
    const list = await listForClient(req.user._id, req.params.exerciseId);
    res.json({ messages: list.map((m) => serialize(m, false)) });
  } catch (e) {
    fail(res, e);
  }
});

router.post('/read', async (req: AuthRequest, res) => {
  try {
    res.json({ updated: await markRead(req.user._id, req.body?.ids) });
  } catch (e) {
    fail(res, e);
  }
});

router.get('/:id/audio', async (req: AuthRequest, res) => {
  try {
    await streamAudio(req, res, req.params.id, { userId: req.user._id, isAdmin: false });
  } catch (e) {
    fail(res, e);
  }
});

export default router;
