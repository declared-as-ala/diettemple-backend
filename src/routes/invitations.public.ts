/**
 * Public (no login) invitation endpoints + the activation page.
 *   GET  /activate?token=...          branded, responsive password-setup page
 *   GET  /api/invitations/validate    { valid, reason }
 *   POST /api/invitations/accept      { token, password, confirmPassword }
 * Strictly rate limited. Responses never reveal whether an email has an account unless the caller holds a valid token.
 */
import crypto from 'crypto';
import fs from 'fs';
import { Router, Request, Response } from 'express';
import { rateLimit } from '../middleware/rateLimit.middleware';
import { acceptInvitation, checkToken, InvitationError, PASSWORD_RULES, REASON_MESSAGES } from '../services/invitation.service';
import { supportEmail } from '../services/mailer';
import { dietTempleLogoPath } from '../utils/brandAssets';

const GOLD = '#C9A45C';

const acceptLimiter = rateLimit({ name: 'invite-accept', windowMs: 15 * 60 * 1000, max: 15, message: 'Trop de tentatives. Réessayez dans quelques minutes.' });
const checkLimiter = rateLimit({ name: 'invite-check', windowMs: 15 * 60 * 1000, max: 60 });

let logoDataUri: string | null | undefined;
function logo(): string | null {
  if (logoDataUri !== undefined) return logoDataUri;
  try {
    logoDataUri = `data:image/png;base64,${fs.readFileSync(dietTempleLogoPath).toString('base64')}`;
  } catch {
    logoDataUri = null;
  }
  return logoDataUri;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Safe to embed in an inline <script>: JSON with `<` escaped. */
const jsonForScript = (v: unknown) =>
  JSON.stringify(v)
    .replace(/</g, '\\u003c')
    .split(String.fromCharCode(0x2028)).join('\\u2028')
    .split(String.fromCharCode(0x2029)).join('\\u2029');

type PageState =
  | { kind: 'form'; token: string; email: string; name?: string }
  | { kind: 'error'; reason: string; message: string };

export function renderActivationPage(state: PageState, nonce: string): string {
  const logoSrc = logo();
  const support = esc(supportEmail());
  const rules = PASSWORD_RULES.map((r) => ({ id: r.id, label: r.label }));
  const body =
    state.kind === 'form'
      ? `
    <h1>Activez votre compte</h1>
    <p class="lead">${state.name ? `Bonjour ${esc(state.name)}, ` : ''}choisissez le mot de passe de votre compte DietTemple.</p>
    <p class="account">Compte : <strong>${esc(state.email)}</strong></p>
    <form id="f" novalidate>
      <label for="p1">Mot de passe</label>
      <div class="field"><input id="p1" name="p1" type="password" autocomplete="new-password" required maxlength="128" aria-describedby="rules">
        <button type="button" class="eye" data-for="p1" aria-label="Afficher le mot de passe">Afficher</button></div>
      <ul id="rules" class="rules" aria-live="polite">${rules.map((r) => `<li data-rule="${r.id}"><span class="dot"></span>${esc(r.label)}</li>`).join('')}</ul>
      <label for="p2">Confirmer le mot de passe</label>
      <div class="field"><input id="p2" name="p2" type="password" autocomplete="new-password" required maxlength="128">
        <button type="button" class="eye" data-for="p2" aria-label="Afficher la confirmation">Afficher</button></div>
      <p id="match" class="hint" aria-live="polite"></p>
      <p id="err" class="error" role="alert" hidden></p>
      <button id="go" class="cta" type="submit" disabled>Activer mon compte</button>
    </form>
    <div id="done" hidden>
      <h1>Compte activé ✅</h1>
      <p class="lead">Votre mot de passe est enregistré. Vous pouvez maintenant vous connecter à l'application DietTemple avec <strong>${esc(state.email)}</strong>.</p>
      <a class="cta link" id="open" href="diettemple://login">Ouvrir l'application</a>
      <p class="hint">Le bouton ne fait rien ? Ouvrez simplement l'application DietTemple sur votre téléphone et connectez-vous.</p>
    </div>
    <script nonce="${nonce}">
      (function () {
        var TOKEN = ${jsonForScript(state.token)};
        var RULES = ${jsonForScript(rules)};
        var tests = { length: function (p) { return p.length >= 8; }, letter: function (p) { return /[A-Za-z\\u00C0-\\u00FF]/.test(p); }, digit: function (p) { return /\\d/.test(p); } };
        try { history.replaceState(null, '', location.pathname); } catch (e) {}
        var p1 = document.getElementById('p1'), p2 = document.getElementById('p2'), go = document.getElementById('go'),
            err = document.getElementById('err'), match = document.getElementById('match');
        function update() {
          var ok = true;
          RULES.forEach(function (r) {
            var pass = tests[r.id](p1.value);
            var li = document.querySelector('[data-rule="' + r.id + '"]');
            li.className = p1.value ? (pass ? 'ok' : 'ko') : '';
            if (!pass) ok = false;
          });
          var same = p1.value !== '' && p1.value === p2.value;
          match.textContent = p2.value ? (same ? 'Les mots de passe correspondent.' : 'Les mots de passe ne correspondent pas.') : '';
          match.className = 'hint ' + (p2.value ? (same ? 'good' : 'bad') : '');
          go.disabled = !(ok && same);
        }
        p1.addEventListener('input', update); p2.addEventListener('input', update);
        Array.prototype.forEach.call(document.querySelectorAll('.eye'), function (b) {
          b.addEventListener('click', function () {
            var el = document.getElementById(b.getAttribute('data-for'));
            var show = el.type === 'password'; el.type = show ? 'text' : 'password'; b.textContent = show ? 'Masquer' : 'Afficher';
          });
        });
        document.getElementById('f').addEventListener('submit', function (ev) {
          ev.preventDefault(); if (go.disabled) return;
          go.disabled = true; go.textContent = 'Activation…'; err.hidden = true;
          fetch('/api/invitations/accept', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: TOKEN, password: p1.value, confirmPassword: p2.value }) })
            .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
            .then(function (res) {
              if (res.ok) { document.getElementById('f').hidden = true; document.querySelector('.lead').hidden = true; document.querySelector('.account').hidden = true; document.querySelector('h1').hidden = true; document.getElementById('done').hidden = false; return; }
              err.textContent = res.j.message || "L'activation a échoué. Réessayez."; err.hidden = false; go.textContent = 'Activer mon compte'; update();
            })
            .catch(function () { err.textContent = 'Connexion impossible. Vérifiez votre réseau et réessayez.'; err.hidden = false; go.textContent = 'Activer mon compte'; update(); });
        });
        update();
      })();
    </script>`
      : `
    <h1>${state.reason === 'used' || state.reason === 'account_exists' ? 'Compte déjà activé' : 'Lien indisponible'}</h1>
    <p class="lead">${esc(state.message)}</p>
    <p class="hint">Besoin d'aide ? <a href="mailto:${support}">${support}</a></p>`;

  return `<!doctype html>
<html lang="fr"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<title>Activer mon compte · DietTemple</title>
<style>
  *{box-sizing:border-box} html,body{margin:0}
  body{min-height:100vh;background:#0b0b0c;color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;display:flex;align-items:center;justify-content:center;padding:max(16px,env(safe-area-inset-top)) 16px max(16px,env(safe-area-inset-bottom))}
  .card{width:100%;max-width:440px;background:#151518;border:1px solid #2a2418;border-radius:22px;padding:28px 22px;box-shadow:0 20px 60px rgba(0,0,0,.5)}
  .logo{display:block;margin:0 auto 18px;max-width:110px;height:auto}
  h1{font-size:24px;line-height:30px;margin:0 0 10px;color:${GOLD};text-align:center}
  .lead{color:#d1d5db;font-size:15px;line-height:23px;margin:0 0 12px;text-align:center}
  .account{text-align:center;color:#9ca3af;font-size:13px;margin:0 0 18px;word-break:break-all}
  label{display:block;font-size:13px;color:#9ca3af;margin:14px 0 6px}
  .field{position:relative}
  input{width:100%;min-height:48px;background:#0f0f11;border:1px solid #2f2a1d;border-radius:12px;color:#f3f4f6;font-size:16px;padding:12px 84px 12px 14px}
  input:focus{outline:2px solid ${GOLD};outline-offset:1px}
  .eye{position:absolute;right:6px;top:6px;height:36px;padding:0 10px;background:transparent;border:0;color:${GOLD};font-size:13px;font-weight:600;cursor:pointer}
  .rules{list-style:none;margin:10px 0 0;padding:0;display:grid;gap:4px;font-size:13px;color:#9ca3af}
  .rules li{display:flex;align-items:center;gap:8px}
  .dot{width:8px;height:8px;border-radius:50%;background:#3a3a3f;display:inline-block}
  .rules li.ok{color:#86efac}.rules li.ok .dot{background:#22c55e}.rules li.ko{color:#fca5a5}.rules li.ko .dot{background:#ef4444}
  .hint{font-size:13px;color:#9ca3af;margin:10px 0 0;text-align:center;min-height:18px}.hint.good{color:#86efac}.hint.bad{color:#fca5a5}
  .hint a{color:${GOLD}}
  .error{background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.4);color:#fecaca;border-radius:12px;padding:10px 12px;font-size:14px;margin:12px 0 0}
  .cta{display:block;width:100%;min-height:52px;margin-top:18px;background:linear-gradient(90deg,${GOLD},#A68135);color:#1a1405;border:0;border-radius:14px;font-size:16px;font-weight:800;text-align:center;text-decoration:none;line-height:52px;cursor:pointer}
  .cta:disabled{opacity:.45;cursor:not-allowed}
  [hidden]{display:none!important}
  @media (prefers-reduced-motion:no-preference){.cta{transition:transform .12s ease,opacity .2s}.cta:active:not(:disabled){transform:scale(.98)}}
</style></head>
<body><main class="card">
  ${logoSrc ? `<img class="logo" src="${logoSrc}" alt="DietTemple">` : ''}
  ${body}
</main></body></html>`;
}

function secureHeaders(res: Response, nonce: string) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader(
    'Content-Security-Policy',
    `default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`
  );
}

export const activationPageRouter = Router();
activationPageRouter.get('/', checkLimiter, async (req: Request, res: Response) => {
  const nonce = crypto.randomBytes(16).toString('base64');
  secureHeaders(res, nonce);
  try {
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    const check = await checkToken(token);
    if (check.ok) {
      return res.status(200).type('html').send(renderActivationPage({ kind: 'form', token, email: check.invitation.email, name: check.invitation.name }, nonce));
    }
    return res.status(check.reason === 'invalid' ? 400 : 410).type('html').send(renderActivationPage({ kind: 'error', reason: check.reason, message: REASON_MESSAGES[check.reason] }, nonce));
  } catch (e) {
    console.error('[activate]', e);
    return res.status(500).type('html').send(renderActivationPage({ kind: 'error', reason: 'error', message: "Une erreur est survenue. Réessayez dans quelques instants." }, nonce));
  }
});

export const invitationsApiRouter = Router();

invitationsApiRouter.get('/validate', checkLimiter, async (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  const check = await checkToken(typeof req.query.token === 'string' ? req.query.token : '');
  res.json(check.ok ? { valid: true } : { valid: false, reason: check.reason, message: REASON_MESSAGES[check.reason] });
});

invitationsApiRouter.post('/accept', acceptLimiter, async (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const { token, password, confirmPassword } = req.body ?? {};
    const out = await acceptInvitation(token, password, confirmPassword);
    res.json({ success: true, email: out.email });
  } catch (e) {
    if (e instanceof InvitationError) return res.status(e.httpStatus).json({ code: e.code, message: e.message, ...(e.extra ?? {}) });
    console.error('[invitations/accept]', e);
    res.status(500).json({ message: "L'activation a échoué. Réessayez dans quelques instants." });
  }
});
