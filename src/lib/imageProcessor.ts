/**
 * Image optimization with sharp: resize, convert to WebP.
 * Used for avatars and progress photos.
 */
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import {
  getStoragePublicRoot,
  toPublicUrl,
  sanitizeSegment,
  ensureDir,
} from './mediaStorage';

const AVATAR_MAX_SIZE = 512;
const AVATAR_QUALITY = 80;
const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5MB

/**
 * Process avatar buffer: resize to max 512x512, convert to WebP.
 * Saves to storage/public/users/avatars/{userId}/avatar_{timestamp}.webp
 * Returns public URL /media/users/avatars/...
 */
export async function processAndSaveAvatar(
  userId: string,
  buffer: Buffer,
  mimeType?: string
): Promise<{ publicUrl: string; fsPath: string }> {
  const safeId = sanitizeSegment(String(userId));
  const ts = Date.now();
  const relDir = path.join('users', 'avatars', safeId);
  const dir = path.join(getStoragePublicRoot(), relDir);
  ensureDir(dir);

  const outFileName = `avatar_${ts}.webp`;
  const fsPath = path.join(dir, outFileName);

  await sharp(buffer)
    .resize(AVATAR_MAX_SIZE, AVATAR_MAX_SIZE, { fit: 'cover', position: 'center' })
    .webp({ quality: AVATAR_QUALITY })
    .toFile(fsPath);

  const relativePath = path.join(relDir, outFileName).replace(/\\/g, '/');
  const publicUrl = toPublicUrl(relativePath);
  return { publicUrl, fsPath };
}

/** Validate avatar buffer size (max 5MB). */
export function validateAvatarSize(buffer: Buffer): void {
  if (buffer.length > MAX_AVATAR_BYTES) {
    throw new Error(`Image too large (max ${MAX_AVATAR_BYTES / 1024 / 1024}MB)`);
  }
}
