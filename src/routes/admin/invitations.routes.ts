/**
 * Admin: client invitations.
 *   GET    /api/admin/invitations?status=&q=   list (status: pending|sent|accepted|expired|revoked|failed)
 *   POST   /api/admin/invitations              { email, name? }  → create + send
 *   POST   /api/admin/invitations/:id/resend   new token + new expiry, previous links stop working
 *   POST   /api/admin/invitations/:id/revoke
 * Mounted behind authenticate + requireAdmin (employees cannot invite clients).
 */
import { Router, Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../../middleware/auth.middleware';
import { requireAdmin } from '../../middleware/admin.middleware';
import { rateLimit } from '../../middleware/rateLimit.middleware';
import ClientInvitation from '../../models/ClientInvitation.model';
import {
  createInvitation,
  InvitationError,
  listInvitations,
  resendInvitation,
  revokeInvitation,
  serializeInvitation,
} from '../../services/invitation.service';

const router = Router();
router.use(requireAdmin);

// Sending emails is the abusable action: 30 per hour per admin address is far above any real use.
const sendLimiter = rateLimit({ name: 'invite-send', windowMs: 60 * 60 * 1000, max: 30, message: "Trop d'invitations envoyées. Réessayez plus tard." });

const handle = (res: Response, e: unknown) => {
  if (e instanceof InvitationError) {
    return res.status(e.httpStatus).json({ code: e.code, message: e.message, ...(e.extra ?? {}) });
  }
  console.error('[invitations]', e);
  return res.status(500).json({ message: "Erreur interne lors du traitement de l'invitation." });
};

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    const invitations = await listInvitations({ status, q });
    res.json({ invitations });
  } catch (e) {
    handle(res, e);
  }
});

router.post('/', sendLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const inv = await createInvitation({ email: req.body?.email, name: req.body?.name, invitedBy: req.user._id });
    const out = serializeInvitation(inv);
    // The invitation exists even if the email could not be sent: the admin sees "Échec d'envoi" and can resend.
    res.status(inv.status === 'failed' ? 502 : 201).json({ invitation: out, ...(inv.status === 'failed' ? { message: "L'invitation a été créée mais l'e-mail n'a pas pu être envoyé." } : {}) });
  } catch (e) {
    handle(res, e);
  }
});

router.post('/:id/resend', sendLimiter, async (req: AuthRequest, res: Response) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Identifiant invalide.' });
    const inv = await resendInvitation(req.params.id, req.user._id);
    res.status(inv.status === 'failed' ? 502 : 200).json({ invitation: serializeInvitation(inv), ...(inv.status === 'failed' ? { message: "L'e-mail n'a pas pu être envoyé." } : {}) });
  } catch (e) {
    handle(res, e);
  }
});

router.post('/:id/revoke', async (req: AuthRequest, res: Response) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Identifiant invalide.' });
    const inv = await revokeInvitation(req.params.id, req.user._id);
    res.json({ invitation: serializeInvitation(inv) });
  } catch (e) {
    handle(res, e);
  }
});

router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Identifiant invalide.' });
    const inv = await ClientInvitation.findById(req.params.id);
    if (!inv) return res.status(404).json({ message: 'Invitation introuvable.' });
    res.json({ invitation: serializeInvitation(inv), events: inv.events });
  } catch (e) {
    handle(res, e);
  }
});

export default router;
