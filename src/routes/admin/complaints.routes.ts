/**
 * Admin side of the complaints module (admin role only; mounted behind authenticate + requireAdmin).
 *   GET   /api/admin/complaints/stats
 *   GET   /api/admin/complaints?status=&category=&priority=&clientId=&q=&from=&to=&unread=1
 *   GET   /api/admin/complaints/:id
 *   POST  /api/admin/complaints/:id/reply       multipart: body, status?, attachments[]
 *   POST  /api/admin/complaints/:id/notes       { body }  internal, invisible to the client
 *   PATCH /api/admin/complaints/:id             { status?, priority? }
 *   GET   /api/admin/complaints/:id/attachments/:attachmentId
 */
import { Router, Response, NextFunction } from 'express';
import multer from 'multer';
import { AuthRequest } from '../../middleware/auth.middleware';
import { requireAdmin } from '../../middleware/admin.middleware';
import { AttachmentError, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS } from '../../services/attachments';
import {
  addInternalNote, ComplaintError, getForAdmin, listForAdmin, openAttachment, replyAsAdmin, serializeForAdmin, statsForAdmin, updateComplaint,
} from '../../services/complaint.service';

const router = Router();
router.use(requireAdmin);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_ATTACHMENT_BYTES, files: MAX_ATTACHMENTS } }).array('attachments', MAX_ATTACHMENTS);
const withUpload = (req: AuthRequest, res: Response, next: NextFunction) =>
  upload(req as any, res, (err: unknown) =>
    err ? res.status(400).json({ message: 'Image trop lourde (5 Mo) ou trop nombreuse (4 maximum).' }) : next()
  );

function fail(res: Response, e: unknown) {
  if (e instanceof ComplaintError) return res.status(e.httpStatus).json({ code: e.code, message: e.message });
  if (e instanceof AttachmentError) return res.status(400).json({ code: 'attachment', message: e.message });
  console.error('[admin/complaints]', e);
  return res.status(500).json({ message: 'Une erreur est survenue.' });
}

const detail = async (id: string, markRead = true) => {
  const { complaint, client } = await getForAdmin(id, { markRead });
  return serializeForAdmin(complaint, client);
};

router.get('/stats', async (_req, res) => {
  try {
    res.json({ stats: await statsForAdmin() });
  } catch (e) {
    fail(res, e);
  }
});

router.get('/', async (req: AuthRequest, res) => {
  try {
    const q = req.query as Record<string, string | undefined>;
    res.json({
      complaints: await listForAdmin({
        status: q.status, category: q.category, priority: q.priority, clientId: q.clientId, q: q.q, from: q.from, to: q.to, unread: q.unread === '1',
      }),
    });
  } catch (e) {
    fail(res, e);
  }
});

router.get('/:id', async (req: AuthRequest, res) => {
  try {
    res.json({ complaint: await detail(req.params.id) });
  } catch (e) {
    fail(res, e);
  }
});

router.post('/:id/reply', withUpload, async (req: AuthRequest, res) => {
  try {
    await replyAsAdmin(req.user._id, req.params.id, { body: req.body?.body, status: req.body?.status, files: (req as any).files });
    res.status(201).json({ complaint: await detail(req.params.id, false) });
  } catch (e) {
    fail(res, e);
  }
});

router.post('/:id/notes', async (req: AuthRequest, res) => {
  try {
    await addInternalNote(req.user._id, req.params.id, req.body?.body);
    res.status(201).json({ complaint: await detail(req.params.id, false) });
  } catch (e) {
    fail(res, e);
  }
});

router.patch('/:id', async (req: AuthRequest, res) => {
  try {
    await updateComplaint(req.params.id, { status: req.body?.status, priority: req.body?.priority });
    res.json({ complaint: await detail(req.params.id, false) });
  } catch (e) {
    fail(res, e);
  }
});

router.get('/:id/attachments/:attachmentId', async (req: AuthRequest, res) => {
  try {
    const f = await openAttachment(req.params.id, req.params.attachmentId, { userId: req.user._id, isAdmin: true });
    res.setHeader('Content-Type', f.mime);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    f.stream.on('error', () => res.destroy());
    f.stream.pipe(res);
  } catch (e) {
    fail(res, e);
  }
});

export default router;
