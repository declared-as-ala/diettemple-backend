/**
 * Integration tests against a REAL MongoDB (set MONGODB_TEST_URI). Skipped otherwise.
 * Storage is an in-memory fake: MinIO itself is NOT exercised here.
 */
import express from 'express';
import mongoose from 'mongoose';
import { Readable } from 'stream';
import request from 'supertest';
import User from '../models/User.model';
import Exercise from '../models/Exercise.model';
import VoiceMessage from '../models/VoiceMessage.model';
import { setPrivateStorageForTests } from './privateStorage';
import voiceRoutes from '../routes/voiceMessages.routes';
import voiceAdminRoutes from '../routes/admin/voiceMessages.routes';

const URI = process.env.MONGODB_TEST_URI;
const maybe = URI ? describe : describe.skip;

// 2000 bytes that start like a WebM/EBML file.
const AUDIO = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.from(Array.from({ length: 1996 }, (_, i) => i % 251))]);

const files = new Map<string, { data: Buffer; mime: string }>();
const fakeStorage = {
  async put(key: string, data: Buffer, mime: string) { files.set(key, { data, mime }); },
  async get(key: string) {
    const f = files.get(key);
    if (!f) throw new Error('NoSuchKey');
    return { stream: Readable.from([f.data]), size: f.data.length };
  },
  async getRange(key: string, offset: number, length: number) {
    const f = files.get(key);
    if (!f) throw new Error('NoSuchKey');
    return { stream: Readable.from([f.data.subarray(offset, offset + length)]), size: length };
  },
  async remove(key: string) { files.delete(key); },
};

const ids: Record<string, mongoose.Types.ObjectId> = {
  clientA: new mongoose.Types.ObjectId(),
  clientB: new mongoose.Types.ObjectId(),
  admin: new mongoose.Types.ObjectId(),
  exoA: new mongoose.Types.ObjectId(),
  exoB: new mongoose.Types.ObjectId(),
};

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    const who = String(req.headers['x-test-user'] || 'clientA');
    req.user = { _id: ids[who], role: who === 'admin' ? 'admin' : who === 'employee' ? 'employee' : 'user' };
    // the real app mounts requireAdmin in front of the admin router; mimic it here
    next();
  });
  const requireAdmin = (req: any, res: express.Response, next: express.NextFunction) => (req.user.role === 'admin' ? next() : res.status(403).json({ message: 'Forbidden' }));
  app.use('/api/voice-messages', voiceRoutes);
  app.use('/api/admin/voice-messages', requireAdmin, voiceAdminRoutes);
  return app;
}

let ipCounter = 100;
const send = (app: express.Express, client: string, exercise: string, over: { audio?: Buffer | null; body?: string; duration?: string; name?: string } = {}) => {
  let r = request(app).post(`/api/admin/voice-messages/clients/${ids[client]}/exercises/${ids[exercise]}`).set('x-test-user', 'admin').set('X-Forwarded-For', `10.1.0.${ipCounter}`);
  if (over.audio !== null) r = r.attach('audio', over.audio ?? AUDIO, over.name ?? 'voice.webm');
  if (over.duration) r = r.field('durationSec', over.duration);
  if (over.body) r = r.field('body', over.body);
  return r;
};

maybe('exercise voice messages (real MongoDB)', () => {
  beforeAll(async () => {
    await mongoose.connect(URI as string);
    await mongoose.connection.dropDatabase();
    await VoiceMessage.init();
    setPrivateStorageForTests(fakeStorage);
  });
  afterAll(async () => {
    setPrivateStorageForTests(null);
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
  beforeEach(async () => {
    ipCounter++;
    files.clear();
    await Promise.all([VoiceMessage.deleteMany({}), User.deleteMany({}), Exercise.deleteMany({})]);
    await User.create([
      { _id: ids.clientA, email: 'a@example.com', name: 'Client A', passwordHash: 'x', role: 'user' },
      { _id: ids.clientB, email: 'b@example.com', name: 'Client B', passwordHash: 'x', role: 'user' },
      { _id: ids.admin, email: 'admin@example.com', name: 'Admin', passwordHash: 'x', role: 'admin' },
    ]);
    await Exercise.collection.insertMany([
      { _id: ids.exoA, name: 'Squat', muscleGroup: 'Jambes' },
      { _id: ids.exoB, name: 'Développé couché', muscleGroup: 'Pectoraux' },
    ] as any);
  });

  it('admin sends a voice message: stored privately, no storage key or url leaks, duration clamped', async () => {
    const app = buildApp();
    const res = await send(app, 'clientA', 'exoA', { duration: '12', body: 'Garde le dos droit' }).expect(201);
    const m = res.body.message;
    expect(m).toMatchObject({ hasAudio: true, durationSec: 12, body: 'Garde le dos droit', read: false });
    expect(JSON.stringify(m)).not.toMatch(/voice\/[0-9a-f]{24}\//);
    expect([...files.keys()][0]).toMatch(new RegExp(`^voice/${ids.clientA}/${ids.exoA}/[0-9a-f]{32}\\.webm$`));
    const huge = await send(app, 'clientA', 'exoA', { duration: '99999' }).expect(201);
    expect(huge.body.message.durationSec).toBe(180);
  });

  it('text-only works; empty or invalid sends are refused and nothing is stored', async () => {
    const app = buildApp();
    await send(app, 'clientA', 'exoA', { audio: null, body: 'Bravo, continue' }).expect(201);
    await send(app, 'clientA', 'exoA', { audio: null }).expect(400);
    const bad = await send(app, 'clientA', 'exoA', { audio: Buffer.from('<?php system($_GET[1]); ?> pas du tout de l audio'), name: 'x.webm' }).expect(400);
    expect(bad.body.message).toMatch(/Format audio/);
    await send(app, 'clientA', 'exoA', { audio: Buffer.alloc(0) }).expect(400);
    const tooLong = 'x'.repeat(1001);
    await send(app, 'clientA', 'exoA', { audio: null, body: tooLong }).expect(400);
    expect(files.size).toBe(0);
    expect(await VoiceMessage.countDocuments()).toBe(1);
    // unknown client / exercise / bad ids
    await request(app).post(`/api/admin/voice-messages/clients/${new mongoose.Types.ObjectId()}/exercises/${ids.exoA}`).set('x-test-user', 'admin').attach('audio', AUDIO, 'v.webm').expect(404);
    await request(app).post(`/api/admin/voice-messages/clients/${ids.clientA}/exercises/${new mongoose.Types.ObjectId()}`).set('x-test-user', 'admin').attach('audio', AUDIO, 'v.webm').expect(404);
    await request(app).post(`/api/admin/voice-messages/clients/nope/exercises/${ids.exoA}`).set('x-test-user', 'admin').attach('audio', AUDIO, 'v.webm').expect(404);
    await request(app).post(`/api/admin/voice-messages/clients/${ids.admin}/exercises/${ids.exoA}`).set('x-test-user', 'admin').attach('audio', AUDIO, 'v.webm').expect(404); // cannot target an admin account
  });

  it('only admins can use the admin routes (clients and employees get 403)', async () => {
    const app = buildApp();
    await request(app).get(`/api/admin/voice-messages/clients/${ids.clientA}`).set('x-test-user', 'clientA').expect(403);
    await request(app).post(`/api/admin/voice-messages/clients/${ids.clientA}/exercises/${ids.exoA}`).set('x-test-user', 'employee').attach('audio', AUDIO, 'v.webm').expect(403);
    await request(app).delete(`/api/admin/voice-messages/${new mongoose.Types.ObjectId()}`).set('x-test-user', 'clientA').expect(403);
    expect(files.size).toBe(0);
  });

  it('client isolation: each client only sees, counts, reads and streams their own messages', async () => {
    const app = buildApp();
    const a = (await send(app, 'clientA', 'exoA', { duration: '5' }).expect(201)).body.message;
    const b = (await send(app, 'clientB', 'exoA', { duration: '5' }).expect(201)).body.message;
    expect((await request(app).get(`/api/voice-messages/exercises/${ids.exoA}`).set('x-test-user', 'clientA')).body.messages.map((m: any) => m.id)).toEqual([a.id]);
    expect((await request(app).get(`/api/voice-messages/exercises/${ids.exoA}`).set('x-test-user', 'clientB')).body.messages.map((m: any) => m.id)).toEqual([b.id]);
    // clientA cannot stream or mark clientB's message
    await request(app).get(`/api/voice-messages/${b.id}/audio`).set('x-test-user', 'clientA').expect(404);
    expect((await request(app).post('/api/voice-messages/read').set('x-test-user', 'clientA').send({ ids: [b.id] })).body.updated).toBe(0);
    expect((await VoiceMessage.findById(b.id))!.readAt).toBeNull();
    expect((await request(app).get('/api/voice-messages/unread-count').set('x-test-user', 'clientA')).body).toEqual({ unread: 1, byExercise: { [String(ids.exoA)]: 1 } });
    // the client payload carries no admin/author info
    const mine = (await request(app).get(`/api/voice-messages/exercises/${ids.exoA}`).set('x-test-user', 'clientA')).body.messages[0];
    expect(mine).not.toHaveProperty('authorId');
    expect(mine).not.toHaveProperty('clientId');
  });

  it('unread counters per exercise, then reading clears them (once)', async () => {
    const app = buildApp();
    const m1 = (await send(app, 'clientA', 'exoA').expect(201)).body.message;
    await send(app, 'clientA', 'exoA', { audio: null, body: 'texte' }).expect(201);
    await send(app, 'clientA', 'exoB').expect(201);
    const c = (await request(app).get('/api/voice-messages/unread-count').set('x-test-user', 'clientA')).body;
    expect(c.unread).toBe(3);
    expect(c.byExercise[String(ids.exoA)]).toBe(2);
    expect(c.byExercise[String(ids.exoB)]).toBe(1);
    const admin = (await request(app).get(`/api/admin/voice-messages/clients/${ids.clientA}`).set('x-test-user', 'admin')).body.exercises;
    expect(admin.find((e: any) => e.exerciseId === String(ids.exoA))).toMatchObject({ total: 2, unread: 2 });

    expect((await request(app).post('/api/voice-messages/read').set('x-test-user', 'clientA').send({ ids: [m1.id, 'not-an-id', 42] })).body.updated).toBe(1);
    expect((await request(app).post('/api/voice-messages/read').set('x-test-user', 'clientA').send({ ids: [m1.id] })).body.updated).toBe(0); // idempotent
    expect((await request(app).get('/api/voice-messages/unread-count').set('x-test-user', 'clientA')).body.unread).toBe(2);
    const adminAfter = (await request(app).get(`/api/admin/voice-messages/clients/${ids.clientA}/exercises/${ids.exoA}`).set('x-test-user', 'admin')).body.messages;
    expect(adminAfter.find((m: any) => m.id === m1.id).read).toBe(true); // the coach sees "read"
  });

  it('streams the audio privately, with Range support for seeking', async () => {
    const app = buildApp();
    const m = (await send(app, 'clientA', 'exoA').expect(201)).body.message;
    const full = await request(app).get(`/api/voice-messages/${m.id}/audio`).set('x-test-user', 'clientA').buffer(true).parse((r, cb) => { const c: Buffer[] = []; r.on('data', (d: Buffer) => c.push(d)); r.on('end', () => cb(null, Buffer.concat(c))); }).expect(200);
    expect(full.headers['content-type']).toBe('audio/webm');
    expect(full.headers['accept-ranges']).toBe('bytes');
    expect(full.headers['cache-control']).toMatch(/no-store/);
    expect(Buffer.compare(full.body as Buffer, AUDIO)).toBe(0);

    const part = await request(app).get(`/api/voice-messages/${m.id}/audio`).set('x-test-user', 'clientA').set('Range', 'bytes=100-199').buffer(true).parse((r, cb) => { const c: Buffer[] = []; r.on('data', (d: Buffer) => c.push(d)); r.on('end', () => cb(null, Buffer.concat(c))); }).expect(206);
    expect(part.headers['content-range']).toBe('bytes 100-199/2000');
    expect(Buffer.compare(part.body as Buffer, AUDIO.subarray(100, 200))).toBe(0);
    await request(app).get(`/api/voice-messages/${m.id}/audio`).set('x-test-user', 'clientA').set('Range', 'bytes=5000-').expect(416);
    // the admin can also listen
    await request(app).get(`/api/admin/voice-messages/${m.id}/audio`).set('x-test-user', 'admin').expect(200);
    await request(app).get('/api/voice-messages/not-an-id/audio').set('x-test-user', 'clientA').expect(404);
  });

  it('deleting hides the message everywhere and removes the audio file; unknown id is a clean 404', async () => {
    const app = buildApp();
    const m = (await send(app, 'clientA', 'exoA').expect(201)).body.message;
    expect(files.size).toBe(1);
    await request(app).delete(`/api/admin/voice-messages/${m.id}`).set('x-test-user', 'admin').expect(200);
    expect(files.size).toBe(0);
    expect((await request(app).get(`/api/voice-messages/exercises/${ids.exoA}`).set('x-test-user', 'clientA')).body.messages).toHaveLength(0);
    expect((await request(app).get('/api/voice-messages/unread-count').set('x-test-user', 'clientA')).body.unread).toBe(0);
    await request(app).get(`/api/voice-messages/${m.id}/audio`).set('x-test-user', 'clientA').expect(404);
    await request(app).get(`/api/admin/voice-messages/${m.id}/audio`).set('x-test-user', 'admin').expect(404);
    await request(app).delete(`/api/admin/voice-messages/${m.id}`).set('x-test-user', 'admin').expect(404);
    expect((await request(app).get(`/api/admin/voice-messages/clients/${ids.clientA}/exercises/${ids.exoA}`).set('x-test-user', 'admin')).body.messages).toHaveLength(0);
  });

  it('a missing audio file behind an existing message is a clean 404, not a crash', async () => {
    const app = buildApp();
    const m = (await send(app, 'clientA', 'exoA').expect(201)).body.message;
    files.clear();
    await request(app).get(`/api/voice-messages/${m.id}/audio`).set('x-test-user', 'clientA').expect(404);
  });

  it('exercise-wide message: one recording, seen by every client, read tracked per client', async () => {
    const app = buildApp();
    const post = () => request(app).post(`/api/admin/voice-messages/exercises/${ids.exoA}`).set('x-test-user', 'admin').set('X-Forwarded-For', `10.2.0.${ipCounter}`);
    const g = (await post().attach('audio', AUDIO, 'tip.webm').field('durationSec', '20').field('body', 'Descends lentement').expect(201)).body.message;
    expect(g).toMatchObject({ scope: 'exercise', clientId: null, hasAudio: true, durationSec: 20 });
    expect([...files.keys()][0]).toMatch(new RegExp(`^voice/all/${ids.exoA}/[0-9a-f]{32}\\.webm$`));
    // a client-specific message on the same exercise coexists
    const own = (await send(app, 'clientA', 'exoA', { duration: '4' }).expect(201)).body.message;

    const listA = (await request(app).get(`/api/voice-messages/exercises/${ids.exoA}`).set('x-test-user', 'clientA')).body.messages;
    expect(listA.map((m: any) => m.id).sort()).toEqual([g.id, own.id].sort());
    const listB = (await request(app).get(`/api/voice-messages/exercises/${ids.exoA}`).set('x-test-user', 'clientB')).body.messages;
    expect(listB.map((m: any) => m.id)).toEqual([g.id]); // B never sees A's private message
    expect((await request(app).get(`/api/voice-messages/exercises/${ids.exoB}`).set('x-test-user', 'clientB')).body.messages).toHaveLength(0); // other exercise: nothing

    // unread counts include it, per client
    expect((await request(app).get('/api/voice-messages/unread-count').set('x-test-user', 'clientA')).body.unread).toBe(2);
    expect((await request(app).get('/api/voice-messages/unread-count').set('x-test-user', 'clientB')).body.unread).toBe(1);
    // A reads the shared one: only A's counter changes
    expect((await request(app).post('/api/voice-messages/read').set('x-test-user', 'clientA').send({ ids: [g.id] })).body.updated).toBe(1);
    expect((await request(app).post('/api/voice-messages/read').set('x-test-user', 'clientA').send({ ids: [g.id] })).body.updated).toBe(0);
    expect((await request(app).get('/api/voice-messages/unread-count').set('x-test-user', 'clientA')).body.unread).toBe(1);
    expect((await request(app).get('/api/voice-messages/unread-count').set('x-test-user', 'clientB')).body.unread).toBe(1);
    const again = (await request(app).get(`/api/voice-messages/exercises/${ids.exoA}`).set('x-test-user', 'clientA')).body.messages.find((m: any) => m.id === g.id);
    expect(again.read).toBe(true);
    expect((await request(app).get(`/api/voice-messages/exercises/${ids.exoA}`).set('x-test-user', 'clientB')).body.messages[0].read).toBe(false);
    expect(again).not.toHaveProperty('readBy');

    // both clients can stream it; the admin sees how many opened it; the per-client message stays private
    await request(app).get(`/api/voice-messages/${g.id}/audio`).set('x-test-user', 'clientB').expect(200);
    await request(app).get(`/api/voice-messages/${own.id}/audio`).set('x-test-user', 'clientB').expect(404);
    const adminList = (await request(app).get(`/api/admin/voice-messages/exercises/${ids.exoA}`).set('x-test-user', 'admin')).body.messages;
    expect(adminList).toHaveLength(1);
    expect(adminList[0].readCount).toBe(1);
    expect((await request(app).get('/api/admin/voice-messages/exercises').set('x-test-user', 'admin')).body.exercises).toEqual([{ exerciseId: String(ids.exoA), total: 1 }]);

    // clients cannot create or use the admin routes
    await request(app).post(`/api/admin/voice-messages/exercises/${ids.exoA}`).set('x-test-user', 'clientA').attach('audio', AUDIO, 'x.webm').expect(403);
    // deleting removes it for everyone
    await request(app).delete(`/api/admin/voice-messages/${g.id}`).set('x-test-user', 'admin').expect(200);
    expect((await request(app).get(`/api/voice-messages/exercises/${ids.exoA}`).set('x-test-user', 'clientB')).body.messages).toHaveLength(0);
    await request(app).get(`/api/voice-messages/${g.id}/audio`).set('x-test-user', 'clientA').expect(404);
  });

  it('exercise-wide message needs audio or text and a real exercise', async () => {
    const app = buildApp();
    const base = (id: any) => request(app).post(`/api/admin/voice-messages/exercises/${id}`).set('x-test-user', 'admin').set('X-Forwarded-For', `10.3.0.${ipCounter}`);
    await base(ids.exoA).expect(400);
    await base(new mongoose.Types.ObjectId()).attach('audio', AUDIO, 'x.webm').expect(404);
    await base(ids.exoA).attach('audio', Buffer.from('not audio at all, plain text'), 'x.webm').expect(400);
    expect(await VoiceMessage.countDocuments()).toBe(0);
  });

  it('rate limits sending', async () => {
    const app = buildApp();
    let last = 0;
    for (let i = 0; i < 122; i++) last = (await send(app, 'clientA', 'exoA', { audio: null, body: `m${i}` }).set('X-Forwarded-For', '9.9.9.9')).status;
    expect(last).toBe(429);
  });
});
