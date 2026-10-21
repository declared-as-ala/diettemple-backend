/**
 * Bandwidth-saving HTTP behaviour for the API:
 *  - gzip/deflate for JSON bodies > 1 KB (before: nothing was compressed anywhere)
 *  - weak ETags, so an unchanged answer is revalidated with If-None-Match and returned as an empty 304
 *  - `Cache-Control: private, no-cache` on API GETs: clients may keep the body but must revalidate it, and shared
 *    caches never store per-user data. Routes that set their own Cache-Control are left alone.
 */
import compression from 'compression';
import type { Express, NextFunction, Request, Response } from 'express';

export function applyHttpOptimization(app: Express): void {
  app.set('etag', 'weak');
  app.use(compression({ threshold: 1024 }));
  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'GET' && !res.getHeader('Cache-Control')) res.setHeader('Cache-Control', 'private, no-cache');
    next();
  });
}
