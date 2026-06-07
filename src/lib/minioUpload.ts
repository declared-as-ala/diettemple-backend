import multer from 'multer';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { minioClient } from './minioClient';

// ── Temp directory for multer before MinIO upload ────────────────────────────
const TEMP_DIR = path.join(os.tmpdir(), 'diettemple-uploads');
try { fs.mkdirSync(TEMP_DIR, { recursive: true }); } catch {}

// ── Multer instances (temp disk → MinIO) ─────────────────────────────────────

/** Video uploads: mp4, webm, quicktime, avi — max 500 MB */
export const videoUpload = multer({
  dest: TEMP_DIR,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['video/mp4', 'video/mpeg', 'video/quicktime', 'video/x-msvideo', 'video/webm'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Fichier invalide. Formats acceptés: mp4, webm, mov, avi'));
  },
});

/** Image uploads: jpg, png, webp, gif — max 20 MB */
export const imageUpload = multer({
  dest: TEMP_DIR,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Fichier invalide. Formats acceptés: jpg, png, webp, gif'));
  },
});

/** Any file type — use for mixed endpoints */
export const anyUpload = multer({
  dest: TEMP_DIR,
  limits: { fileSize: 500 * 1024 * 1024 },
});

// ── Core upload helper ────────────────────────────────────────────────────────

/**
 * Upload a multer temp file to MinIO using fPutObject (streams from disk —
 * safe for large video files, no RAM spike).
 * Deletes the temp file whether upload succeeds or fails.
 *
 * @param file       req.file from multer
 * @param bucket     'media' | 'videos'
 * @param objectKey  e.g. 'exercises/videos/abc123/video_1700000000.mp4'
 * @returns          Public URL path: /media/exercises/videos/...
 */
export async function uploadToMinio(
  file: Express.Multer.File,
  bucket: string,
  objectKey: string,
): Promise<string> {
  try {
    await minioClient.fPutObject(bucket, objectKey, file.path, {
      'Content-Type': file.mimetype,
    });
  } finally {
    // Always clean up temp file
    try { fs.unlinkSync(file.path); } catch {}
  }
  return `/${bucket}/${objectKey}`;
}

// ── Delete helper ─────────────────────────────────────────────────────────────

/**
 * Delete an object from MinIO given its public URL path.
 * Accepts paths like /media/products/image.jpg or /videos/landing/video.mp4
 * Silent on errors (object may already be gone).
 */
export async function deleteFromMinio(publicUrl: string | undefined | null): Promise<void> {
  if (!publicUrl) return;
  const cleaned = publicUrl.replace(/^\/+/, '');
  const slashIdx = cleaned.indexOf('/');
  if (slashIdx === -1) return;
  const bucket = cleaned.slice(0, slashIdx);
  const key    = cleaned.slice(slashIdx + 1);
  if (!bucket || !key) return;
  try { await minioClient.removeObject(bucket, key); } catch {}
}

// ── Filename builder ──────────────────────────────────────────────────────────

/** Build a timestamped filename preserving safe extension */
export function buildFilename(
  original: string,
  prefix: string,
  allowedExts: string[] = ['.mp4', '.webm', '.jpg', '.png', '.webp'],
): string {
  const raw = path.extname(original).toLowerCase();
  const ext = allowedExts.includes(raw) ? raw : allowedExts[0];
  return `${prefix}_${Date.now()}${ext}`;
}
