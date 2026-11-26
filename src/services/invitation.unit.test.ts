import express from 'express';
import request from 'supertest';
import {
  displayStatus, generateToken, hashToken, isValidEmail, normalizeEmail, passwordProblems, activationUrl, inviteExpiryHours,
} from './invitation.service';
import { buildInvitationEmail } from './invitationEmail';
import { renderActivationPage } from '../routes/invitations.public';
import { rateLimit } from '../middleware/rateLimit.middleware';

describe('invitation tokens', () => {
  it('are random, long and url-safe; only their SHA-256 is meant to be stored', () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(43); // 256 bits in base64url
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    const h = hashToken(a);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain(a);
    expect(hashToken(a)).toBe(h);
  });

  it('activation links carry the token and use the public base url', () => {
    const prev = process.env.INVITATION_BASE_URL;
    process.env.INVITATION_BASE_URL = 'https://api.example.test/';
    expect(activationUrl('abc_DEF-123')).toBe('https://api.example.test/activate?token=abc_DEF-123');
    if (prev === undefined) delete process.env.INVITATION_BASE_URL; else process.env.INVITATION_BASE_URL = prev;
  });

  it('expiry defaults to 48 h and is configurable (invalid values fall back)', () => {
    const prev = process.env.INVITE_EXPIRY_HOURS;
    delete process.env.INVITE_EXPIRY_HOURS;
    expect(inviteExpiryHours()).toBe(48);
    process.env.INVITE_EXPIRY_HOURS = '72';
    expect(inviteExpiryHours()).toBe(72);
    process.env.INVITE_EXPIRY_HOURS = '-3';
    expect(inviteExpiryHours()).toBe(48);
    process.env.INVITE_EXPIRY_HOURS = 'abc';
    expect(inviteExpiryHours()).toBe(48);
    if (prev === undefined) delete process.env.INVITE_EXPIRY_HOURS; else process.env.INVITE_EXPIRY_HOURS = prev;
  });
});

describe('email normalization and password rules', () => {
  it('normalizes and validates emails', () => {
    expect(normalizeEmail('  Client@Example.COM ')).toBe('client@example.com');
    expect(normalizeEmail(undefined)).toBe('');
    expect(isValidEmail('a@b.co')).toBe(true);
    ['', 'a', 'a@b', 'a b@c.com', '@c.com', 'a@@c.com'].forEach((e) => expect(isValidEmail(e)).toBe(false));
  });

  it('lists exactly which password rules fail', () => {
    expect(passwordProblems('abcdefg1')).toEqual([]);
    expect(passwordProblems('short1')).toEqual(['Au moins 8 caractères']);
    expect(passwordProblems('12345678')).toEqual(['Au moins une lettre']);
    expect(passwordProblems('abcdefgh')).toEqual(['Au moins un chiffre']);
    expect(passwordProblems(undefined as any)).toHaveLength(1);
    expect(passwordProblems('a1'.repeat(70))).toEqual(['Mot de passe trop long (128 caractères maximum)']);
  });
});

describe('display status', () => {
  const future = new Date(Date.now() + 3600_000);
  const past = new Date(Date.now() - 1000);
  it('a sent/pending/failed invitation past its expiry is shown expired', () => {
    expect(displayStatus({ status: 'sent', expiresAt: future })).toBe('sent');
    expect(displayStatus({ status: 'sent', expiresAt: past })).toBe('expired');
    expect(displayStatus({ status: 'pending', expiresAt: past })).toBe('expired');
    expect(displayStatus({ status: 'failed', expiresAt: past })).toBe('expired');
  });
  it('final states never change with time', () => {
    expect(displayStatus({ status: 'accepted', expiresAt: past })).toBe('accepted');
    expect(displayStatus({ status: 'revoked', expiresAt: past })).toBe('revoked');
  });
});

describe('invitation email', () => {
  const mail = buildInvitationEmail({
    to: 'client@example.com', name: 'Sami <script>alert(1)</script>', activationUrl: 'https://api.test/activate?token=TOK_123',
    expiresAt: new Date('2026-12-01T10:00:00Z'), expiryHours: 48,
  });
  it('has the activation button, link, expiry, support contact and the logo', () => {
    expect(mail.subject).toMatch(/invitation DietTemple/i);
    expect(mail.html).toContain('Activer mon compte');
    expect(mail.html).toContain('https://api.test/activate?token=TOK_123');
    expect(mail.text).toContain('https://api.test/activate?token=TOK_123');
    expect(mail.html).toMatch(/expire le/);
    expect(mail.html).toMatch(/48&nbsp;h/);
    expect(mail.html).toContain('cid:');
    expect(mail.attachments?.[0].cid).toBeTruthy();
    expect(mail.html).toMatch(/mailto:/);
  });
  it('never contains a password and escapes the client name', () => {
    expect(mail.html.toLowerCase()).not.toMatch(/mot de passe : |password:|mdp/);
    expect(mail.html).not.toContain('<script>alert(1)</script>');
    expect(mail.html).toContain('&lt;script&gt;');
  });
});

describe('activation page', () => {
  it('embeds the token safely (a token cannot close the script tag) and shows the rules', () => {
    const html = renderActivationPage({ kind: 'form', token: 'abc</script><img src=x>', email: 'a@b.com' }, 'NONCE');
    expect(html).not.toContain('abc</script>');
    expect(html).toContain('\\u003c/script>');
    expect(html).toContain('nonce="NONCE"');
    expect(html).toContain('Au moins 8 caractères');
    expect(html).toContain('Confirmer le mot de passe');
    expect(html).toContain('autocomplete="new-password"');
    expect(html).toContain('width=device-width');
    expect(html).toContain('history.replaceState'); // the token is removed from the address bar
  });
  it('escapes the email and shows a friendly error state', () => {
    const form = renderActivationPage({ kind: 'form', token: 'T'.repeat(30), email: '<b>x</b>@a.com' }, 'N');
    expect(form).not.toContain('<b>x</b>@a.com');
    const err = renderActivationPage({ kind: 'error', reason: 'expired', message: 'Ce lien a expiré.' }, 'N');
    expect(err).toContain('Ce lien a expiré.');
    expect(err).not.toContain('<form');
  });
});

describe('rate limiter', () => {
  it('answers 429 with Retry-After after the limit, per client address', async () => {
    const app = express();
    app.use(rateLimit({ name: 't', windowMs: 60_000, max: 3 }));
    app.get('/x', (_req, res) => res.json({ ok: true }));
    for (let i = 0; i < 3; i++) await request(app).get('/x').set('X-Forwarded-For', '1.1.1.1').expect(200);
    const blocked = await request(app).get('/x').set('X-Forwarded-For', '1.1.1.1').expect(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    await request(app).get('/x').set('X-Forwarded-For', '2.2.2.2').expect(200); // another client is not affected
  });
});
