import { dietTempleLogoCid, dietTempleLogoPath } from '../utils/brandAssets';
import { supportEmail, type MailMessage } from './mailer';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const GOLD = '#C9A45C';

export interface InvitationEmailInput {
  to: string;
  name?: string;
  activationUrl: string;
  expiresAt: Date;
  expiryHours: number;
}

const formatDate = (d: Date) =>
  new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Africa/Tunis' }).format(d);

/** Branded, responsive (table-based, inline styles: works in Gmail/Outlook/Apple Mail). Never contains a password. */
export function buildInvitationEmail(input: InvitationEmailInput): MailMessage {
  const support = supportEmail();
  const greeting = input.name ? `Bonjour ${esc(input.name)},` : 'Bonjour,';
  const greetingText = input.name ? `Bonjour ${input.name},` : 'Bonjour,';
  const expires = formatDate(input.expiresAt);
  const url = esc(input.activationUrl);

  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>Votre invitation DietTemple</title>
</head>
<body style="margin:0;padding:0;background:#0b0b0c;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Activez votre compte DietTemple et définissez votre mot de passe.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0b0c;padding:24px 12px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#151518;border:1px solid #2a2418;border-radius:20px;overflow:hidden;">
      <tr><td align="center" style="padding:32px 24px 8px;">
        <img src="cid:${dietTempleLogoCid}" alt="DietTemple" width="120" style="display:block;border:0;max-width:120px;height:auto;">
      </td></tr>
      <tr><td style="padding:16px 32px 0;font-family:Arial,Helvetica,sans-serif;color:#f3f4f6;">
        <h1 style="margin:0 0 12px;font-size:24px;line-height:30px;color:${GOLD};text-align:center;">Bienvenue chez DietTemple</h1>
        <p style="margin:0 0 12px;font-size:16px;line-height:24px;">${greeting}</p>
        <p style="margin:0 0 12px;font-size:16px;line-height:24px;color:#d1d5db;">
          Votre coach vous invite à rejoindre DietTemple, votre application d'entraînement et de suivi nutritionnel personnalisés.
          Il ne vous reste qu'à choisir votre mot de passe pour activer votre compte.
        </p>
      </td></tr>
      <tr><td align="center" style="padding:20px 32px 8px;">
        <a href="${url}" style="display:inline-block;background:${GOLD};color:#1a1405;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;text-decoration:none;padding:16px 36px;border-radius:14px;">Activer mon compte</a>
      </td></tr>
      <tr><td style="padding:12px 32px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:#9ca3af;text-align:center;">
        Ce lien est personnel, à usage unique, et expire le <strong style="color:#d1d5db;">${esc(expires)}</strong> (dans ${input.expiryHours}&nbsp;h).
      </td></tr>
      <tr><td style="padding:16px 32px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#6b7280;word-break:break-all;">
        Le bouton ne fonctionne pas ? Copiez ce lien dans votre navigateur :<br>
        <a href="${url}" style="color:${GOLD};">${url}</a>
      </td></tr>
      <tr><td style="padding:24px 32px 32px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#6b7280;border-top:1px solid #2a2418;margin-top:20px;">
        <p style="margin:16px 0 6px;">Vous n'attendiez pas cette invitation ? Ignorez simplement cet e-mail : aucun compte ne sera créé.</p>
        <p style="margin:0;">Besoin d'aide ? Écrivez-nous à <a href="mailto:${esc(support)}" style="color:${GOLD};">${esc(support)}</a>.</p>
        <p style="margin:12px 0 0;color:#4b5563;">DietTemple ne vous demandera jamais votre mot de passe par e-mail.</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

  const text = [
    greetingText,
    '',
    "Votre coach vous invite à rejoindre DietTemple, votre application d'entraînement et de suivi nutritionnel personnalisés.",
    'Pour activer votre compte et choisir votre mot de passe, ouvrez ce lien :',
    input.activationUrl,
    '',
    `Ce lien est personnel, à usage unique, et expire le ${expires} (dans ${input.expiryHours} h).`,
    '',
    "Vous n'attendiez pas cette invitation ? Ignorez cet e-mail : aucun compte ne sera créé.",
    `Besoin d'aide ? ${support}`,
    'DietTemple ne vous demandera jamais votre mot de passe par e-mail.',
  ].join('\n');

  return {
    to: input.to,
    subject: 'Votre invitation DietTemple : activez votre compte',
    html,
    text,
    attachments: [{ filename: 'diettemple-logo.png', path: dietTempleLogoPath, cid: dietTempleLogoCid }],
  };
}
