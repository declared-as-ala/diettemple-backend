/**
 * Private file storage for sensitive uploads (complaint attachments).
 * The existing "media" and "videos" buckets are PUBLIC-read (Caddy serves /media/* straight from MinIO), so private files go
 * to a separate bucket with NO public policy and no Caddy route: they can only be read through the authenticated API.
 */
import type { Readable } from 'stream';

export interface StoredObject {
  stream: Readable;
  size?: number;
}

export interface PrivateStorage {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<StoredObject>;
}

export const PRIVATE_BUCKET = 'private';

let override: PrivateStorage | null = null;
export function setPrivateStorageForTests(s: PrivateStorage | null): void {
  override = s;
}

let ensured = false;

export async function getPrivateStorage(): Promise<PrivateStorage> {
  if (override) return override;
  const { minioClient } = await import('../lib/minioClient');
  return {
    async put(key, data, contentType) {
      if (!ensured) {
        if (!(await minioClient.bucketExists(PRIVATE_BUCKET))) await minioClient.makeBucket(PRIVATE_BUCKET);
        ensured = true; // deliberately no setBucketPolicy: the bucket stays private
      }
      await minioClient.putObject(PRIVATE_BUCKET, key, data, data.length, { 'Content-Type': contentType });
    },
    async get(key) {
      const stat = await minioClient.statObject(PRIVATE_BUCKET, key);
      const stream = await minioClient.getObject(PRIVATE_BUCKET, key);
      return { stream: stream as unknown as Readable, size: stat.size };
    },
  };
}
