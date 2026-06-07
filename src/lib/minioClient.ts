import * as Minio from 'minio';

// ── Bucket names ────────────────────────────────────────────────────────────
export const BUCKETS = {
  MEDIA:  'media',   // images, avatars, product photos, exercise thumbs
  VIDEOS: 'videos',  // exercise demo videos, landing videos, level-home videos
} as const;

// ── Singleton client ─────────────────────────────────────────────────────────
export const minioClient = new Minio.Client({
  endPoint:  process.env.MINIO_ENDPOINT  || 'minio',
  port:      parseInt(process.env.MINIO_PORT || '9000'),
  useSSL:    process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || 'diettemple',
  secretKey: process.env.MINIO_SECRET_KEY || 'change-this-secret',
});

// ── Public read policy (S3 JSON) ─────────────────────────────────────────────
function publicReadPolicy(bucket: string): string {
  return JSON.stringify({
    Version: '2012-10-17',
    Statement: [
      {
        Effect:    'Allow',
        Principal: { AWS: ['*'] },
        Action:    ['s3:GetObject'],
        Resource:  [`arn:aws:s3:::${bucket}/*`],
      },
    ],
  });
}

/**
 * Called once on server startup (after MongoDB connects).
 * Creates buckets if they don't exist and sets public-read policy.
 * Caddy proxies /media/* and /videos/* to MinIO, so buckets must be public.
 */
export async function initMinioBuckets(): Promise<void> {
  for (const bucket of Object.values(BUCKETS)) {
    const exists = await minioClient.bucketExists(bucket);
    if (!exists) {
      await minioClient.makeBucket(bucket);
      console.log(`[minio] ✓ Created bucket: ${bucket}`);
    }
    await minioClient.setBucketPolicy(bucket, publicReadPolicy(bucket));
    console.log(`[minio] ✓ Bucket ready (public-read): ${bucket}`);
  }
}
