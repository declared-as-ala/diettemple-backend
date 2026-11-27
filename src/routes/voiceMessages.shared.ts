import { Response } from 'express';
import { AudioError, parseRange } from '../services/audio';
import { VoiceError, audioMeta, openAudio, type AudioAccess } from '../services/voice.service';

export function fail(res: Response, e: unknown) {
  if (e instanceof VoiceError) return res.status(e.httpStatus).json({ code: e.code, message: e.message });
  if (e instanceof AudioError) return res.status(400).json({ code: 'audio', message: e.message });
  console.error('[voice]', e);
  return res.status(500).json({ message: 'Une erreur est survenue. Réessayez dans un instant.' });
}

/** Streams the audio with HTTP Range support (needed to seek in the player). Private, never cached. */
export async function streamAudio(req: any, res: Response, id: string, who: AudioAccess) {
  const total = await audioMeta(id, who);
  const range = parseRange(req.headers.range as string | undefined, total);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (range === 'invalid') {
    res.setHeader('Content-Range', `bytes */${total}`);
    return res.status(416).end();
  }
  const { file, mime } = await openAudio(id, who, range);
  res.setHeader('Content-Type', mime);
  if (range) {
    res.status(206);
    res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${total}`);
    res.setHeader('Content-Length', String(range.end - range.start + 1));
  } else {
    res.setHeader('Content-Length', String(total));
  }
  file.stream.on('error', () => res.destroy());
  file.stream.pipe(res);
}
