/**
 * Client side of the complaints / support center. Mounted behind `authenticate`; every query is scoped to the caller.
 *   GET  /api/complaints/unread-count
 *   GET  /api/complaints
 *   POST /api/complaints                      multipart: category, subject, description, attachments[] (images)
 *   GET  /api/complaints/:id                  full conversation (internal admin notes are never included)
 *   POST /api/complaints/:id/messages         multipart: body, attachments[]
 *   GET  /api/complaints/:id/attachments/:attachmentId
 */
import { Router, Response, NextFunction } from 'express';
import multer from 'multer';
import { AuthRequest } from '../middleware/auth.middleware';
import { rateLimit } from '../middleware/rateLimit.middleware';
import { AttachmentError, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS } from '../services/attachments';
import {
  ComplaintError, createComplaint, getForClient, listForClient, openAttachment, replyAsClient, serializeForClient, unreadCountForClient,
} from '../services/complaint.service';

const router = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_ATTACHMENT_BYTES, files: MAX_ATTACHMENTS } }).array('attachments', MAX_ATTACHMENTS);
const withUpload = (req: AuthRequest, res: Response, next: NextFunction) =>
  upload(req as any, res, (err: unknown) => {
    if (!err) return next();
    const code = (err as { code?: string }).code;
    const message =
      code === 'LIMIT_FILE_SIZE'
        ? 'Image trop lourde (5 Mo maximum).'
        : code === 'LIMIT_FILE_COUNT' || code === 'LIMIT_UNEXPECTED_FILE'
          ? `Maximum ${MAX_ATTACHMENTS} images par message.`
          : "Impossible de lire l'envoi.";
    res.status(400).json({ message });
  });

const createLimiter = rateLimit({ name: 'complaint-create', windowMs: 60 * 60 * 1000, max: 10, message: 'Trop de réclamations envoyées. Réessayez plus tard.' });
const replyLimiter = rateLimit({ name: 'complaint-reply', windowMs: 60 * 60 * 1000, max: 60, message: 'Trop de messages envoyés. Réessayez plus tard.' });

const files = (req: AuthRequest) => (req as any).files as Array<{ originalname: string; buffer: Buffer; size: number }> | undefined;

function fail(res: Response, e: unknown) {
  if (e instanceof ComplaintError) return res.status(e.httpStatus).json({ code: e.code, message: e.message });
  if (e instanceof AttachmentError) return res.status(400).json({ code: 'attachment', message: e.message });
  console.error('[complaints]', e);
  return res.status(500).json({ message: 'Une erreur est survenue. Réessayez dans un instant.' });
}

router.get('/unread-count', async (req: AuthRequest, res) => {
  try {
    res.json({ unread: await unreadCountForClient(req.user._id) });
  } catch (e) {
    fail(res, e);
  }
});

router.get('/', async (req: AuthRequest, res) => {
  try {
    res.json({ complaints: await listForClient(req.user._id) });
  } catch (e) {
    fail(res, e);
  }
});

router.post('/', createLimiter, withUpload, async (req: AuthRequest, res) => {
  try {
    const c = await createComplaint({
      userId: req.user._id,
      category: req.body?.category,
      subject: req.body?.subject,
      description: req.body?.description,
      files: files(req),
    });
    res.status(201).json({ complaint: serializeForClient(c) });
  } catch (e) {
    fail(res, e);
  }
});

router.get('/:id', async (req: AuthRequest, res) => {
  try {
    res.json({ complaint: serializeForClient(await getForClient(req.user._id, req.params.id)) });
  } catch (e) {
    fail(res, e);
  }
});

router.post('/:id/messages', replyLimiter, withUpload, async (req: AuthRequest, res) => {
  try {
    const c = await replyAsClient(req.user._id, req.params.id, req.body?.body, files(req));
    res.status(201).json({ complaint: serializeForClient(c) });
  } catch (e) {
    fail(res, e);
  }
});

router.get('/:id/attachments/:attachmentId', async (req: AuthRequest, res) => {
  try {
    const f = await openAttachment(req.params.id, req.params.attachmentId, { userId: req.user._id, isAdmin: false });
    res.setHeader('Content-Type', f.mime);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(f.name)}"`);
    f.stream.on('error', () => res.destroy());
    f.stream.pipe(res);
  } catch (e) {
    fail(res, e);
  }
});

export default router;
