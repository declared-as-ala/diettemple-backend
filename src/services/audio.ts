import crypto from 'crypto';

export const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
export const MAX_AUDIO_SECONDS = 180;

export class AudioError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AudioError';
  }
}

/** Real audio type from the first bytes: the declared mimetype / extension is never trusted. */
export function sniffAudio(b: Buffer): { mime: string; ext: string } | null {
  if (b.length < 12) return null;
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return { mime: 'audio/webm', ext: 'webm' }; // EBML (Chrome/Firefox MediaRecorder)
  if (b.subarray(0, 4).toString('ascii') === 'OggS') return { mime: 'audio/ogg', ext: 'ogg' };
  if (b.subarray(4, 8).toString('ascii') === 'ftyp') return { mime: 'audio/mp4', ext: 'm4a' }; // Safari / m4a
  if (b.subarray(0, 3).toString('ascii') === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0 && (b[1] & 0x06) !== 0)) return { mime: 'audio/mpeg', ext: 'mp3' };
  if (b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WAVE') return { mime: 'audio/wav', ext: 'wav' };
  return null;
}

export interface UploadedAudio {
  originalname?: string;
  buffer: Buffer;
  size: number;
}

export function validateAudio(prefix: string, f: UploadedAudio): { key: string; mime: string; size: number; buffer: Buffer } {
  if (!f.buffer?.length) throw new AudioError('Enregistrement vide.');
  if (f.buffer.length > MAX_AUDIO_BYTES) throw new AudioError('Message vocal trop lourd (8 Mo maximum).');
  const t = sniffAudio(f.buffer);
  if (!t) throw new AudioError('Format audio non pris en charge.');
  return { key: `${prefix}/${crypto.randomBytes(16).toString('hex')}.${t.ext}`, mime: t.mime, size: f.buffer.length, buffer: f.buffer };
}

/** Duration is declared by the recorder and only used for display, so it is clamped, never trusted for anything else. */
export function clampDuration(v: unknown): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, MAX_AUDIO_SECONDS);
}

/** Parses a single "bytes=a-b" range. Returns null when absent, 'invalid' when unsatisfiable. */
export function parseRange(header: string | undefined, size: number): { start: number; end: number } | null | 'invalid' {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === '' && m[2] === '')) return 'invalid';
  let start: number;
  let end: number;
  if (m[1] === '') {
    const n = Number(m[2]);
    if (n === 0) return 'invalid';
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start >= size || start > end) return 'invalid';
  return { start, end };
}
