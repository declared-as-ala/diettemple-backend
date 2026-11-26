import { Request, Response, NextFunction } from 'express';

/**
 * Minimal fixed-window rate limiter (in memory: the API runs as a single container, so no shared store is needed).
 * The client IP comes from the reverse proxy (Caddy rewrites X-Forwarded-For with the real address).
 */
export function clientIp(req: Request): string {
  const xff = req.headers['x-forwarded-for'];
  const first = (Array.isArray(xff) ? xff[0] : xff)?.split(',')[0]?.trim();
  return first || req.ip || req.socket.remoteAddress || 'unknown';
}

interface Options {
  windowMs: number;
  max: number;
  /** Extra key part, e.g. the account the request acts on. */
  keyFn?: (req: Request) => string;
  message?: string;
  /** Distinguishes limiters that share the same route family. */
  name: string;
}

export function rateLimit(opts: Options) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  let lastSweep = Date.now();

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    if (now - lastSweep > opts.windowMs) {
      for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
      lastSweep = now;
    }
    const key = `${opts.name}:${clientIp(req)}:${opts.keyFn ? opts.keyFn(req) : ''}`;
    const cur = hits.get(key);
    if (!cur || cur.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + opts.windowMs });
      return next();
    }
    cur.count += 1;
    if (cur.count > opts.max) {
      const retry = Math.max(1, Math.ceil((cur.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retry));
      return res.status(429).json({ message: opts.message || 'Trop de tentatives. Réessayez dans quelques instants.', retryAfterSeconds: retry });
    }
    next();
  };
}
