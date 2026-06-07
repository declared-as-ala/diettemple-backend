/**
 * VPS local media storage: public URLs, safe paths, image optimization.
 * Store only public URL paths in DB (e.g. /media/users/avatars/u_123/avatar_1700000000.webp).
 */
import path from 'path';
import fs from 'fs';

const PUBLIC_MEDIA_PREFIX = '/media';

/** Root of storage/public (served at /media). Resolved at runtime. */
export function getStoragePublicRoot(): string {
  return path.join(__dirname, '../../storage/public');
}

/** Resolve filesystem path from a public URL path (e.g. /media/users/avatars/... -> storage/public/users/avatars/...). */
export function publicUrlToFsPath(publicUrl: string): string | null {
  if (!publicUrl || !publicUrl.startsWith(PUBLIC_MEDIA_PREFIX + '/')) return null;
  const relative = publicUrl.slice(PUBLIC_MEDIA_PREFIX.length).replace(/^\//, '');
  const full = path.join(getStoragePublicRoot(), relative);
  const root = path.normalize(getStoragePublicRoot());
  if (!full.startsWith(root)) return null; // path traversal
  return full;
}

/** Get public URL for a path relative to storage/public (e.g. users/avatars/u_123/avatar.webp -> /media/users/avatars/...) */
export function toPublicUrl(relativePath: string): string {
  const normalized = path.normalize(relativePath).replace(/\\/g, '/');
  return PUBLIC_MEDIA_PREFIX + '/' + normalized.replace(/^\//, '');
}

/** Sanitize: no path traversal, no absolute paths. Use only for subdir names (userId, exerciseId). */
export function sanitizeSegment(segment: string): string {
  return segment.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'unknown';
}

/** Ensure directory exists; throws on failure. */
export function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/** Delete file at public URL if it is a local /media path. */
export function deleteOldAvatarIfLocal(photoUri: string | undefined | null): void {
  if (!photoUri || !photoUri.startsWith(PUBLIC_MEDIA_PREFIX + '/')) return;
  const fsPath = publicUrlToFsPath(photoUri);
  if (fsPath && fs.existsSync(fsPath)) {
    try {
      fs.unlinkSync(fsPath);
    } catch (e) {
      console.warn('[mediaStorage] Could not delete old avatar:', fsPath, e);
    }
  }
}
