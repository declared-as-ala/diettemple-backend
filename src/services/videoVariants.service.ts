/**
 * Background optimisation of in-app videos (exercise demos + the Home level video): original (MinIO) -> ladder + poster + HLS (MinIO) -> Exercise doc.
 *
 * - Runs ONE job at a time (queue) at low CPU priority so the production VPS is never overloaded.
 * - Never runs during a playback request, never modifies or deletes the original video.
 * - Idempotent: an exercise whose variants already match its current source file is skipped (unless forced).
 * - Safe: any failure marks the exercise 'failed' (originals keep playing) and never throws to the caller.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import Exercise from '../models/Exercise.model';
import LevelHomeContent from '../models/LevelHomeContent.model';
import { minioClient, BUCKETS } from '../lib/minioClient';
import { contentTypeFor, ffmpegAvailable, transcodeLadder } from '../lib/videoTranscode';

export interface OptimizeStatus {
  running: boolean;
  current: string | null;
  queued: number;
  done: number;
  failed: number;
  skipped: number;
  lastError: string | null;
  startedAt: string | null;
}

const state: OptimizeStatus = { running: false, current: null, queued: 0, done: 0, failed: 0, skipped: 0, lastError: null, startedAt: null };
export type VideoTarget = 'exercise' | 'levelHome';
const queue: Array<{ kind: VideoTarget; id: string; force: boolean }> = [];
const queued = new Set<string>();
const modelFor = (kind: VideoTarget): any => (kind === 'exercise' ? Exercise : LevelHomeContent);

export function getOptimizeStatus(): OptimizeStatus {
  return { ...state, queued: queue.length };
}

/** "/videos/exercises/<id>/video_1.mp4" or key "exercises/<id>/video_1.mp4" -> object key inside the videos bucket. */
export function objectKeyFromVideo(videoFilePath?: string | null, videoUrl?: string | null): string | null {
  const raw = (videoFilePath || '').trim() || (videoUrl || '').trim();
  if (!raw || /youtube\.com|youtu\.be/i.test(raw)) return null;
  let p = raw;
  try {
    p = new URL(raw).pathname;
  } catch {
    /* already a path/key */
  }
  p = p.replace(/\\/g, '/').replace(/^\/+/, '');
  if (p.startsWith('api/videos/')) p = p.slice('api/videos/'.length);
  else if (p.startsWith('videos/')) p = p.slice('videos/'.length);
  return /\.(mp4|mov|webm|avi|mpeg)$/i.test(p) ? p : null;
}

export function enqueueVideo(kind: VideoTarget, id: string, force = false): void {
  const key = `${kind}:${id}`;
  if (queued.has(key)) return;
  queued.add(key);
  queue.push({ kind, id, force });
  void pump();
}

export const enqueueExerciseVideo = (exerciseId: string, force = false) => enqueueVideo('exercise', exerciseId, force);
export const enqueueLevelHomeVideo = (id: string, force = false) => enqueueVideo('levelHome', id, force);

async function pump(): Promise<void> {
  if (state.running) return;
  state.running = true;
  state.startedAt = state.startedAt ?? new Date().toISOString();
  try {
    while (queue.length) {
      const job = queue.shift()!;
      state.current = `${job.kind}:${job.id}`;
      try {
        const outcome = await optimizeOne(job.kind, job.id, job.force);
        if (outcome === 'skipped') state.skipped += 1;
        else state.done += 1;
      } catch (e: any) {
        state.failed += 1;
        state.lastError = `${job.kind}:${job.id}: ${e?.message || e}`;
        console.error('[video-optimize] failed', state.lastError);
        try {
          await modelFor(job.kind).updateOne({ _id: job.id }, { $set: { 'videoOptimization.status': 'failed', 'videoOptimization.error': String(e?.message || e).slice(0, 300), 'videoOptimization.updatedAt': new Date() } });
        } catch {
          /* ignore */
        }
      } finally {
        queued.delete(`${job.kind}:${job.id}`);
      }
    }
  } finally {
    state.running = false;
    state.current = null;
  }
}

async function optimizeOne(kind: VideoTarget, exerciseId: string, force: boolean): Promise<'done' | 'skipped'> {
  const Model = modelFor(kind);
  const ex: any = await Model.findById(exerciseId).lean();
  if (!ex) throw new Error('exercise not found');
  const sourceKey = objectKeyFromVideo(ex.videoFilePath, ex.videoUrl);
  if (!sourceKey || ex.videoSource === 'youtube' || ex.videoSource === 'external') return 'skipped';
  const opt = ex.videoOptimization;
  if (!force && opt?.status === 'ready' && opt.sourceKey === sourceKey && ex.videoVariants?.length) return 'skipped';
  if (!(await ffmpegAvailable())) throw new Error('ffmpeg is not installed on this server');

  await Model.updateOne({ _id: exerciseId }, { $set: { 'videoOptimization.status': 'processing', 'videoOptimization.sourceKey': sourceKey, 'videoOptimization.updatedAt': new Date() } });

  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'vopt-'));
  try {
    const original = path.join(work, 'original' + (path.extname(sourceKey) || '.mp4'));
    await minioClient.fGetObject(BUCKETS.VIDEOS, sourceKey, original);

    const result = await transcodeLadder(original, path.join(work, 'out'), { hls: process.env.VIDEO_HLS !== 'false' });

    const stamp = Date.now();
    const owner = kind === 'exercise' ? `exercises/${String(exerciseId)}` : `level-home/${String(ex.levelSlug || exerciseId).replace(/[^a-z0-9-]/gi, '')}`;
    const base = `${owner}/optimized/${stamp}`;
    const put = async (file: string, key: string) => {
      await minioClient.fPutObject(BUCKETS.VIDEOS, key, file, { 'Content-Type': contentTypeFor(file) });
      return `/${BUCKETS.VIDEOS}/${key}`;
    };

    const variants = [];
    for (const r of result.renditions) {
      variants.push({
        quality: r.key,
        url: await put(r.file, `${base}/v${r.key}.mp4`),
        bytes: r.bytes,
        width: r.width,
        height: r.height,
        bitrateKbps: r.bitrateKbps,
      });
    }
    const posterUrl = result.poster ? await put(result.poster.file, `${base}/poster.jpg`) : undefined;

    let hlsUrl: string | undefined;
    if (result.hls) {
      const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]));
      for (const f of walk(result.hls.dir)) {
        const rel = path.relative(result.hls.dir, f).replace(/\\/g, '/');
        await put(f, `${base}/hls/${rel}`);
      }
      hlsUrl = `/${BUCKETS.VIDEOS}/${base}/hls/master.m3u8`;
    }

    const optimizedBytes = variants.reduce((n, v) => n + v.bytes, 0);
    const previousFolder = ex.videoOptimization?.folder as string | undefined;
    await Model.updateOne(
      { _id: exerciseId },
      {
        $set: {
          videoVariants: variants,
          videoPosterUrl: posterUrl,
          videoHlsUrl: hlsUrl,
          videoDurationSec: Math.round(result.source.durationSec * 10) / 10,
          videoOptimization: {
            status: 'ready',
            sourceKey,
            folder: base,
            sourceBytes: result.source.bytes,
            sourceCodec: result.source.codec,
            sourceBitrateKbps: result.source.bitrateKbps,
            optimizedBytes,
            updatedAt: new Date(),
          },
        },
      }
    );

    // Derived renditions of a previous run are replaced; the ORIGINAL upload is never touched.
    if (previousFolder && previousFolder !== base) await removePrefix(previousFolder + '/').catch(() => undefined);
    console.log(`[video-optimize] ${exerciseId} ${result.source.codec} ${(result.source.bytes / 1048576).toFixed(1)}MB -> ${(variants[variants.length - 1]?.bytes ?? 0) / 1024 | 0}KB (top rung)`);
    return 'done';
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

async function removePrefix(prefix: string): Promise<void> {
  const keys: string[] = [];
  await new Promise<void>((resolve, reject) => {
    const stream = minioClient.listObjectsV2(BUCKETS.VIDEOS, prefix, true);
    stream.on('data', (o: any) => o?.name && keys.push(o.name));
    stream.on('end', () => resolve());
    stream.on('error', reject);
  });
  if (keys.length) await minioClient.removeObjects(BUCKETS.VIDEOS, keys);
}

/** Queue every uploaded exercise video that has no up-to-date variants. Returns how many were queued. */
export async function enqueueAllExerciseVideos(force = false, limit = 500): Promise<{ queued: number; total: number }> {
  const rows: any[] = await Exercise.find({ $or: [{ videoSource: 'upload' }, { videoSource: { $exists: false }, videoFilePath: { $exists: true } }] })
    .select('_id videoFilePath videoUrl videoSource videoOptimization videoVariants')
    .limit(limit)
    .lean();
  let n = 0;
  for (const ex of rows) {
    const key = objectKeyFromVideo(ex.videoFilePath, ex.videoUrl);
    if (!key) continue;
    const upToDate = ex.videoOptimization?.status === 'ready' && ex.videoOptimization.sourceKey === key && ex.videoVariants?.length;
    if (upToDate && !force) continue;
    enqueueExerciseVideo(String(ex._id), force);
    n += 1;
  }
  // The Home level video (10 MB+ in production) is optimised by the same pipeline.
  const levels: any[] = await LevelHomeContent.find({ videoUrl: { $exists: true, $ne: '' } })
    .select('_id videoUrl videoOptimization videoVariants')
    .lean();
  for (const lv of levels) {
    const key = objectKeyFromVideo(null, lv.videoUrl);
    if (!key) continue;
    const upToDate = lv.videoOptimization?.status === 'ready' && lv.videoOptimization.sourceKey === key && lv.videoVariants?.length;
    if (upToDate && !force) continue;
    enqueueVideo('levelHome', String(lv._id), force);
    n += 1;
  }
  return { queued: n, total: rows.length + levels.length };
}
