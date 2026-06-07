import { Router, Response } from 'express';
import LandingVideo from '../../models/LandingVideo.model';
import { AuthRequest } from '../../middleware/auth.middleware';
import { videoUpload, uploadToMinio, deleteFromMinio, buildFilename } from '../../lib/minioUpload';
import { BUCKETS } from '../../lib/minioClient';

const router = Router();

// GET /api/admin/landing-videos — list both genders
router.get('/', async (_req: AuthRequest, res: Response) => {
  try {
    const videos = await LandingVideo.find().sort('gender');
    res.json({ videos });
  } catch {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// PUT /api/admin/landing-videos/:gender — update title, description, isActive only.
// videoUrl is NEVER overwritten here — it is managed exclusively by the upload endpoint.
router.put('/:gender', async (req: AuthRequest, res: Response) => {
  const { gender } = req.params;
  if (!['homme', 'femme'].includes(gender)) {
    return res.status(400).json({ message: 'Genre invalide. Utilisez "homme" ou "femme".' });
  }
  const { title, description, isActive } = req.body;
  try {
    const fields: Record<string, unknown> = {
      title,
      description,
      isActive: isActive !== false,
    };
    const video = await LandingVideo.findOneAndUpdate(
      { gender },
      { $set: fields },
      { new: true, upsert: true, runValidators: true }
    );
    res.json({ video });
  } catch (err: any) {
    res.status(500).json({ message: err.message || 'Erreur serveur' });
  }
});

// POST /api/admin/landing-videos/:gender/video — upload video file to MinIO
router.post(
  '/:gender/video',
  videoUpload.single('video'),
  async (req: AuthRequest, res: Response) => {
    const { gender } = req.params;
    if (!['homme', 'femme'].includes(gender)) {
      if (req.file) try { require('fs').unlinkSync(req.file.path); } catch {}
      return res.status(400).json({ message: 'Genre invalide.' });
    }
    if (!req.file) {
      return res.status(400).json({ message: 'Aucun fichier vidéo fourni.' });
    }
    try {
      // Delete previous video from MinIO
      const existing = await LandingVideo.findOne({ gender });
      if (existing?.videoUrl) await deleteFromMinio(existing.videoUrl);

      // Upload to MinIO: bucket=videos, key=landing/{genre}/video_{ts}.mp4
      const filename  = buildFilename(req.file.originalname, 'video', ['.mp4', '.webm']);
      const objectKey = `landing/${gender}/${filename}`;
      const videoUrl  = await uploadToMinio(req.file, BUCKETS.VIDEOS, objectKey);

      const video = await LandingVideo.findOneAndUpdate(
        { gender },
        { $set: { videoUrl, isActive: true } },
        { new: true, upsert: true }
      );
      res.json({ video, videoUrl });
    } catch (err: any) {
      if (req.file) try { require('fs').unlinkSync(req.file.path); } catch {}
      res.status(500).json({ message: err.message || 'Erreur serveur' });
    }
  }
);

export default router;
