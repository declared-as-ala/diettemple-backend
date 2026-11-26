/**
 * Small transactional mailer for new features (invitations, notifications).
 * Uses the SAME environment variables as the existing email service (EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS) — no
 * credentials in code — but reads them when sending, so importing this file never opens a connection (safe in tests).
 */
import nodemailer, { type Transporter } from 'nodemailer';
import fs from 'fs';

export interface MailAttachment {
  filename: string;
  path: string;
  cid?: string;
}

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: MailAttachment[];
}

export interface Mailer {
  send(mail: MailMessage): Promise<void>;
}

let override: Mailer | null = null;
let cached: { key: string; transporter: Transporter } | null = null;

/** Tests inject a fake; pass null to restore the real SMTP mailer. */
export function setMailerForTests(mailer: Mailer | null): void {
  override = mailer;
}

export const fromAddress = (): string => process.env.EMAIL_USER || 'contact@diettemple.tn';
export const supportEmail = (): string => process.env.SUPPORT_EMAIL || process.env.EMAIL_USER || 'contact@diettemple.tn';

function smtp(): Transporter {
  const host = process.env.EMAIL_HOST || 'diettemple.tn';
  const port = parseInt(process.env.EMAIL_PORT || '465', 10);
  const user = fromAddress();
  const pass = process.env.EMAIL_PASS || '';
  const key = `${host}:${port}:${user}`;
  if (cached?.key === key) return cached.transporter;
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    // Same TLS behaviour as the existing order emails (changing it could break delivery on the current mail server).
    tls: { rejectUnauthorized: false },
  });
  cached = { key, transporter };
  return transporter;
}

export async function getMailer(): Promise<Mailer> {
  if (override) return override;
  return {
    async send(mail) {
      if (!process.env.EMAIL_PASS) throw new Error("L'envoi d'e-mails n'est pas configuré (EMAIL_PASS manquant).");
      const attachments = (mail.attachments || []).filter((a) => fs.existsSync(a.path));
      await smtp().sendMail({
        from: `"DietTemple" <${fromAddress()}>`,
        to: mail.to,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        attachments,
      });
    },
  };
}
