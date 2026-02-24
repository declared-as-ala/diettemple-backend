/**
 * Vercel catch-all: /api, /api/products, /api/products/123 etc.
 * Ensures req.url is the full path so Express routes correctly.
 * Without this, only the root /api handler runs and req.url is always /api.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Re-use the same handler as index; path is preserved when this file is invoked for /api/xxx
import handler from './index';

export default function (req: VercelRequest, res: VercelResponse) {
  // Vercel catch-all: req.query.path is e.g. ['products'] or ['products', '123']
  const pathSegments = req.query.path;
  if (Array.isArray(pathSegments) && pathSegments.length > 0) {
    const pathname = '/api/' + pathSegments.join('/');
    const query = req.url && req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
    (req as any).url = pathname + query;
    (req as any).path = pathname;
    if ((req as any).originalUrl == null) (req as any).originalUrl = pathname + query;
  }
  return handler(req as any, res as any);
}
