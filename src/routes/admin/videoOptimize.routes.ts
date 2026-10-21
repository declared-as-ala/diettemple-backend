/**
 * Admin endpoints to (re)build the optimised video renditions of existing exercise videos — no server access needed.
 *   POST /api/admin/video-optimize           { force?: boolean }  -> queue every exercise without up-to-date variants
 *   POST /api/admin/video-optimize/:id       { force?: boolean }  -> queue one exercise
 *   GET  /api/admin/video-optimize/status                         -> progress + per-exercise stats
 * Work happens in the background, one video at a time; originals are never modified.
 */
import { Router, Response } from 'express';
import { param } from 'express-validator';
import { AuthRequest } from '../../middleware/auth.middleware';
import Exercise from '../../models/Exercise.model';
import { enqueueAllExerciseVideos, enqueueExerciseVideo, getOptimizeStatus } from '../../services/videoVariants.service';

const router = Router();

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const out = await enqueueAllExerciseVideos(req.body?.force === true);
    res.status(202).json({ message: 'Optimisation des vidéos lancée en arrière-plan.', ...out, status: getOptimizeStatus() });
  } catch (e: any) {
    res.status(500).json({ message: e?.message || 'Failed to queue video optimisation' });
  }
});

router.get('/status', async (_req: AuthRequest, res: Response) => {
  try {
    const rows: any[] = await Exercise.find({ videoSource: 'upload' }).select('name videoOptimization').lean();
    const by = (s: string) => rows.filter((r) => (r.videoOptimization?.status || 'none') === s).length;
    const sum = (k: string) => rows.reduce((n, r) => n + (Number(r.videoOptimization?.[k]) || 0), 0);
    res.json({
      queue: getOptimizeStatus(),
      exercises: { uploaded: rows.length, ready: by('ready'), processing: by('processing'), failed: by('failed'), notStarted: by('none') },
      bytes: { original: sum('sourceBytes'), optimizedAllRungs: sum('optimizedBytes') },
      failed: rows.filter((r) => r.videoOptimization?.status === 'failed').map((r) => ({ id: r._id, name: r.name, error: r.videoOptimization?.error })).slice(0, 20),
    });
  } catch (e: any) {
    res.status(500).json({ message: e?.message || 'Failed to read status' });
  }
});

router.post('/:id', [param('id').isMongoId()], async (req: AuthRequest, res: Response) => {
  enqueueExerciseVideo(String(req.params.id), req.body?.force === true);
  res.status(202).json({ message: 'Optimisation lancée.', status: getOptimizeStatus() });
});

export default router;
