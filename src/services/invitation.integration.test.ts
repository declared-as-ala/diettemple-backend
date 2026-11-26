/**
 * Integration tests against a REAL MongoDB (set MONGODB_TEST_URI, e.g. mongodb://127.0.0.1:27098/dt_invitations_test).
 * Skipped when the variable is missing. Email delivery uses a fake mailer: the SMTP server itself is NOT exercised here.
 */
import express from 'express';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import request from 'supertest';
import ClientInvitation from '../models/ClientInvitation.model';
import User from '../models/User.model';
import AuditLog from '../models/AuditLog.model';
import { setMailerForTests, type MailMessage } from './mailer';
import {
  acceptInvitation, checkToken, createInvitation, listInvitations, resendInvitation, revokeInvitation, InvitationError,
} from './invitation.service';
import invitationsAdminRoutes from '../routes/admin/invitations.routes';
import { activationPageRouter, invitationsApiRouter } from '../routes/invitations.public';

const URI = process.env.MONGODB_TEST_URI;
const maybe = URI ? describe : describe.skip;

const sent: MailMessage[] = [];
let failNext = false;
const fakeMailer = {
  async send(mail: MailMessage) {
    if (failNext) { failNext = false; throw new Error('SMTP indisponible'); }
    sent.push(mail);
  },
};
const tokenFrom = (mail: MailMessage) => decodeURIComponent(mail.text.match(/token=([A-Za-z0-9_%-]+)/)![1]);
const lastToken = () => tokenFrom(sent[sent.length - 1]);

const adminId = new mongoose.Types.ObjectId();
let role = 'admin';
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => { req.user = { _id: adminId, role }; next(); });
  app.use('/api/admin/invitations', invitationsAdminRoutes);
  app.use('/activate', activationPageRouter);
  app.use('/api/invitations', invitationsApiRouter);
  return app;
}

maybe('client invitations (real MongoDB)', () => {
  beforeAll(async () => {
    await mongoose.connect(URI as string);
    await mongoose.connection.dropDatabase();
    await Promise.all([ClientInvitation.init(), User.init()]);
    setMailerForTests(fakeMailer);
  });
  afterAll(async () => {
    setMailerForTests(null);
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
  beforeEach(async () => {
    sent.length = 0;
    failNext = false;
    role = 'admin';
    await Promise.all([ClientInvitation.deleteMany({}), User.deleteMany({}), AuditLog.deleteMany({})]);
  });

  it('creates and sends an invitation: normalized email, only the hash is stored, no account yet', async () => {
    const inv = await createInvitation({ email: '  New.Client@Example.COM ', name: 'Sami', invitedBy: adminId });
    expect(inv.status).toBe('sent');
    expect(inv.email).toBe('new.client@example.com');
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('new.client@example.com');
    const token = lastToken();
    expect(inv.tokenHash).toBeDefined();
    expect(inv.tokenHash).not.toBe(token);
    expect(JSON.stringify(inv.toObject())).not.toContain(token);
    expect(await User.countDocuments()).toBe(0); // the account is NOT created before acceptance
    const hours = (inv.expiresAt.getTime() - Date.now()) / 3600_000;
    expect(hours).toBeGreaterThan(47.9);
    expect(hours).toBeLessThanOrEqual(48);
  });

  it('activates the account once: bcrypt password, role user, token consumed, audit entry, no password in the email', async () => {
    await createInvitation({ email: 'a@example.com', invitedBy: adminId });
    const token = lastToken();
    const out = await acceptInvitation(token, 'Passw0rdOK', 'Passw0rdOK');
    expect(out.email).toBe('a@example.com');
    const user: any = await User.findOne({ email: 'a@example.com' });
    expect(user.role).toBe('user');
    expect(user.isActive).toBe(true);
    expect(await bcrypt.compare('Passw0rdOK', user.passwordHash)).toBe(true);
    expect(user.passwordHash).not.toContain('Passw0rdOK');
    const inv: any = await ClientInvitation.findOne({ email: 'a@example.com' });
    expect(inv.status).toBe('accepted');
    expect(inv.tokenHash).toBeUndefined();
    expect(String(inv.userId)).toBe(String(user._id));
    expect(await AuditLog.countDocuments({ targetUserId: user._id, actionType: 'client_created' })).toBe(1);
    expect(sent[0].html + sent[0].text).not.toContain('Passw0rdOK');
  });

  it('a used token cannot be reused', async () => {
    await createInvitation({ email: 'b@example.com', invitedBy: adminId });
    const token = lastToken();
    await acceptInvitation(token, 'Passw0rdOK', 'Passw0rdOK');
    await expect(acceptInvitation(token, 'Another1Pass', 'Another1Pass')).rejects.toMatchObject({ code: 'used' });
    expect((await checkToken(token)) as any).toMatchObject({ ok: false, reason: 'used' });
    expect(await User.countDocuments({ email: 'b@example.com' })).toBe(1);
  });

  it('rejects weak or mismatching passwords without consuming the token', async () => {
    await createInvitation({ email: 'c@example.com', invitedBy: adminId });
    const token = lastToken();
    await expect(acceptInvitation(token, 'short1', 'short1')).rejects.toMatchObject({ code: 'weak_password' });
    await expect(acceptInvitation(token, 'Passw0rdOK', 'Passw0rdKO')).rejects.toMatchObject({ code: 'mismatch' });
    expect(((await checkToken(token)) as any).ok).toBe(true);
    await acceptInvitation(token, 'Passw0rdOK', 'Passw0rdOK'); // still usable
  });

  it('two simultaneous activations: exactly one account, one success', async () => {
    await createInvitation({ email: 'race@example.com', invitedBy: adminId });
    const token = lastToken();
    const results = await Promise.allSettled([
      acceptInvitation(token, 'Passw0rdOK', 'Passw0rdOK'),
      acceptInvitation(token, 'Passw0rdOK', 'Passw0rdOK'),
      acceptInvitation(token, 'Passw0rdOK', 'Passw0rdOK'),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await User.countDocuments({ email: 'race@example.com' })).toBe(1);
  });

  it('prevents duplicates: open invitation, simultaneous creations, existing account (any letter case)', async () => {
    await createInvitation({ email: 'dup@example.com', invitedBy: adminId });
    await expect(createInvitation({ email: 'DUP@example.com', invitedBy: adminId })).rejects.toMatchObject({ code: 'already_invited', httpStatus: 409 });

    const results = await Promise.allSettled([
      createInvitation({ email: 'same@example.com', invitedBy: adminId }),
      createInvitation({ email: 'same@example.com', invitedBy: adminId }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await ClientInvitation.countDocuments({ email: 'same@example.com' })).toBe(1);

    await User.create({ email: 'Existing@Example.com', passwordHash: await bcrypt.hash('x1234567', 4), role: 'user' });
    await expect(createInvitation({ email: 'existing@example.com', invitedBy: adminId })).rejects.toMatchObject({ code: 'account_exists' });
    await expect(createInvitation({ email: 'not an email', invitedBy: adminId })).rejects.toMatchObject({ code: 'invalid_email' });
  });

  it('resend: new token and expiry, the previous link stops working and is reported as replaced', async () => {
    const inv = await createInvitation({ email: 'r@example.com', invitedBy: adminId });
    const oldToken = lastToken();
    const again = await resendInvitation(String(inv._id), adminId);
    const newToken = lastToken();
    expect(newToken).not.toBe(oldToken);
    expect(again.sendCount).toBe(2);
    expect(sent).toHaveLength(2);
    expect((await checkToken(oldToken)) as any).toMatchObject({ ok: false, reason: 'replaced' });
    await expect(acceptInvitation(oldToken, 'Passw0rdOK', 'Passw0rdOK')).rejects.toMatchObject({ code: 'replaced' });
    expect(((await checkToken(newToken)) as any).ok).toBe(true);
    await acceptInvitation(newToken, 'Passw0rdOK', 'Passw0rdOK');
  });

  it('revoked invitations are rejected; they cannot be resent, but a new one can be created', async () => {
    const inv = await createInvitation({ email: 'v@example.com', invitedBy: adminId });
    const token = lastToken();
    const revoked = await revokeInvitation(String(inv._id), adminId);
    expect(revoked.status).toBe('revoked');
    expect((await checkToken(token)) as any).toMatchObject({ ok: false, reason: 'revoked' });
    await expect(acceptInvitation(token, 'Passw0rdOK', 'Passw0rdOK')).rejects.toBeInstanceOf(InvitationError);
    await expect(resendInvitation(String(inv._id), adminId)).rejects.toMatchObject({ code: 'revoked' });
    const fresh = await createInvitation({ email: 'v@example.com', invitedBy: adminId });
    expect(fresh.status).toBe('sent');
  });

  it('expired tokens are rejected; a new invitation can then be created for the same email', async () => {
    const inv = await createInvitation({ email: 'e@example.com', invitedBy: adminId });
    const token = lastToken();
    await ClientInvitation.updateOne({ _id: inv._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await checkToken(token)) as any).toMatchObject({ ok: false, reason: 'expired' });
    await expect(acceptInvitation(token, 'Passw0rdOK', 'Passw0rdOK')).rejects.toMatchObject({ code: 'expired' });
    expect(await User.countDocuments()).toBe(0);
    const list = await listInvitations({ status: 'expired' });
    expect(list.map((i) => i.email)).toContain('e@example.com');
    const fresh = await createInvitation({ email: 'e@example.com', invitedBy: adminId });
    expect(fresh.status).toBe('sent');
  });

  it('email failure: status "failed" (visible to the admin), then a resend delivers it', async () => {
    failNext = true;
    const inv = await createInvitation({ email: 'f@example.com', invitedBy: adminId });
    expect(inv.status).toBe('failed');
    expect(inv.lastSendError).toMatch(/SMTP/);
    expect(sent).toHaveLength(0);
    const ok = await resendInvitation(String(inv._id), adminId);
    expect(ok.status).toBe('sent');
    expect(ok.lastSendError).toBeUndefined();
    expect(sent).toHaveLength(1);
  });

  it('listing filters by status and search', async () => {
    const a = await createInvitation({ email: 'one@example.com', invitedBy: adminId });
    await createInvitation({ email: 'two@example.com', invitedBy: adminId });
    await revokeInvitation(String(a._id), adminId);
    expect((await listInvitations({ status: 'revoked' })).map((i) => i.email)).toEqual(['one@example.com']);
    expect((await listInvitations({ status: 'sent' })).map((i) => i.email)).toEqual(['two@example.com']);
    expect((await listInvitations({ q: 'TWO' })).map((i) => i.email)).toEqual(['two@example.com']);
    expect((await listInvitations({})).length).toBe(2);
  });

  describe('HTTP', () => {
    it('admin API: only admins; create, list, resend, revoke', async () => {
      const app = buildApp();
      role = 'user';
      await request(app).post('/api/admin/invitations').send({ email: 'x@example.com' }).expect(403);
      role = 'employee';
      await request(app).get('/api/admin/invitations').expect(403);
      role = 'admin';
      const created = await request(app).post('/api/admin/invitations').send({ email: 'x@example.com', name: 'X' }).expect(201);
      expect(created.body.invitation.status).toBe('sent');
      expect(created.body.invitation).not.toHaveProperty('tokenHash');
      await request(app).post('/api/admin/invitations').send({ email: 'x@example.com' }).expect(409);
      await request(app).post('/api/admin/invitations').send({ email: 'nope' }).expect(400);
      const id = created.body.invitation._id;
      expect((await request(app).get('/api/admin/invitations?status=sent').expect(200)).body.invitations).toHaveLength(1);
      await request(app).post(`/api/admin/invitations/${id}/resend`).expect(200);
      await request(app).post(`/api/admin/invitations/${id}/revoke`).expect(200);
      await request(app).post('/api/admin/invitations/not-an-id/resend').expect(400);
    });

    it('activation page and accept API: full browser flow, secure headers, friendly errors', async () => {
      const app = buildApp();
      role = 'admin';
      await request(app).post('/api/admin/invitations').send({ email: 'web@example.com', name: 'Web' }).expect(201);
      const token = lastToken();

      const page = await request(app).get('/activate').query({ token }).expect(200);
      expect(page.headers['content-type']).toMatch(/html/);
      expect(page.headers['cache-control']).toBe('no-store');
      expect(page.headers['referrer-policy']).toBe('no-referrer');
      expect(page.headers['x-frame-options']).toBe('DENY');
      expect(page.headers['content-security-policy']).toMatch(/script-src 'nonce-/);
      expect(page.text).toContain('web@example.com');
      expect(page.text).toContain('Activer mon compte');

      await request(app).get('/activate').query({ token: 'x'.repeat(40) }).expect(400);
      await request(app).get('/activate').expect(400);

      await request(app).post('/api/invitations/accept').send({ token, password: 'abc', confirmPassword: 'abc' }).expect(400);
      const ok = await request(app).post('/api/invitations/accept').send({ token, password: 'Passw0rdOK', confirmPassword: 'Passw0rdOK' }).expect(200);
      expect(ok.body).toEqual({ success: true, email: 'web@example.com' });
      const reuse = await request(app).post('/api/invitations/accept').send({ token, password: 'Passw0rdOK', confirmPassword: 'Passw0rdOK' }).expect(410);
      expect(reuse.body.code).toBe('used');
      const after = await request(app).get('/activate').query({ token }).expect(410);
      expect(after.text).toMatch(/déjà/);
      expect((await request(app).get('/api/invitations/validate').query({ token })).body.valid).toBe(false);
    });

    it('rate limits the accept endpoint', async () => {
      const app = buildApp();
      let last = 0;
      for (let i = 0; i < 17; i++) {
        last = (await request(app).post('/api/invitations/accept').set('X-Forwarded-For', '9.9.9.9').send({ token: 'bad', password: 'x', confirmPassword: 'x' })).status;
      }
      expect(last).toBe(429);
    });
  });

  it('existing accounts keep working: their password still verifies and nothing changes', async () => {
    const hash = await bcrypt.hash('OldPass123', 10);
    const existing: any = await User.create({ email: 'old@example.com', passwordHash: hash, role: 'user' });
    await createInvitation({ email: 'new@example.com', invitedBy: adminId });
    await acceptInvitation(lastToken(), 'Passw0rdOK', 'Passw0rdOK');
    const reloaded: any = await User.findById(existing._id);
    expect(reloaded.passwordHash).toBe(hash);
    expect(await bcrypt.compare('OldPass123', reloaded.passwordHash)).toBe(true);
  });
});
