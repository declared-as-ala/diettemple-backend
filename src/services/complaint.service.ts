/**
 * Complaints & support tickets.
 *
 * Confidentiality rules (enforced here, not in the routes):
 *  - a client only ever reads/replies to THEIR complaints (every query is scoped by userId);
 *  - internal admin notes never leave the admin serializer (and never count as unread or trigger an email);
 *  - attachments live in a private bucket and are served only to the owner or an admin.
 */
import crypto from 'crypto';
import mongoose, { type Types } from 'mongoose';
import Complaint, {
  CATEGORY_LABELS, COMPLAINT_CATEGORIES, COMPLAINT_PRIORITIES, COMPLAINT_STATUSES, STATUS_LABELS,
  type ComplaintCategory, type ComplaintPriority, type ComplaintStatus, type IComplaint, type IComplaintMessage,
} from '../models/Complaint.model';
import User from '../models/User.model';
import { validateAttachments, type UploadedFile } from './attachments';
import { getPrivateStorage } from './privateStorage';
import { getMailer, supportEmail } from './mailer';
import { emitToRoom } from '../realtime/socket';
import { REALTIME_EVENTS, REALTIME_ROOMS } from '../realtime/events';

export class ComplaintError extends Error {
  constructor(public code: string, message: string, public httpStatus = 400) {
    super(message);
    this.name = 'ComplaintError';
  }
}

const isCategory = (v: unknown): v is ComplaintCategory => (COMPLAINT_CATEGORIES as readonly string[]).includes(v as string);
const isStatus = (v: unknown): v is ComplaintStatus => (COMPLAINT_STATUSES as readonly string[]).includes(v as string);
const isPriority = (v: unknown): v is ComplaintPriority => (COMPLAINT_PRIORITIES as readonly string[]).includes(v as string);

function reference(): string {
  return `REC-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

async function storeAttachments(complaintId: string, files: UploadedFile[] | undefined) {
  const checked = validateAttachments(`complaints/${complaintId}`, files);
  if (checked.length) {
    const storage = await getPrivateStorage();
    for (const a of checked) await storage.put(a.key, a.buffer, a.mime);
  }
  return checked.map(({ key, name, mime, size }) => ({ key, name, mime, size }));
}

// ───────────────────────── serializers ─────────────────────────

const attachmentOut = (a: any) => ({ id: String(a._id), name: a.name, mime: a.mime, size: a.size });

function messageOut(m: IComplaintMessage | any, forAdmin: boolean) {
  return {
    id: String(m._id),
    authorType: m.authorType as 'client' | 'admin',
    body: m.body,
    createdAt: m.createdAt,
    attachments: (m.attachments || []).map(attachmentOut),
    ...(forAdmin ? { internal: !!m.internal } : {}),
  };
}

/** What a CLIENT may see: no internal notes, no storage keys, no admin ids. */
export function serializeForClient(c: IComplaint | any) {
  const visible = (c.messages || []).filter((m: any) => !m.internal);
  const last = visible[visible.length - 1];
  return {
    id: String(c._id),
    reference: c.reference,
    category: c.category as ComplaintCategory,
    categoryLabel: CATEGORY_LABELS[c.category as ComplaintCategory],
    subject: c.subject,
    status: c.status as ComplaintStatus,
    statusLabel: STATUS_LABELS[c.status as ComplaintStatus],
    unread: c.unreadForClient || 0,
    createdAt: c.createdAt,
    lastMessageAt: c.lastMessageAt,
    resolvedAt: c.resolvedAt ?? null,
    lastMessagePreview: last ? String(last.body || '').slice(0, 120) : '',
    messages: visible.map((m: any) => messageOut(m, false)),
  };
}

export function serializeForAdmin(c: IComplaint | any, client?: any) {
  const base = serializeForClient(c);
  return {
    ...base,
    priority: c.priority as ComplaintPriority,
    unread: c.unreadForAdmin || 0,
    closedAt: c.closedAt ?? null,
    messages: (c.messages || []).map((m: any) => messageOut(m, true)),
    client: client
      ? { id: String(client._id), name: client.name || [client.firstName, client.lastName].filter(Boolean).join(' ') || null, email: client.email ?? null, phone: client.phone ?? null, photoUri: client.photoUri ?? null }
      : { id: String(c.userId) },
  };
}

// ───────────────────────── notifications (best effort) ─────────────────────────

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function sendMail(to: string, subject: string, title: string, lines: string[]) {
  try {
    const html = `<div style="font-family:Arial,sans-serif;background:#0b0b0c;padding:24px;color:#f3f4f6"><div style="max-width:520px;margin:auto;background:#151518;border:1px solid #2a2418;border-radius:16px;padding:24px"><h2 style="color:#C9A45C;margin:0 0 12px">${esc(title)}</h2>${lines.map((l) => `<p style="color:#d1d5db;font-size:15px;line-height:22px">${esc(l)}</p>`).join('')}<p style="color:#6b7280;font-size:12px;margin-top:20px">DietTemple · ${esc(supportEmail())}</p></div></div>`;
    await (await getMailer()).send({ to, subject, html, text: [title, ...lines].join('\n\n') });
  } catch (e) {
    console.error('[complaints] email failed:', (e as Error).message);
  }
}

function notifyAdminsNew(c: IComplaint, clientName: string) {
  emitToRoom(REALTIME_ROOMS.admins, REALTIME_EVENTS.complaintUpdated, { complaintId: String(c._id), kind: 'created' });
  const to = process.env.ADMIN_EMAIL || 'admin@diettemple.tn';
  void sendMail(to, `Nouvelle réclamation ${c.reference}`, 'Nouvelle réclamation', [
    `${clientName} a ouvert une réclamation (${CATEGORY_LABELS[c.category]}).`,
    `Sujet : ${c.subject}`,
    'Ouvrez le module Réclamations de l’administration pour répondre.',
  ]);
}

function notifyClientReply(c: IComplaint, clientEmail?: string | null) {
  emitToRoom(REALTIME_ROOMS.user(String(c.userId)), REALTIME_EVENTS.complaintUpdated, { complaintId: String(c._id), kind: 'reply' });
  if (clientEmail) {
    void sendMail(clientEmail, `Réponse à votre réclamation ${c.reference}`, 'Vous avez une réponse', [
      `Notre équipe a répondu à votre réclamation « ${c.subject} ».`,
      'Ouvrez l’application DietTemple (Profil → Réclamations et assistance) pour la lire et y répondre.',
    ]);
  }
}

// ───────────────────────── client side ─────────────────────────

export async function createComplaint(input: {
  userId: Types.ObjectId;
  category: unknown;
  subject: unknown;
  description: unknown;
  files?: UploadedFile[];
}) {
  if (!isCategory(input.category)) throw new ComplaintError('invalid_category', 'Choisissez une catégorie.');
  const subject = typeof input.subject === 'string' ? input.subject.trim() : '';
  const description = typeof input.description === 'string' ? input.description.trim() : '';
  if (subject.length < 3) throw new ComplaintError('invalid_subject', 'Le sujet est trop court (3 caractères minimum).');
  if (subject.length > 140) throw new ComplaintError('invalid_subject', 'Le sujet est trop long (140 caractères maximum).');
  if (description.length < 10) throw new ComplaintError('invalid_description', 'Décrivez votre problème (10 caractères minimum).');
  if (description.length > 5000) throw new ComplaintError('invalid_description', 'La description est trop longue (5000 caractères maximum).');

  const _id = new mongoose.Types.ObjectId();
  const attachments = await storeAttachments(String(_id), input.files);
  const now = new Date();
  const doc = await Complaint.create({
    _id,
    reference: reference(),
    userId: input.userId,
    category: input.category,
    subject,
    status: 'new',
    messages: [{ authorType: 'client', authorId: input.userId, body: description, internal: false, attachments, createdAt: now }],
    unreadForAdmin: 1,
    lastMessageAt: now,
  });
  const user: any = await User.findById(input.userId).select('name firstName lastName email').lean();
  notifyAdminsNew(doc, user?.name || user?.email || 'Un client');
  return doc;
}

export async function listForClient(userId: Types.ObjectId) {
  const rows = await Complaint.find({ userId }).sort({ lastMessageAt: -1 }).limit(200);
  return rows.map((c) => {
    const { messages, ...rest } = serializeForClient(c);
    return { ...rest, messageCount: messages.length };
  });
}

/** Opening a complaint as its owner marks the admin replies as read. */
export async function getForClient(userId: Types.ObjectId, id: string) {
  if (!mongoose.isValidObjectId(id)) throw new ComplaintError('not_found', 'Réclamation introuvable.', 404);
  const c = await Complaint.findOne({ _id: id, userId });
  if (!c) throw new ComplaintError('not_found', 'Réclamation introuvable.', 404);
  if (c.unreadForClient > 0) {
    c.unreadForClient = 0;
    await c.save();
  }
  return c;
}

export async function unreadCountForClient(userId: Types.ObjectId): Promise<number> {
  const rows = await Complaint.find({ userId, unreadForClient: { $gt: 0 } }).select('unreadForClient').lean();
  return rows.reduce((sum, r: any) => sum + (r.unreadForClient || 0), 0);
}

export async function replyAsClient(userId: Types.ObjectId, id: string, bodyIn: unknown, files?: UploadedFile[]) {
  const c = await getForClient(userId, id);
  if (c.status === 'closed') throw new ComplaintError('closed', 'Cette réclamation est fermée. Ouvrez-en une nouvelle si besoin.', 409);
  const body = typeof bodyIn === 'string' ? bodyIn.trim() : '';
  if (body.length > 5000) throw new ComplaintError('invalid_message', 'Message trop long (5000 caractères maximum).');
  const attachments = await storeAttachments(String(c._id), files);
  if (!body && attachments.length === 0) throw new ComplaintError('empty_message', 'Écrivez un message ou joignez une image.');
  c.messages.push({ authorType: 'client', authorId: userId, body, internal: false, attachments, createdAt: new Date() } as any);
  c.unreadForAdmin += 1;
  c.lastMessageAt = new Date();
  if (c.status === 'waiting_client' || c.status === 'resolved') {
    c.status = 'in_progress';
    c.resolvedAt = undefined;
  }
  await c.save();
  emitToRoom(REALTIME_ROOMS.admins, REALTIME_EVENTS.complaintUpdated, { complaintId: String(c._id), kind: 'client_reply' });
  return c;
}

// ───────────────────────── admin side ─────────────────────────

export interface AdminFilters {
  status?: string;
  category?: string;
  priority?: string;
  clientId?: string;
  q?: string;
  from?: string;
  to?: string;
  unread?: boolean;
}

export async function listForAdmin(f: AdminFilters, limit = 200) {
  const query: Record<string, any> = {};
  if (isStatus(f.status)) query.status = f.status;
  if (isCategory(f.category)) query.category = f.category;
  if (isPriority(f.priority)) query.priority = f.priority;
  if (f.clientId && mongoose.isValidObjectId(f.clientId)) query.userId = f.clientId;
  if (f.unread) query.unreadForAdmin = { $gt: 0 };
  const range: Record<string, Date> = {};
  if (f.from && !Number.isNaN(Date.parse(f.from))) range.$gte = new Date(f.from);
  if (f.to && !Number.isNaN(Date.parse(f.to))) range.$lte = new Date(f.to);
  if (Object.keys(range).length) query.createdAt = range;
  if (f.q && f.q.trim()) {
    const rx = new RegExp(f.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const users = await User.find({ $or: [{ email: rx }, { name: rx }, { phone: rx }] }).select('_id').limit(100).lean();
    query.$or = [{ subject: rx }, { reference: rx }, { userId: { $in: users.map((u) => u._id) } }];
  }
  const rows = await Complaint.find(query).sort({ lastMessageAt: -1 }).limit(Math.min(limit, 500));
  const ids = Array.from(new Set(rows.map((r) => String(r.userId))));
  const clients = await User.find({ _id: { $in: ids } }).select('name firstName lastName email phone photoUri').lean();
  const byId = new Map(clients.map((u: any) => [String(u._id), u]));
  return rows.map((c) => {
    const { messages, ...rest } = serializeForAdmin(c, byId.get(String(c.userId)));
    return { ...rest, messageCount: messages.length };
  });
}

export async function getForAdmin(id: string, opts: { markRead?: boolean } = { markRead: true }) {
  if (!mongoose.isValidObjectId(id)) throw new ComplaintError('not_found', 'Réclamation introuvable.', 404);
  const c = await Complaint.findById(id);
  if (!c) throw new ComplaintError('not_found', 'Réclamation introuvable.', 404);
  if (opts.markRead && c.unreadForAdmin > 0) {
    c.unreadForAdmin = 0;
    await c.save();
  }
  const client = await User.findById(c.userId).select('name firstName lastName email phone photoUri createdAt').lean();
  return { complaint: c, client };
}

export async function replyAsAdmin(adminId: Types.ObjectId, id: string, input: { body?: unknown; files?: UploadedFile[]; status?: unknown }) {
  const { complaint: c } = await getForAdmin(id, { markRead: false });
  if (c.status === 'closed') throw new ComplaintError('closed', 'Cette réclamation est fermée. Rouvrez-la pour répondre.', 409);
  const body = typeof input.body === 'string' ? input.body.trim() : '';
  if (body.length > 5000) throw new ComplaintError('invalid_message', 'Message trop long (5000 caractères maximum).');
  const attachments = await storeAttachments(String(c._id), input.files);
  if (!body && attachments.length === 0) throw new ComplaintError('empty_message', 'Écrivez une réponse ou joignez une image.');
  c.messages.push({ authorType: 'admin', authorId: adminId, body, internal: false, attachments, createdAt: new Date() } as any);
  c.unreadForClient += 1;
  c.unreadForAdmin = 0;
  c.lastMessageAt = new Date();
  applyStatus(c, isStatus(input.status) ? input.status : c.status === 'new' || c.status === 'in_progress' ? 'waiting_client' : c.status);
  await c.save();
  const client: any = await User.findById(c.userId).select('email').lean();
  notifyClientReply(c, client?.email);
  return c;
}

/** Internal note: invisible to the client by construction (flag + serializer), no unread, no email, no realtime to the client. */
export async function addInternalNote(adminId: Types.ObjectId, id: string, bodyIn: unknown) {
  const { complaint: c } = await getForAdmin(id, { markRead: false });
  const body = typeof bodyIn === 'string' ? bodyIn.trim() : '';
  if (!body) throw new ComplaintError('empty_message', 'Écrivez une note.');
  if (body.length > 5000) throw new ComplaintError('invalid_message', 'Note trop longue (5000 caractères maximum).');
  c.messages.push({ authorType: 'admin', authorId: adminId, body, internal: true, attachments: [], createdAt: new Date() } as any);
  await c.save();
  return c;
}

function applyStatus(c: IComplaint, status: ComplaintStatus) {
  c.status = status;
  if (status === 'resolved') c.resolvedAt = c.resolvedAt ?? new Date();
  else c.resolvedAt = undefined;
  if (status === 'closed') c.closedAt = c.closedAt ?? new Date();
  else c.closedAt = undefined;
}

export async function updateComplaint(id: string, patch: { status?: unknown; priority?: unknown }) {
  const { complaint: c } = await getForAdmin(id, { markRead: false });
  if (patch.status !== undefined) {
    if (!isStatus(patch.status)) throw new ComplaintError('invalid_status', 'Statut invalide.');
    applyStatus(c, patch.status);
  }
  if (patch.priority !== undefined) {
    if (!isPriority(patch.priority)) throw new ComplaintError('invalid_priority', 'Priorité invalide.');
    c.priority = patch.priority;
  }
  await c.save();
  if (patch.status !== undefined) {
    emitToRoom(REALTIME_ROOMS.user(String(c.userId)), REALTIME_EVENTS.complaintUpdated, { complaintId: String(c._id), kind: 'status' });
  }
  return c;
}

export async function statsForAdmin() {
  const [total, byStatus, unread] = await Promise.all([
    Complaint.countDocuments(),
    Complaint.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    Complaint.countDocuments({ unreadForAdmin: { $gt: 0 } }),
  ]);
  const count = (s: ComplaintStatus) => byStatus.find((r: any) => r._id === s)?.n ?? 0;
  return {
    total,
    new: count('new'),
    inProgress: count('in_progress'),
    waitingClient: count('waiting_client'),
    pending: count('new') + count('in_progress') + count('waiting_client'),
    resolved: count('resolved'),
    closed: count('closed'),
    unread,
  };
}

// ───────────────────────── attachments ─────────────────────────

/** Streams an attachment only to the complaint's owner (never an internal-note file) or to an admin. */
export async function openAttachment(complaintId: string, attachmentId: string, who: { userId: Types.ObjectId; isAdmin: boolean }) {
  if (!mongoose.isValidObjectId(complaintId) || !mongoose.isValidObjectId(attachmentId)) throw new ComplaintError('not_found', 'Fichier introuvable.', 404);
  const c = await Complaint.findById(complaintId);
  if (!c || (!who.isAdmin && String(c.userId) !== String(who.userId))) throw new ComplaintError('not_found', 'Fichier introuvable.', 404);
  for (const m of c.messages) {
    if (m.internal && !who.isAdmin) continue;
    const a = m.attachments.find((x: any) => String(x._id) === attachmentId);
    if (a) {
      const obj = await (await getPrivateStorage()).get(a.key);
      return { ...obj, mime: a.mime, name: a.name };
    }
  }
  throw new ComplaintError('not_found', 'Fichier introuvable.', 404);
}
