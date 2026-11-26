/**
 * Integration tests against a REAL MongoDB (set MONGODB_TEST_URI). Skipped otherwise.
 * File storage and email use in-memory fakes: MinIO and the SMTP server themselves are NOT exercised here.
 */
import express from 'express';
import mongoose from 'mongoose';
import { Readable } from 'stream';
import request from 'supertest';
import User from '../models/User.model';
import Complaint from '../models/Complaint.model';
import { setMailerForTests, type MailMessage } from './mailer';
import { setPrivateStorageForTests } from './privateStorage';
import complaintsRoutes from '../routes/complaints.routes';
import complaintsAdminRoutes from '../routes/admin/complaints.routes';

const URI = process.env.MONGODB_TEST_URI;
const maybe = URI ? describe : describe.skip;

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 7)]);

const mails: MailMessage[] = [];
const files = new Map<string, { data: Buffer; mime: string }>();
const fakeStorage = {
  async put(key: string, data: Buffer, mime: string) { files.set(key, { data, mime }); },
  async get(key: string) {
    const f = files.get(key);
    if (!f) throw new Error('NoSuchKey');
    return { stream: Readable.from([f.data]), size: f.data.length };
  },
};

const ids: Record<string, mongoose.Types.ObjectId> = {
  clientA: new mongoose.Types.ObjectId(),
  clientB: new mongoose.Types.ObjectId(),
  admin: new mongoose.Types.ObjectId(),
};
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    const who = String(req.headers['x-test-user'] || 'clientA');
    req.user = { _id: ids[who], role: who === 'admin' ? 'admin' : who === 'employee' ? 'employee' : 'user' };
    next();
  });
  app.use('/api/complaints', complaintsRoutes);
  app.use('/api/admin/complaints', complaintsAdminRoutes);
  return app;
}

// Every test acts from its own client address, so the per-address rate limits do not leak between tests.
let testIp = '10.0.0.1';
let testIpCounter = 1;

const create = (app: express.Express, who: string, over: Record<string, string> = {}, withImage = false) => {
  const r = request(app).post('/api/complaints').set('x-test-user', who).set('X-Forwarded-For', testIp)
    .field('category', over.category ?? 'technical').field('subject', over.subject ?? "L'application plante").field('description', over.description ?? "Quand j'ouvre l'écran des séances l'application se ferme.");
  return withImage ? r.attach('attachments', PNG, 'capture.png') : r;
};

maybe('complaints (real MongoDB)', () => {
  beforeAll(async () => {
    await mongoose.connect(URI as string);
    await mongoose.connection.dropDatabase();
    await Complaint.init();
    setMailerForTests({ async send(m) { mails.push(m); } });
    setPrivateStorageForTests(fakeStorage);
  });
  afterAll(async () => {
    setMailerForTests(null);
    setPrivateStorageForTests(null);
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
  beforeEach(async () => {
    testIp = `10.0.0.${++testIpCounter}`;
    mails.length = 0;
    files.clear();
    await Promise.all([Complaint.deleteMany({}), User.deleteMany({})]);
    await User.create([
      { _id: ids.clientA, email: 'a@example.com', name: 'Client A', passwordHash: 'x', role: 'user' },
      { _id: ids.clientB, email: 'b@example.com', name: 'Client B', passwordHash: 'x', role: 'user' },
      { _id: ids.admin, email: 'admin@example.com', name: 'Admin', passwordHash: 'x', role: 'admin' },
    ]);
  });

  it('a client creates a complaint with an image: stored privately, admins are notified, no storage key leaks', async () => {
    const app = buildApp();
    const res = await create(app, 'clientA', { category: 'billing' }, true).expect(201);
    const c = res.body.complaint;
    expect(c.status).toBe('new');
    expect(c.statusLabel).toBe('Nouvelle');
    expect(c.categoryLabel).toBe('Abonnement et paiement');
    expect(c.reference).toMatch(/^REC-[0-9A-F]{8}$/);
    expect(c.messages[0].attachments).toHaveLength(1);
    expect(JSON.stringify(c)).not.toMatch(/complaints\/[0-9a-f]{24}\//); // no storage key in the response
    expect([...files.keys()][0]).toMatch(/^complaints\/[0-9a-f]{24}\/[0-9a-f]{32}\.png$/);
    expect(mails).toHaveLength(1);
    expect(mails[0].subject).toMatch(/Nouvelle réclamation REC-/);
    const stats = (await request(app).get('/api/admin/complaints/stats').set('x-test-user', 'admin').expect(200)).body.stats;
    expect(stats).toMatchObject({ total: 1, new: 1, pending: 1, unread: 1, resolved: 0 });
  });

  it('validates the input (category, subject, description) and the files (real type, size, count)', async () => {
    const app = buildApp();
    await create(app, 'clientA', { category: 'nope' }).expect(400);
    await create(app, 'clientA', { subject: 'ab' }).expect(400);
    await create(app, 'clientA', { description: 'court' }).expect(400);
    const disguised = await request(app).post('/api/complaints').set('x-test-user', 'clientA')
      .field('category', 'technical').field('subject', 'Sujet valide').field('description', 'Description assez longue.')
      .attach('attachments', Buffer.from('<?php system($_GET[1]); ?>'), 'photo.png').expect(400);
    expect(disguised.body.message).toMatch(/JPEG, PNG ou WebP/);
    const tooBig = await request(app).post('/api/complaints').set('x-test-user', 'clientA')
      .field('category', 'technical').field('subject', 'Sujet valide').field('description', 'Description assez longue.')
      .attach('attachments', Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]), 'big.png').expect(400);
    expect(tooBig.body.message).toMatch(/5 Mo/);
    let r = request(app).post('/api/complaints').set('x-test-user', 'clientA').field('category', 'technical').field('subject', 'Sujet valide').field('description', 'Description assez longue.');
    for (let i = 0; i < 5; i++) r = r.attach('attachments', PNG, `p${i}.png`);
    await r.expect(400);
    expect(await Complaint.countDocuments()).toBe(0);
    expect(files.size).toBe(0); // nothing is stored for rejected requests
  });

  it('isolation: a client only sees, opens, replies to and downloads from their own complaints', async () => {
    const app = buildApp();
    const mine = (await create(app, 'clientA', {}, true).expect(201)).body.complaint;
    await create(app, 'clientB').expect(201);
    expect((await request(app).get('/api/complaints').set('x-test-user', 'clientA')).body.complaints).toHaveLength(1);
    expect((await request(app).get('/api/complaints').set('x-test-user', 'clientB')).body.complaints.map((x: any) => x.id)).not.toContain(mine.id);
    await request(app).get(`/api/complaints/${mine.id}`).set('x-test-user', 'clientB').expect(404);
    await request(app).post(`/api/complaints/${mine.id}/messages`).set('x-test-user', 'clientB').field('body', 'intrusion').expect(404);
    const att = mine.messages[0].attachments[0].id;
    await request(app).get(`/api/complaints/${mine.id}/attachments/${att}`).set('x-test-user', 'clientB').expect(404);
    await request(app).get(`/api/complaints/not-an-id`).set('x-test-user', 'clientA').expect(404);
    // the owner can download it, with the right type and no caching
    const dl = await request(app).get(`/api/complaints/${mine.id}/attachments/${att}`).set('x-test-user', 'clientA').expect(200);
    expect(dl.headers['content-type']).toBe('image/png');
    expect(dl.headers['cache-control']).toMatch(/no-store/);
    expect(Buffer.compare(dl.body, PNG)).toBe(0);
  });

  it('admin routes reject non-admins (clients and employees)', async () => {
    const app = buildApp();
    await request(app).get('/api/admin/complaints').set('x-test-user', 'clientA').expect(403);
    await request(app).get('/api/admin/complaints/stats').set('x-test-user', 'employee').expect(403);
    await request(app).patch('/api/admin/complaints/x').set('x-test-user', 'clientA').send({ status: 'closed' }).expect(403);
  });

  it('full conversation: admin reply → client unread → client reads → client replies → admin sees it', async () => {
    const app = buildApp();
    const c = (await create(app, 'clientA').expect(201)).body.complaint;
    mails.length = 0;

    const opened = await request(app).get(`/api/admin/complaints/${c.id}`).set('x-test-user', 'admin').expect(200);
    expect(opened.body.complaint.client).toMatchObject({ name: 'Client A', email: 'a@example.com' });
    expect((await request(app).get('/api/admin/complaints/stats').set('x-test-user', 'admin')).body.stats.unread).toBe(0); // opening marks it read

    const reply = await request(app).post(`/api/admin/complaints/${c.id}/reply`).set('x-test-user', 'admin').field('body', 'Bonjour, pouvez-vous préciser le modèle de votre téléphone ?').expect(201);
    expect(reply.body.complaint.status).toBe('waiting_client');
    expect(mails).toHaveLength(1);
    expect(mails[0].to).toBe('a@example.com');
    expect(mails[0].subject).toMatch(/Réponse à votre réclamation/);

    expect((await request(app).get('/api/complaints/unread-count').set('x-test-user', 'clientA')).body.unread).toBe(1);
    const list = (await request(app).get('/api/complaints').set('x-test-user', 'clientA')).body.complaints[0];
    expect(list.unread).toBe(1);
    expect(list.lastMessagePreview).toMatch(/modèle de votre téléphone/);

    const read = (await request(app).get(`/api/complaints/${c.id}`).set('x-test-user', 'clientA').expect(200)).body.complaint;
    expect(read.messages).toHaveLength(2);
    expect(read.messages[1].authorType).toBe('admin');
    expect((await request(app).get('/api/complaints/unread-count').set('x-test-user', 'clientA')).body.unread).toBe(0);

    const again = await request(app).post(`/api/complaints/${c.id}/messages`).set('x-test-user', 'clientA').field('body', "C'est un Samsung A54.").expect(201);
    expect(again.body.complaint.status).toBe('in_progress'); // the client answered: back to the team
    const stats = (await request(app).get('/api/admin/complaints/stats').set('x-test-user', 'admin')).body.stats;
    expect(stats.unread).toBe(1);
    expect(stats.inProgress).toBe(1);
    await request(app).post(`/api/complaints/${c.id}/messages`).set('x-test-user', 'clientA').field('body', '').expect(400); // empty message
  });

  it('internal notes stay invisible to the client in every response, and never email or count as unread', async () => {
    const app = buildApp();
    const c = (await create(app, 'clientA').expect(201)).body.complaint;
    await request(app).get(`/api/admin/complaints/${c.id}`).set('x-test-user', 'admin'); // read it
    mails.length = 0;
    const note = 'NOTE-CONFIDENTIELLE-XYZ: client déjà signalé, ne pas rembourser';
    const out = await request(app).post(`/api/admin/complaints/${c.id}/notes`).set('x-test-user', 'admin').send({ body: note }).expect(201);
    expect(out.body.complaint.messages.some((m: any) => m.internal && m.body === note)).toBe(true);
    expect(mails).toHaveLength(0);
    const stored: any = await Complaint.findById(c.id);
    expect(stored.unreadForClient).toBe(0);
    for (const url of [`/api/complaints/${c.id}`, '/api/complaints', '/api/complaints/unread-count']) {
      const res = await request(app).get(url).set('x-test-user', 'clientA').expect(200);
      expect(JSON.stringify(res.body)).not.toContain('NOTE-CONFIDENTIELLE');
    }
    await request(app).post(`/api/admin/complaints/${c.id}/notes`).set('x-test-user', 'admin').send({ body: '  ' }).expect(400);
  });

  it('status and priority: resolved/closed dates, closed complaints refuse replies, reopening works', async () => {
    const app = buildApp();
    const c = (await create(app, 'clientA').expect(201)).body.complaint;
    const resolved = await request(app).patch(`/api/admin/complaints/${c.id}`).set('x-test-user', 'admin').send({ status: 'resolved', priority: 'urgent' }).expect(200);
    expect(resolved.body.complaint.status).toBe('resolved');
    expect(resolved.body.complaint.priority).toBe('urgent');
    expect(resolved.body.complaint.resolvedAt).toBeTruthy();
    await request(app).patch(`/api/admin/complaints/${c.id}`).set('x-test-user', 'admin').send({ status: 'bogus' }).expect(400);
    await request(app).patch(`/api/admin/complaints/${c.id}`).set('x-test-user', 'admin').send({ priority: 'bogus' }).expect(400);

    const closed = await request(app).patch(`/api/admin/complaints/${c.id}`).set('x-test-user', 'admin').send({ status: 'closed' }).expect(200);
    expect(closed.body.complaint.closedAt).toBeTruthy();
    expect((await request(app).post(`/api/complaints/${c.id}/messages`).set('x-test-user', 'clientA').field('body', 'merci').expect(409)).body.code).toBe('closed');
    await request(app).post(`/api/admin/complaints/${c.id}/reply`).set('x-test-user', 'admin').field('body', 'ok').expect(409);

    const reopened = await request(app).patch(`/api/admin/complaints/${c.id}`).set('x-test-user', 'admin').send({ status: 'in_progress' }).expect(200);
    expect(reopened.body.complaint.closedAt).toBeNull();
    await request(app).post(`/api/complaints/${c.id}/messages`).set('x-test-user', 'clientA').field('body', 'merci').expect(201);
    // a client reply on a resolved complaint reopens it for the team
    await request(app).patch(`/api/admin/complaints/${c.id}`).set('x-test-user', 'admin').send({ status: 'resolved' }).expect(200);
    const back = await request(app).post(`/api/complaints/${c.id}/messages`).set('x-test-user', 'clientA').field('body', 'ça ne marche toujours pas').expect(201);
    expect(back.body.complaint.status).toBe('in_progress');
  });

  it('admin list: filters (status, category, priority, client, search, date, unread), counters, client profile', async () => {
    const app = buildApp();
    const a = (await create(app, 'clientA', { category: 'billing', subject: 'Facture en double' }).expect(201)).body.complaint;
    await create(app, 'clientB', { category: 'training', subject: 'Séance introuvable' }).expect(201);
    await request(app).patch(`/api/admin/complaints/${a.id}`).set('x-test-user', 'admin').send({ priority: 'high', status: 'in_progress' });
    const get = async (qs: string) => (await request(app).get(`/api/admin/complaints${qs}`).set('x-test-user', 'admin').expect(200)).body.complaints;
    expect(await get('')).toHaveLength(2);
    expect((await get('?status=in_progress')).map((x: any) => x.subject)).toEqual(['Facture en double']);
    expect((await get('?category=training')).map((x: any) => x.subject)).toEqual(['Séance introuvable']);
    expect((await get('?priority=high')).map((x: any) => x.subject)).toEqual(['Facture en double']);
    expect((await get(`?clientId=${ids.clientB}`)).map((x: any) => x.subject)).toEqual(['Séance introuvable']);
    expect((await get('?q=b@example.com')).map((x: any) => x.subject)).toEqual(['Séance introuvable']);
    expect((await get('?q=facture')).map((x: any) => x.subject)).toEqual(['Facture en double']);
    expect(await get('?from=2999-01-01')).toHaveLength(0);
    expect(await get('?from=2000-01-01&to=2999-01-01')).toHaveLength(2);
    expect(await get('?unread=1')).toHaveLength(2);
    expect((await get('?q=facture'))[0].client).toMatchObject({ name: 'Client A', email: 'a@example.com' });
    expect((await get('?q=.*')).length).toBe(0); // regex characters are escaped, not interpreted
  });

  it('admin can download attachments of any complaint; a missing file is a clean 404', async () => {
    const app = buildApp();
    const c = (await create(app, 'clientA', {}, true).expect(201)).body.complaint;
    const att = c.messages[0].attachments[0].id;
    const dl = await request(app).get(`/api/admin/complaints/${c.id}/attachments/${att}`).set('x-test-user', 'admin').expect(200);
    expect(Buffer.compare(dl.body, PNG)).toBe(0);
    await request(app).get(`/api/admin/complaints/${c.id}/attachments/${new mongoose.Types.ObjectId()}`).set('x-test-user', 'admin').expect(404);
  });

  it('rate limits complaint creation', async () => {
    const app = buildApp();
    let last = 0;
    for (let i = 0; i < 12; i++) last = (await create(app, 'clientA').set('X-Forwarded-For', '7.7.7.7')).status;
    expect(last).toBe(429);
  });
});
