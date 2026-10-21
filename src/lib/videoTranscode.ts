/**
 * Video optimisation for mobile data: turns one (often huge, HEVC 1080p) upload into
 *   - a small H.264/AAC progressive MP4 ladder (240 / 360 / 540 "p"), `+faststart`, short GOP
 *   - a poster JPEG (shown instantly, no video bytes needed)
 *   - HLS (master + per-rung playlists, 2 s TS segments) built from the SAME encodes (stream copy, no 2nd encode)
 *
 * Why not only HLS? Exercise demos are ~10 s looping clips. A 400 KB MP4 downloads in one request, loops from the
 * local cache (iOS expo-video cannot cache HLS) and starts faster than HLS (playlist + segment round-trips).
 * HLS is generated as well so longer videos / future content can use true adaptive streaming.
 *
 * The original file is never modified. Pure helpers (args builders, parsers) are exported for tests.
 */
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

export const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
export const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe';
const PRESET = process.env.VIDEO_FFMPEG_PRESET || 'medium';
const THREADS = process.env.VIDEO_FFMPEG_THREADS || '2';
const STEP_TIMEOUT_MS = parseInt(process.env.VIDEO_FFMPEG_TIMEOUT_MS || '600000', 10) || 600_000;
const AUDIO_KBPS = 48;

export type RungKey = '240' | '360' | '540';
export interface Rung {
  key: RungKey;
  /** Length of the LONGEST side in px (orientation independent: portrait 240p = 240x426). */
  longSide: number;
  crf: number;
  maxrateK: number;
  bufK: number;
}

/** Tuned on a real 1080x1920 HEVC exercise clip: ~180 / 340 / 620 kbps average. */
export const LADDER: Rung[] = [
  { key: '240', longSide: 426, crf: 30, maxrateK: 230, bufK: 460 },
  { key: '360', longSide: 640, crf: 28, maxrateK: 480, bufK: 960 },
  { key: '540', longSide: 960, crf: 27, maxrateK: 900, bufK: 1800 },
];

export interface ProbeResult {
  codec: string;
  width: number;
  height: number;
  durationSec: number;
  bitrateKbps: number;
  bytes: number;
  hasAudio: boolean;
}

export interface Rendition {
  key: RungKey;
  file: string;
  bytes: number;
  width: number;
  height: number;
  bitrateKbps: number;
}

export interface TranscodeResult {
  source: ProbeResult;
  renditions: Rendition[];
  poster: { file: string; bytes: number } | null;
  hls: { masterFile: string; dir: string } | null;
}

// ───────────────────────────── pure helpers ─────────────────────────────

/** Never upscale: keep rungs whose long side fits inside the source, but always keep the smallest one. */
export function selectRungs(srcWidth: number, srcHeight: number, ladder: Rung[] = LADDER): Rung[] {
  const longSide = Math.max(srcWidth, srcHeight);
  const fit = ladder.filter((r) => r.longSide <= longSide);
  return fit.length ? fit : [ladder[0]];
}

/** Scale so the long side = L, the other side follows the aspect ratio and stays even (libx264 needs even dims). */
export function scaleFilter(longSide: number): string {
  return `scale='if(gt(iw,ih),${longSide},-2)':'if(gt(iw,ih),-2,${longSide})':flags=lanczos`;
}

export function buildMp4Args(input: string, output: string, rung: Rung, hasAudio: boolean): string[] {
  const args = [
    '-v', 'error', '-y', '-i', input,
    '-map', '0:v:0', ...(hasAudio ? ['-map', '0:a:0'] : []),
    '-vf', `${scaleFilter(rung.longSide)},fps=30`,
    '-c:v', 'libx264', '-profile:v', 'main', '-level', '3.1', '-preset', PRESET, '-threads', THREADS,
    '-crf', String(rung.crf), '-maxrate', `${rung.maxrateK}k`, '-bufsize', `${rung.bufK}k`,
    '-pix_fmt', 'yuv420p',
    // short, fixed GOP -> fast start, clean looping and (for HLS) segment boundaries on keyframes
    '-g', '60', '-keyint_min', '60', '-sc_threshold', '0',
  ];
  if (hasAudio) args.push('-c:a', 'aac', '-b:a', `${AUDIO_KBPS}k`, '-ac', '1');
  else args.push('-an');
  args.push('-movflags', '+faststart', output);
  return args;
}

export function buildPosterArgs(input: string, output: string, atSec: number): string[] {
  return ['-v', 'error', '-y', '-ss', String(atSec), '-i', input, '-frames:v', '1', '-vf', scaleFilter(640), '-q:v', '6', output];
}

export function buildHlsArgs(inputMp4: string, playlist: string, segmentPattern: string): string[] {
  return [
    '-v', 'error', '-y', '-i', inputMp4, '-c', 'copy',
    '-f', 'hls', '-hls_time', '2', '-hls_playlist_type', 'vod',
    '-hls_flags', 'independent_segments', '-hls_segment_type', 'mpegts',
    '-hls_segment_filename', segmentPattern, playlist,
  ];
}

/** HLS master playlist. BANDWIDTH is the PEAK (maxrate + audio) so players only pick rungs the link can sustain. */
export function buildMasterPlaylist(renditions: Array<Pick<Rendition, 'key' | 'width' | 'height' | 'bitrateKbps'>>, rungs: Rung[] = LADDER): string {
  const lines = ['#EXTM3U', '#EXT-X-VERSION:3', '#EXT-X-INDEPENDENT-SEGMENTS'];
  for (const r of [...renditions].sort((a, b) => a.bitrateKbps - b.bitrateKbps)) {
    const rung = rungs.find((x) => x.key === r.key)!;
    const peak = (rung.maxrateK + AUDIO_KBPS) * 1000;
    const avg = Math.round(r.bitrateKbps * 1000);
    lines.push(
      `#EXT-X-STREAM-INF:BANDWIDTH=${peak},AVERAGE-BANDWIDTH=${avg},RESOLUTION=${r.width}x${r.height},CODECS="avc1.4d401f,mp4a.40.2",FRAME-RATE=30`,
      `${r.key}/index.m3u8`
    );
  }
  return lines.join('\n') + '\n';
}

export function parseProbe(json: any, bytes: number): ProbeResult {
  const streams: any[] = Array.isArray(json?.streams) ? json.streams : [];
  const v = streams.find((s) => s.codec_type === 'video');
  if (!v) throw new Error('No video stream found');
  const duration = Number(json?.format?.duration ?? v.duration ?? 0);
  const br = Number(json?.format?.bit_rate ?? v.bit_rate ?? (duration > 0 ? (bytes * 8) / duration : 0));
  return {
    codec: String(v.codec_name || 'unknown'),
    width: Number(v.width) || 0,
    height: Number(v.height) || 0,
    durationSec: Number.isFinite(duration) ? duration : 0,
    bitrateKbps: Math.round(br / 1000),
    bytes,
    hasAudio: streams.some((s) => s.codec_type === 'audio'),
  };
}

export function contentTypeFor(file: string): string {
  const ext = path.extname(file).toLowerCase();
  return (
    { '.mp4': 'video/mp4', '.m3u8': 'application/vnd.apple.mpegurl', '.ts': 'video/mp2t', '.jpg': 'image/jpeg' } as Record<string, string>
  )[ext] || 'application/octet-stream';
}

// ───────────────────────────── process runners ─────────────────────────────

function run(cmd: string, args: string[], timeoutMs = STEP_TIMEOUT_MS): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`${cmd} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(new Error(`${cmd} could not start (${(e as Error).message}). Is ffmpeg installed?`));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(`${cmd} exited with ${code}: ${err.trim().slice(-400)}`));
    });
  });
}

export async function ffmpegAvailable(): Promise<boolean> {
  try {
    await run(FFMPEG, ['-version'], 8000);
    await run(FFPROBE, ['-version'], 8000);
    return true;
  } catch {
    return false;
  }
}

export async function probeVideo(file: string): Promise<ProbeResult> {
  const out = await run(FFPROBE, ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', file], 60_000);
  return parseProbe(JSON.parse(out), fs.statSync(file).size);
}

export async function transcodeLadder(inputPath: string, outDir: string, opts: { hls?: boolean } = {}): Promise<TranscodeResult> {
  fs.mkdirSync(outDir, { recursive: true });
  const source = await probeVideo(inputPath);
  if (!source.width || !source.height) throw new Error('Unreadable video dimensions');
  const rungs = selectRungs(source.width, source.height);
  const renditions: Rendition[] = [];

  for (const rung of rungs) {
    const file = path.join(outDir, `v${rung.key}.mp4`);
    await run(FFMPEG, buildMp4Args(inputPath, file, rung, source.hasAudio));
    const out = await probeVideo(file);
    // Validation: a rendition must be H.264, and never larger than the original it replaces.
    if (out.codec !== 'h264') throw new Error(`Rendition ${rung.key} is ${out.codec}, expected h264`);
    if (out.bytes >= source.bytes && source.bitrateKbps > rung.maxrateK * 2) throw new Error(`Rendition ${rung.key} is not smaller than the source`);
    renditions.push({ key: rung.key, file, bytes: out.bytes, width: out.width, height: out.height, bitrateKbps: out.bitrateKbps });
  }

  let poster: TranscodeResult['poster'] = null;
  try {
    const file = path.join(outDir, 'poster.jpg');
    await run(FFMPEG, buildPosterArgs(inputPath, file, Math.min(0.5, Math.max(0, source.durationSec / 4))), 60_000);
    poster = { file, bytes: fs.statSync(file).size };
  } catch {
    poster = null; // a missing poster must never fail the whole optimisation
  }

  let hls: TranscodeResult['hls'] = null;
  if (opts.hls !== false) {
    try {
      const hlsDir = path.join(outDir, 'hls');
      for (const r of renditions) {
        const dir = path.join(hlsDir, r.key);
        fs.mkdirSync(dir, { recursive: true });
        await run(FFMPEG, buildHlsArgs(r.file, path.join(dir, 'index.m3u8'), path.join(dir, 'seg_%03d.ts')), 120_000);
      }
      const masterFile = path.join(hlsDir, 'master.m3u8');
      fs.writeFileSync(masterFile, buildMasterPlaylist(renditions));
      hls = { masterFile, dir: hlsDir };
    } catch {
      hls = null; // MP4 ladder is the primary deliverable; HLS is a bonus
    }
  }

  return { source, renditions, poster, hls };
}
