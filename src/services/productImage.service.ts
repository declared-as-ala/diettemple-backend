import fs from 'fs';
import path from 'path';
import os from 'os';
import axios from 'axios';
import sharp from 'sharp';
import { minioClient, BUCKETS } from '../lib/minioClient';
import { IProductMediaImage } from '../models/Product.model';

const ALLOWED_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
const MAX_IMAGE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

/**
 * Process an uploaded local file (from multer), optimize with Sharp, and upload to MinIO.
 */
export async function processAndUploadProductImage(
  file: Express.Multer.File,
  productId?: string,
  alt?: string
): Promise<IProductMediaImage> {
  if (!ALLOWED_IMAGE_MIMES.includes(file.mimetype)) {
    try { fs.unlinkSync(file.path); } catch {}
    throw new Error('Format d’image non supporté. Formats acceptés : JPG, JPEG, PNG, WEBP');
  }

  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    try { fs.unlinkSync(file.path); } catch {}
    throw new Error('L’image dépasse la taille maximale de 20 Mo');
  }

  const safeProductId = productId && /^[a-fA-F0-9]{24}$/.test(productId) ? productId : 'general';
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  const objectKey = `products/${safeProductId}/${timestamp}_${randomSuffix}.webp`;
  const bucket = BUCKETS.MEDIA;

  // Process image using sharp: resize if larger than 1600px, convert to webp (q: 85)
  const optimizedBuffer = await sharp(file.path)
    .rotate() // auto-orient based on EXIF
    .resize({
      width: 1600,
      height: 1600,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 85 })
    .toBuffer();

  // Always remove the multer temp file
  try { fs.unlinkSync(file.path); } catch {}

  // Upload optimized buffer to MinIO
  await minioClient.putObject(bucket, objectKey, optimizedBuffer, optimizedBuffer.length, {
    'Content-Type': 'image/webp',
  });

  return {
    key: objectKey,
    bucket,
    url: `/${bucket}/${objectKey}`,
    isPrimary: false,
    order: 0,
    alt: alt || '',
  };
}

/**
 * Download an external image (e.g. legacy Amazon CDN URL), convert to WebP, and upload to MinIO.
 */
export async function importExternalImageToMinio(
  imageUrl: string,
  productId: string,
  alt?: string
): Promise<IProductMediaImage> {
  if (!imageUrl || !imageUrl.startsWith('http')) {
    throw new Error('URL d’image externe invalide');
  }

  const safeProductId = productId && /^[a-fA-F0-9]{24}$/.test(productId) ? productId : 'general';

  // Fetch image bytes
  const response = await axios.get(imageUrl, {
    responseType: 'arraybuffer',
    timeout: 15000,
    maxContentLength: MAX_IMAGE_SIZE_BYTES,
  });

  const contentType = String(response.headers['content-type'] || '');
  if (!contentType.startsWith('image/')) {
    throw new Error('L’URL fournie ne pointe pas vers une image valide');
  }

  const inputBuffer = Buffer.from(response.data);

  // Process image with sharp
  const optimizedBuffer = await sharp(inputBuffer)
    .rotate()
    .resize({
      width: 1600,
      height: 1600,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 85 })
    .toBuffer();

  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  const objectKey = `products/${safeProductId}/${timestamp}_${randomSuffix}.webp`;
  const bucket = BUCKETS.MEDIA;

  await minioClient.putObject(bucket, objectKey, optimizedBuffer, optimizedBuffer.length, {
    'Content-Type': 'image/webp',
  });

  return {
    key: objectKey,
    bucket,
    url: `/${bucket}/${objectKey}`,
    isPrimary: false,
    order: 0,
    alt: alt || '',
  };
}

/**
 * Delete a product image from MinIO.
 */
export async function deleteProductImageFromMinio(key: string, bucket: string = BUCKETS.MEDIA): Promise<void> {
  if (!key) return;
  try {
    await minioClient.removeObject(bucket, key);
  } catch (err) {
    console.warn(`[minio] Failed to delete object ${key}:`, err);
  }
}
