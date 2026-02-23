/**
 * Image validation for meal scan (same style as gym verification).
 * Accept jpeg/png/webp; max size; min dimensions; optional resize.
 */
import sharp from 'sharp';

const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE_BYTES = 8 * 1024 * 1024; // 8 MB
const MIN_DIMENSION = 512;
const MAX_SIDE_RESIZE = 1280;

export interface MealImageValidationResult {
  valid: true;
  buffer: Buffer;
  width: number;
  height: number;
  mime: string;
  /** Optional path to resized temp file if resize was applied (caller may delete) */
  resizedPath?: string;
}

export interface MealImageValidationError {
  valid: false;
  code: 'unsupported_format' | 'too_large' | 'too_small' | 'invalid_file';
  message: string;
}

export type MealImageValidation = MealImageValidationResult | MealImageValidationError;

/**
 * Validate meal scan image from buffer.
 * Returns validated result with buffer and dimensions, or French error.
 */
export async function validateMealImage(
  buffer: Buffer,
  mime?: string
): Promise<MealImageValidation> {
  if (!buffer || buffer.length === 0) {
    return { valid: false, code: 'invalid_file', message: 'Fichier image invalide.' };
  }
  if (buffer.length > MAX_SIZE_BYTES) {
    return {
      valid: false,
      code: 'too_large',
      message: 'Image trop lourde, réessaie avec une image plus légère.',
    };
  }
  const mimeType = (mime || '').toLowerCase();
  if (mimeType && !ALLOWED_MIMES.includes(mimeType)) {
    return {
      valid: false,
      code: 'unsupported_format',
      message: 'Format d\'image non supporté. Utilisez JPEG, PNG ou WebP.',
    };
  }

  let width: number;
  let height: number;
  try {
    const meta = await sharp(buffer).metadata();
    width = meta.width ?? 0;
    height = meta.height ?? 0;
  } catch {
    return { valid: false, code: 'invalid_file', message: 'Fichier image invalide.' };
  }

  const detectedMime = mimeType || 'image/jpeg';
  let outputBuffer = buffer;
  let outputWidth = width;
  let outputHeight = height;

  const minSide = Math.min(width, height);
  if (minSide < MIN_DIMENSION) {
    try {
      const scale = MIN_DIMENSION / minSide;
      const newWidth = Math.round(width * scale);
      const newHeight = Math.round(height * scale);
      let pipeline = sharp(buffer).resize(newWidth, newHeight, { fit: 'inside' });
      if (detectedMime === 'image/png') outputBuffer = await pipeline.png({ compressionLevel: 6 }).toBuffer();
      else if (detectedMime === 'image/webp') outputBuffer = await pipeline.webp({ quality: 85 }).toBuffer();
      else outputBuffer = await pipeline.jpeg({ quality: 88 }).toBuffer();
      outputWidth = newWidth;
      outputHeight = newHeight;
      if (process.env.NODE_ENV !== 'production') {
        console.log('[meal-scan] image upscaled', { from: `${width}x${height}`, to: `${newWidth}x${newHeight}` });
      }
    } catch (e) {
      if (process.env.NODE_ENV !== 'production') console.warn('[meal-scan] upscale failed', (e as Error)?.message);
      return {
        valid: false,
        code: 'too_small',
        message: 'Image trop petite, reprends une photo plus nette.',
      };
    }
  }

  return {
    valid: true,
    buffer: outputBuffer,
    width: outputWidth,
    height: outputHeight,
    mime: detectedMime,
  };
}

/**
 * Optionally resize image to max side 1280px for lower token/cost. Returns buffer.
 */
export async function resizeMealImageIfNeeded(buffer: Buffer, mime: string): Promise<Buffer> {
  try {
    let pipeline = sharp(buffer);
    const meta = await pipeline.metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    const maxSide = Math.max(w, h);
    if (maxSide <= MAX_SIDE_RESIZE) return buffer;
    pipeline = sharp(buffer).resize(MAX_SIDE_RESIZE, MAX_SIDE_RESIZE, { fit: 'inside' });
    if (mime === 'image/png') return pipeline.png({ compressionLevel: 6 }).toBuffer();
    if (mime === 'image/webp') return pipeline.webp({ quality: 85 }).toBuffer();
    return pipeline.jpeg({ quality: 88 }).toBuffer();
  } catch {
    return buffer;
  }
}

export { ALLOWED_MIMES, MAX_SIZE_BYTES, MIN_DIMENSION };
