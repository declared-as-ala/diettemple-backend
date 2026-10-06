type AnyRecord = Record<string, any>;

const VIDEO_BUCKET_PREFIX = '/videos/';
const LEGACY_API_VIDEO_PREFIX = '/api/videos/';

function isExternalVideoUrl(value: string): boolean {
  return /(?:youtube\.com|youtu\.be)/i.test(value);
}

function normalizePathname(pathname: string): string {
  if (!pathname) return '';
  const decoded = pathname.replace(/\\/g, '/');

  if (decoded.startsWith(LEGACY_API_VIDEO_PREFIX)) {
    return VIDEO_BUCKET_PREFIX + decoded.slice(LEGACY_API_VIDEO_PREFIX.length);
  }

  if (decoded.startsWith(VIDEO_BUCKET_PREFIX)) {
    return decoded;
  }

  if (decoded.startsWith('/media/videos/')) {
    return VIDEO_BUCKET_PREFIX + decoded.slice('/media/videos/'.length);
  }

  return decoded;
}

export function normalizeExerciseVideoUrl(videoUrl?: string | null, videoFilePath?: string | null): string {
  const fromFilePath = typeof videoFilePath === 'string' && videoFilePath.trim()
    ? VIDEO_BUCKET_PREFIX + videoFilePath.trim().replace(/^\/+/, '')
    : '';

  if (!videoUrl || !videoUrl.trim()) {
    return fromFilePath;
  }

  const raw = videoUrl.trim();
  if (isExternalVideoUrl(raw)) return raw;

  try {
    const parsed = new URL(raw);
    const normalizedPath = normalizePathname(parsed.pathname);
    if (
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === 'minio' ||
      parsed.hostname.endsWith('.diettemple.tn')
    ) {
      return normalizedPath || fromFilePath || raw;
    }
    return raw;
  } catch {
    const isRelativeObjectKey = !raw.startsWith('/');
    const normalized = normalizePathname(isRelativeObjectKey ? `/${raw}` : raw);
    if (normalized.startsWith(VIDEO_BUCKET_PREFIX) || normalized.startsWith(LEGACY_API_VIDEO_PREFIX)) {
      return normalized;
    }
    if (isRelativeObjectKey && /\.(mp4|webm|mov|avi|mpeg)$/i.test(raw)) {
      return VIDEO_BUCKET_PREFIX + raw.replace(/^\/+/, '');
    }
    return fromFilePath || normalized;
  }
}

export function serializeExerciseVideo<T extends AnyRecord | null | undefined>(exercise: T): T {
  if (!exercise || typeof exercise !== 'object') return exercise;
  const copy: AnyRecord = { ...exercise };
  copy.videoUrl = normalizeExerciseVideoUrl(copy.videoUrl, copy.videoFilePath);
  if (copy.videoUrl && !copy.videoSource && !isExternalVideoUrl(copy.videoUrl)) {
    copy.videoSource = 'upload';
  }
  return copy as T;
}

export function serializeExerciseVideosDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => serializeExerciseVideosDeep(item)) as T;
  }

  if (!value || typeof value !== 'object') return value;

  // ObjectId, Date, Buffer... know how to serialize themselves (toJSON). Spreading them into a plain object would
  // turn an ObjectId into { buffer: {...} } and a Date into {} — leave them untouched for res.json().
  if (typeof (value as { toJSON?: unknown }).toJSON === 'function') return value;

  const record = value as AnyRecord;
  const looksLikeExercise =
    ('videoUrl' in record || 'videoFilePath' in record) &&
    ('name' in record || 'muscleGroup' in record || 'equipment' in record);

  const result: AnyRecord = looksLikeExercise ? serializeExerciseVideo(record) : { ...record };
  for (const [key, child] of Object.entries(result)) {
    result[key] = serializeExerciseVideosDeep(child);
  }
  return result as T;
}
