/**
 * Recipe photos: optimised JPEGs committed next to the dataset (./recipeImages) and uploaded to the existing
 * MinIO "media" bucket. Keys contain a content hash, so a re-run never uploads the same file twice and a
 * changed photo gets a new, cache-safe URL.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export const RECIPE_IMAGES_DIR = path.join(__dirname, 'recipeImages');

export interface ImageStorage {
  exists(key: string): Promise<boolean>;
  put(key: string, data: Buffer, contentType: string): Promise<void>;
}

export const imageFilePath = (name: string) => path.join(RECIPE_IMAGES_DIR, `${name}.jpg`);
export const imageFileExists = (name: string) => fs.existsSync(imageFilePath(name));

export function imageKeyFor(name: string, data: Buffer): string {
  const hash = crypto.createHash('sha1').update(data).digest('hex').slice(0, 10);
  return `recipes/${name}-${hash}.jpg`;
}

export interface UploadedImage {
  url: string;
  key: string;
  uploaded: boolean;
}

/** Public URL path as stored elsewhere in the app (Caddy proxies /media/* to MinIO). */
export const publicUrlFor = (key: string) => `/media/${key}`;

export async function ensureImageUploaded(storage: ImageStorage, name: string): Promise<UploadedImage> {
  const data = fs.readFileSync(imageFilePath(name));
  const key = imageKeyFor(name, data);
  if (await storage.exists(key)) return { url: publicUrlFor(key), key, uploaded: false };
  await storage.put(key, data, 'image/jpeg');
  return { url: publicUrlFor(key), key, uploaded: true };
}

/** MinIO implementation (loaded lazily so unit tests never need a MinIO client or network). */
export async function createMinioImageStorage(): Promise<ImageStorage> {
  const { minioClient, BUCKETS } = await import('../../lib/minioClient');
  const bucket = BUCKETS.MEDIA;
  return {
    async exists(key) {
      try {
        await minioClient.statObject(bucket, key);
        return true;
      } catch (e: any) {
        if (e?.code === 'NotFound' || e?.code === 'NoSuchKey' || e?.statusCode === 404) return false;
        throw e;
      }
    },
    async put(key, data, contentType) {
      await minioClient.putObject(bucket, key, data, data.length, { 'Content-Type': contentType });
    },
  };
}
