import { Router, Request, Response } from 'express';
import LandingVideo from '../models/LandingVideo.model';
import { minioClient } from '../lib/minioClient';

const router = Router();

// GET /api/landing/videos — public, returns video config for homme and femme
router.get('/videos', async (_req: Request, res: Response) => {
  try {
    const videos = await LandingVideo.find({ isActive: true }).select('gender title description videoUrl');
    const result: Record<string, { title: string; description: string; videoUrl: string; streamUrl: string } | null> = {
      homme: null,
      femme: null,
    };
    for (const v of videos) {
      result[v.gender] = {
        title: v.title,
        description: v.description,
        videoUrl: v.videoUrl,
        streamUrl: `/api/landing/stream/${v.gender}`,
      };
    }
    res.json(result);
  } catch {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// GET /api/landing/stream/:gender — stream video directly from MinIO (bypasses Caddy→MinIO)
router.get('/stream/:gender', async (req: Request, res: Response) => {
  const { gender } = req.params;
  if (!['homme', 'femme'].includes(gender)) {
    return res.status(400).json({ message: 'Genre invalide.' });
  }

  try {
    const record = await LandingVideo.findOne({ gender, isActive: true }).select('videoUrl');
    if (!record?.videoUrl) {
      return res.status(404).json({ message: 'Aucune vidéo configurée pour ce programme.' });
    }

    // Parse bucket + objectKey from stored path: /videos/landing/homme/video_xxx.mp4
    const cleaned = record.videoUrl.replace(/^\/+/, '');
    const slashIdx = cleaned.indexOf('/');
    if (slashIdx === -1) return res.status(500).json({ message: 'URL vidéo invalide.' });
    const bucket = cleaned.slice(0, slashIdx);          // "videos"
    const objectKey = cleaned.slice(slashIdx + 1);      // "landing/homme/video_xxx.mp4"

    // Get object stat for Content-Length and Content-Type
    const stat = await minioClient.statObject(bucket, objectKey);
    const fileSize = stat.size;
    const contentType = stat.metaData?.['content-type'] || 'video/mp4';

    // Handle Range requests (required for video seeking in browsers and mobile)
    const range = req.headers.range;
    if (range) {
      const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
      const start = parseInt(startStr, 10);
      const end = endStr ? parseInt(endStr, 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600',
      });

      const stream = await minioClient.getPartialObject(bucket, objectKey, start, chunkSize);
      stream.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600',
      });

      const stream = await minioClient.getObject(bucket, objectKey);
      stream.pipe(res);
    }
  } catch (err: any) {
    if (!res.headersSent) {
      res.status(500).json({ message: err.message || 'Erreur serveur' });
    }
  }
});

export default router;
