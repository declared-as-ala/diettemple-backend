import crypto from 'crypto';

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const MAX_ATTACHMENTS = 4;

export interface UploadedFile {
  originalname: string;
  buffer: Buffer;
  size: number;
}

/** Real type from the file's first bytes — the client-declared mimetype/extension is never trusted. */
export function sniffImage(buf: Buffer): { mime: string; ext: string } | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png' };
  if (buf.length >= 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  return null;
}

export class AttachmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AttachmentError';
  }
}

export interface ValidatedAttachment {
  key: string;
  name: string;
  mime: string;
  size: number;
  buffer: Buffer;
}

/** Validates count, size and real image type; returns what to store (random, non-guessable keys). */
export function validateAttachments(prefix: string, files: UploadedFile[] | undefined): ValidatedAttachment[] {
  const list = files ?? [];
  if (list.length > MAX_ATTACHMENTS) throw new AttachmentError(`Maximum ${MAX_ATTACHMENTS} images par message.`);
  return list.map((f) => {
    if (!f.buffer?.length) throw new AttachmentError('Fichier vide.');
    if (f.size > MAX_ATTACHMENT_BYTES || f.buffer.length > MAX_ATTACHMENT_BYTES) throw new AttachmentError('Image trop lourde (5 Mo maximum).');
    const type = sniffImage(f.buffer);
    if (!type) throw new AttachmentError('Format non pris en charge : utilisez une image JPEG, PNG ou WebP.');
    const safeName = (f.originalname || `image.${type.ext}`).replace(/[^\w.\- ()]/g, '_').slice(0, 100);
    return { key: `${prefix}/${crypto.randomBytes(16).toString('hex')}.${type.ext}`, name: safeName, mime: type.mime, size: f.buffer.length, buffer: f.buffer };
  });
}
