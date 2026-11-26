/**
 * Client onboarding through email invitations.
 *
 * Security rules implemented here:
 *  - tokens are 256-bit random values; only their SHA-256 hash is stored;
 *  - a token works once (atomic claim) and a re-send replaces the previous token;
 *  - the account is created only on acceptance, with the app's existing bcrypt hashing, and never has a password sent by email;
 *  - emails are normalized; one open invitation per email (database partial unique index) and no invitation for an existing account.
 */
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import ClientInvitation, { type IClientInvitation, type InvitationStatus } from '../models/ClientInvitation.model';
import User from '../models/User.model';
import AuditLog from '../models/AuditLog.model';
import { buildInvitationEmail } from './invitationEmail';
import { getMailer } from './mailer';

export const DEFAULT_EXPIRY_HOURS = 48;
const MAX_PREVIOUS_HASHES = 10;

export const inviteExpiryHours = (): number => {
  const n = Number(process.env.INVITE_EXPIRY_HOURS);
  return Number.isFinite(n) && n >= 1 && n <= 24 * 30 ? n : DEFAULT_EXPIRY_HOURS;
};

export const publicBaseUrl = (): string =>
  (process.env.INVITATION_BASE_URL || process.env.API_BASE_URL || 'https://api.diettemple.tn').replace(/\/$/, '');

export const activationUrl = (token: string): string => `${publicBaseUrl()}/activate?token=${encodeURIComponent(token)}`;

export function normalizeEmail(input: unknown): string {
  return typeof input === 'string' ? input.trim().toLowerCase() : '';
}

/** Case-insensitive exact match: also catches older accounts saved with a different letter case. */
const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const emailRegex = (email: string): RegExp => new RegExp(`^${escapeRegex(email)}$`, 'i');
export const accountExists = async (email: string): Promise<boolean> => !!(await User.exists({ email: emailRegex(email) }));

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const isValidEmail = (email: string): boolean => email.length <= 254 && EMAIL_RE.test(email);

export function generateToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Password rules shown on the activation page and enforced by the server. */
export const PASSWORD_RULES = [
  { id: 'length', label: 'Au moins 8 caractères', test: (p: string) => p.length >= 8 },
  { id: 'letter', label: 'Au moins une lettre', test: (p: string) => /[A-Za-zÀ-ÿ]/.test(p) },
  { id: 'digit', label: 'Au moins un chiffre', test: (p: string) => /\d/.test(p) },
] as const;

export function passwordProblems(password: unknown): string[] {
  if (typeof password !== 'string') return ['Mot de passe invalide'];
  if (password.length > 128) return ['Mot de passe trop long (128 caractères maximum)'];
  return PASSWORD_RULES.filter((r) => !r.test(password)).map((r) => r.label);
}

export type DisplayStatus = InvitationStatus;

/** Stored status + time: a "sent" invitation past its expiry is shown (and treated) as expired. */
export function displayStatus(inv: Pick<IClientInvitation, 'status' | 'expiresAt'>, now = new Date()): DisplayStatus {
  if ((inv.status === 'sent' || inv.status === 'pending' || inv.status === 'failed') && inv.expiresAt.getTime() <= now.getTime()) return 'expired';
  return inv.status;
}

export class InvitationError extends Error {
  constructor(public code: string, message: string, public httpStatus = 400, public extra?: Record<string, unknown>) {
    super(message);
    this.name = 'InvitationError';
  }
}

// ───────────────────────── sending ─────────────────────────

async function deliver(inv: IClientInvitation, token: string, by?: mongoose.Types.ObjectId): Promise<IClientInvitation> {
  const mail = buildInvitationEmail({
    to: inv.email,
    name: inv.name,
    activationUrl: activationUrl(token),
    expiresAt: inv.expiresAt,
    expiryHours: inviteExpiryHours(),
  });
  try {
    await (await getMailer()).send(mail);
    inv.status = 'sent';
    inv.sentAt = new Date();
    inv.sendCount += 1;
    inv.lastSendError = undefined;
    inv.events.push({ type: 'sent', at: new Date(), by });
  } catch (e) {
    inv.status = 'failed';
    inv.lastSendError = String((e as Error).message || e).slice(0, 300);
    inv.events.push({ type: 'send_failed', at: new Date(), by, note: inv.lastSendError });
  }
  await inv.save();
  return inv;
}

/** Creates the invitation (pending), then sends the email. `existing` rows for the same email are handled first. */
export async function createInvitation(input: { email: unknown; name?: unknown; invitedBy: mongoose.Types.ObjectId }): Promise<IClientInvitation> {
  const email = normalizeEmail(input.email);
  if (!isValidEmail(email)) throw new InvitationError('invalid_email', "Adresse e-mail invalide.");

  if (await accountExists(email)) {
    throw new InvitationError('account_exists', 'Un compte existe déjà avec cette adresse e-mail.', 409);
  }

  const now = new Date();
  // An open invitation that already expired is closed so a new one can be created.
  await ClientInvitation.updateMany(
    { email, status: { $in: ['pending', 'sent', 'failed'] }, expiresAt: { $lte: now } },
    { $set: { status: 'expired' }, $push: { events: { type: 'expired', at: now } } }
  );
  const open = await ClientInvitation.findOne({ email, status: { $in: ['pending', 'sent', 'failed'] } });
  if (open) {
    throw new InvitationError('already_invited', 'Une invitation est déjà en cours pour cette adresse. Vous pouvez la renvoyer.', 409, { invitationId: String(open._id) });
  }

  const name = typeof input.name === 'string' && input.name.trim() ? input.name.trim().slice(0, 80) : undefined;
  const token = generateToken();
  let inv: IClientInvitation;
  try {
    inv = await ClientInvitation.create({
      email,
      name,
      status: 'pending',
      tokenHash: hashToken(token),
      expiresAt: new Date(now.getTime() + inviteExpiryHours() * 3600_000),
      invitedBy: input.invitedBy,
      events: [{ type: 'created', at: now, by: input.invitedBy }],
    });
  } catch (e: any) {
    if (e?.code === 11000) throw new InvitationError('already_invited', 'Une invitation est déjà en cours pour cette adresse.', 409);
    throw e;
  }
  return deliver(inv, token, input.invitedBy);
}

/** New token + new expiry; every previous link stops working. */
export async function resendInvitation(id: string, by: mongoose.Types.ObjectId): Promise<IClientInvitation> {
  const inv = await ClientInvitation.findById(id);
  if (!inv) throw new InvitationError('not_found', 'Invitation introuvable.', 404);
  if (inv.status === 'accepted') throw new InvitationError('already_accepted', 'Cette invitation a déjà été acceptée.', 409);
  if (inv.status === 'revoked') throw new InvitationError('revoked', 'Cette invitation a été révoquée. Créez-en une nouvelle.', 409);
  if (await accountExists(inv.email)) {
    throw new InvitationError('account_exists', 'Un compte existe déjà avec cette adresse e-mail.', 409);
  }

  if (inv.tokenHash) {
    inv.previousTokenHashes = [...inv.previousTokenHashes, inv.tokenHash].slice(-MAX_PREVIOUS_HASHES);
  }
  const token = generateToken();
  inv.tokenHash = hashToken(token);
  inv.expiresAt = new Date(Date.now() + inviteExpiryHours() * 3600_000);
  inv.status = 'pending';
  inv.events.push({ type: 'resent', at: new Date(), by });
  return deliver(inv, token, by);
}

export async function revokeInvitation(id: string, by: mongoose.Types.ObjectId): Promise<IClientInvitation> {
  const inv = await ClientInvitation.findById(id);
  if (!inv) throw new InvitationError('not_found', 'Invitation introuvable.', 404);
  if (inv.status === 'accepted') throw new InvitationError('already_accepted', 'Cette invitation a déjà été acceptée.', 409);
  if (inv.status === 'revoked') return inv;
  inv.status = 'revoked';
  inv.revokedAt = new Date();
  inv.events.push({ type: 'revoked', at: new Date(), by });
  await inv.save();
  return inv;
}

// ───────────────────────── activation ─────────────────────────

export type TokenCheck =
  | { ok: true; invitation: IClientInvitation }
  | { ok: false; reason: 'invalid' | 'expired' | 'revoked' | 'used' | 'replaced' | 'account_exists' };

/** Read-only check used by the activation page. Never reveals whether an email exists to a caller without a valid token. */
export async function checkToken(token: unknown): Promise<TokenCheck> {
  if (typeof token !== 'string' || token.length < 20 || token.length > 200) return { ok: false, reason: 'invalid' };
  const hash = hashToken(token);

  const current = await ClientInvitation.findOne({ tokenHash: hash });
  if (current) {
    if (current.status === 'revoked') return { ok: false, reason: 'revoked' };
    if (displayStatus(current) === 'expired') return { ok: false, reason: 'expired' };
    if (current.status === 'accepted') return { ok: false, reason: 'used' };
    if (await accountExists(current.email)) return { ok: false, reason: 'account_exists' };
    return { ok: true, invitation: current };
  }
  if (await ClientInvitation.exists({ consumedTokenHash: hash })) return { ok: false, reason: 'used' };
  if (await ClientInvitation.exists({ previousTokenHashes: hash })) return { ok: false, reason: 'replaced' };
  return { ok: false, reason: 'invalid' };
}

export const REASON_MESSAGES: Record<string, string> = {
  invalid: "Ce lien d'activation n'est pas valide.",
  expired: "Ce lien d'activation a expiré. Demandez une nouvelle invitation à votre coach.",
  revoked: "Cette invitation a été annulée. Contactez votre coach si besoin.",
  used: "Ce lien a déjà été utilisé : votre compte est déjà activé. Vous pouvez vous connecter à l'application.",
  replaced: "Ce lien a été remplacé par une invitation plus récente. Utilisez le dernier e-mail reçu.",
  account_exists: "Un compte existe déjà avec cette adresse e-mail. Vous pouvez vous connecter à l'application.",
};

/** Sets the password and activates the account. Atomic: one successful call per token, whatever the concurrency. */
export async function acceptInvitation(token: unknown, password: unknown, confirmPassword: unknown) {
  const problems = passwordProblems(password);
  if (problems.length) throw new InvitationError('weak_password', `Mot de passe trop faible : ${problems.join(', ').toLowerCase()}.`, 400, { problems });
  if (password !== confirmPassword) throw new InvitationError('mismatch', 'Les deux mots de passe ne correspondent pas.');

  const check = await checkToken(token);
  if (!check.ok) throw new InvitationError(check.reason, REASON_MESSAGES[check.reason], check.reason === 'invalid' ? 400 : 410);

  const hash = hashToken(token as string);
  const now = new Date();
  // Atomic claim: only one request can flip the status and remove the token.
  const claimed = await ClientInvitation.findOneAndUpdate(
    { _id: check.invitation._id, tokenHash: hash, status: { $in: ['pending', 'sent', 'failed'] }, expiresAt: { $gt: now } },
    { $set: { status: 'accepted', acceptedAt: now, consumedTokenHash: hash }, $unset: { tokenHash: '' } },
    { new: false }
  );
  if (!claimed) throw new InvitationError('used', REASON_MESSAGES.used, 410);

  try {
    const passwordHash = await bcrypt.hash(password as string, 10);
    const user = await User.create({
      name: claimed.name || undefined,
      email: claimed.email,
      passwordHash,
      role: 'user',
      isActive: true,
    });
    await ClientInvitation.updateOne({ _id: claimed._id }, { $set: { userId: user._id }, $push: { events: { type: 'accepted', at: now } } });
    await AuditLog.create({
      actorAdminId: claimed.invitedBy,
      targetUserId: user._id,
      actionType: 'client_created',
      metadata: { via: 'invitation', email: claimed.email },
    }).catch(() => undefined);
    return { email: claimed.email, userId: String(user._id) };
  } catch (e) {
    // Account creation failed (e.g. duplicate created in the meantime): give the token back so the client can retry or an admin can look.
    await ClientInvitation.updateOne(
      { _id: claimed._id },
      { $set: { status: claimed.status, tokenHash: hash }, $unset: { acceptedAt: '', consumedTokenHash: '' } }
    );
    throw e;
  }
}

// ───────────────────────── listing ─────────────────────────

export function serializeInvitation(inv: IClientInvitation, now = new Date()) {
  const status = displayStatus(inv, now);
  return {
    _id: String(inv._id),
    email: inv.email,
    name: inv.name ?? null,
    status,
    storedStatus: inv.status,
    createdAt: inv.createdAt,
    sentAt: inv.sentAt ?? null,
    acceptedAt: inv.acceptedAt ?? null,
    revokedAt: inv.revokedAt ?? null,
    expiresAt: inv.expiresAt,
    sendCount: inv.sendCount,
    lastSendError: inv.lastSendError ?? null,
    userId: inv.userId ? String(inv.userId) : null,
    canResend: status !== 'accepted' && status !== 'revoked',
    canRevoke: status !== 'accepted' && status !== 'revoked',
  };
}

export async function listInvitations(filter: { status?: string; q?: string }, limit = 200) {
  const query: Record<string, unknown> = {};
  const now = new Date();
  const s = filter.status;
  if (s === 'expired') {
    query.$or = [{ status: 'expired' }, { status: { $in: ['pending', 'sent', 'failed'] }, expiresAt: { $lte: now } }];
  } else if (s === 'sent' || s === 'pending' || s === 'failed') {
    query.status = s;
    query.expiresAt = { $gt: now };
  } else if (s === 'accepted' || s === 'revoked') {
    query.status = s;
  }
  if (filter.q) {
    const escaped = filter.q.trim().toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (escaped) query.email = new RegExp(escaped);
  }
  const rows = await ClientInvitation.find(query).sort({ createdAt: -1 }).limit(Math.min(limit, 500));
  return rows.map((r) => serializeInvitation(r, now));
}
