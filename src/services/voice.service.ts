/**
 * Coach voice/text messages per exercise.
 * Rules: a client only ever sees their own, non-deleted messages; audio is private (token-protected stream, Range supported).
 */
import mongoose, { type Types } from 'mongoose';
import VoiceMessage, { type IVoiceMessage } from '../models/VoiceMessage.model';
import Exercise from '../models/Exercise.model';
import User from '../models/User.model';
import { clampDuration, validateAudio, type UploadedAudio } from './audio';
import { getPrivateStorage, type StoredObject } from './privateStorage';
import { emitToRoom } from '../realtime/socket';
import { REALTIME_EVENTS, REALTIME_ROOMS } from '../realtime/events';

export class VoiceError extends Error {
  constructor(public httpStatus: number, public code: string, message: string) {
    super(message);
    this.name = 'VoiceError';
  }
}

const oid = (v: unknown): Types.ObjectId => {
  if (typeof v !== 'string' && !(v instanceof mongoose.Types.ObjectId)) throw new VoiceError(404, 'not_found', 'Introuvable.');
  if (!mongoose.isValidObjectId(v)) throw new VoiceError(404, 'not_found', 'Introuvable.');
  return new mongoose.Types.ObjectId(String(v));
};
const optOid = (v: unknown): Types.ObjectId | null => (v === undefined || v === null || v === '' ? null : oid(v));

export function serialize(m: IVoiceMessage, forAdmin: boolean) {
  return {
    id: String(m._id),
    exerciseId: String(m.exerciseId),
    sessionId: m.sessionId ? String(m.sessionId) : null,
    programId: m.programId ? String(m.programId) : null,
    body: m.body || '',
    hasAudio: !!m.audio,
    durationSec: m.audio?.durationSec ?? 0,
    sizeBytes: m.audio?.size ?? 0,
    createdAt: m.createdAt,
    readAt: m.readAt,
    read: !!m.readAt,
    ...(forAdmin ? { authorId: String(m.authorId), clientId: String(m.clientId) } : {}),
  };
}

export interface CreateInput {
  clientId: unknown;
  exerciseId: unknown;
  sessionId?: unknown;
  programId?: unknown;
  body?: unknown;
  durationSec?: unknown;
  audio?: UploadedAudio;
}

export async function createMessage(authorId: Types.ObjectId, input: CreateInput) {
  const clientId = oid(input.clientId);
  const exerciseId = oid(input.exerciseId);
  const body = typeof input.body === 'string' ? input.body.trim() : '';
  if (body.length > 1000) throw new VoiceError(400, 'body_too_long', 'Le message texte est limité à 1000 caractères.');
  if (!input.audio && !body) throw new VoiceError(400, 'empty', 'Ajoutez un message vocal ou du texte.');

  const [client, exercise] = await Promise.all([User.findById(clientId).select('_id role').lean(), Exercise.findById(exerciseId).select('_id').lean()]);
  if (!client || (client as any).role === 'admin') throw new VoiceError(404, 'client_not_found', 'Client introuvable.');
  if (!exercise) throw new VoiceError(404, 'exercise_not_found', 'Exercice introuvable.');

  let audio: IVoiceMessage['audio'] = null;
  if (input.audio) {
    const v = validateAudio(`voice/${clientId}/${exerciseId}`, input.audio);
    await (await getPrivateStorage()).put(v.key, v.buffer, v.mime);
    audio = { key: v.key, mime: v.mime, size: v.size, durationSec: clampDuration(input.durationSec) };
  }
  const msg = await VoiceMessage.create({
    clientId, exerciseId, authorId, body, audio,
    sessionId: optOid(input.sessionId), programId: optOid(input.programId),
  });
  emitToRoom(REALTIME_ROOMS.user(String(clientId)), REALTIME_EVENTS.voiceMessage, { exerciseId: String(exerciseId), messageId: String(msg._id), kind: 'new' });
  return msg;
}

export const listForAdmin = async (clientId: unknown, exerciseId: unknown) =>
  VoiceMessage.find({ clientId: oid(clientId), exerciseId: oid(exerciseId), deletedAt: null }).sort({ createdAt: 1 });

/** Per-exercise counters for the admin client page. */
export async function summaryForAdmin(clientId: unknown) {
  const rows = await VoiceMessage.aggregate([
    { $match: { clientId: oid(clientId), deletedAt: null } },
    { $group: { _id: '$exerciseId', total: { $sum: 1 }, unread: { $sum: { $cond: [{ $eq: ['$readAt', null] }, 1, 0] } }, lastAt: { $max: '$createdAt' } } },
  ]);
  return rows.map((r) => ({ exerciseId: String(r._id), total: r.total, unread: r.unread, lastAt: r.lastAt }));
}

export async function deleteMessage(id: unknown) {
  const msg = await VoiceMessage.findOne({ _id: oid(id), deletedAt: null });
  if (!msg) throw new VoiceError(404, 'not_found', 'Message introuvable.');
  msg.deletedAt = new Date();
  await msg.save();
  if (msg.audio?.key) {
    try {
      await (await getPrivateStorage()).remove(msg.audio.key);
    } catch (e) {
      console.error('[voice] audio removal failed', e);
    }
  }
  emitToRoom(REALTIME_ROOMS.user(String(msg.clientId)), REALTIME_EVENTS.voiceMessage, { exerciseId: String(msg.exerciseId), messageId: String(msg._id), kind: 'deleted' });
  return msg;
}

// ── client side ────────────────────────────────────────────────────────────
export const listForClient = async (clientId: Types.ObjectId, exerciseId: unknown) =>
  VoiceMessage.find({ clientId, exerciseId: oid(exerciseId), deletedAt: null }).sort({ createdAt: 1 });

export async function unreadForClient(clientId: Types.ObjectId) {
  const rows = await VoiceMessage.aggregate([
    { $match: { clientId: new mongoose.Types.ObjectId(String(clientId)), deletedAt: null, readAt: null } },
    { $group: { _id: '$exerciseId', n: { $sum: 1 } } },
  ]);
  const byExercise: Record<string, number> = {};
  let unread = 0;
  for (const r of rows) {
    byExercise[String(r._id)] = r.n;
    unread += r.n;
  }
  return { unread, byExercise };
}

/** Marks as read, scoped to the caller: ids of other clients are simply ignored. */
export async function markRead(clientId: Types.ObjectId, ids: unknown) {
  const list = (Array.isArray(ids) ? ids : [])
    .filter((v) => typeof v === 'string' && mongoose.isValidObjectId(v))
    .slice(0, 200)
    .map((v) => new mongoose.Types.ObjectId(String(v)));
  if (!list.length) return 0;
  const r = await VoiceMessage.updateMany({ _id: { $in: list }, clientId, deletedAt: null, readAt: null }, { $set: { readAt: new Date() } });
  return r.modifiedCount;
}

export interface AudioAccess {
  userId: Types.ObjectId;
  isAdmin: boolean;
}

function accessFilter(id: unknown, who: AudioAccess): Record<string, unknown> {
  const filter: Record<string, unknown> = { _id: oid(id), deletedAt: null };
  if (!who.isAdmin) filter.clientId = who.userId; // another client's message looks like it does not exist
  return filter;
}

export async function audioMeta(id: unknown, who: AudioAccess): Promise<number> {
  const msg = await VoiceMessage.findOne(accessFilter(id, who)).select('audio').lean();
  if (!msg?.audio) throw new VoiceError(404, 'not_found', 'Message introuvable.');
  return msg.audio.size;
}

export async function openAudio(id: unknown, who: AudioAccess, range?: { start: number; end: number } | null): Promise<{ file: StoredObject; mime: string }> {
  const msg = await VoiceMessage.findOne(accessFilter(id, who));
  if (!msg?.audio) throw new VoiceError(404, 'not_found', 'Message introuvable.');
  const storage = await getPrivateStorage();
  try {
    const file = range ? await storage.getRange(msg.audio.key, range.start, range.end - range.start + 1) : await storage.get(msg.audio.key);
    return { file, mime: msg.audio.mime };
  } catch {
    throw new VoiceError(404, 'not_found', 'Fichier audio introuvable.');
  }
}
