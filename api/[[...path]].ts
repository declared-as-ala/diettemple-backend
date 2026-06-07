/**
 * Vercel catch-all: /api/xxx (e.g. /api/products, /api/products/123).
 * Reconstructs req.url from req.query.path so Express sees the full path.
 * /api alone is still handled by api/index.ts.
 */
import handler from './index';

export default async function (req: any, res: any) {
  const rawPath = req.query?.path;
  const pathSegments = Array.isArray(rawPath) ? rawPath : (rawPath != null ? [String(rawPath)] : []);
  if (pathSegments.length > 0) {
    const pathname = '/api/' + pathSegments.join('/');
    const qs = (req.url && String(req.url).includes('?')) ? String(req.url).substring(String(req.url).indexOf('?')) : '';
    req.url = pathname + qs;
    req.path = pathname;
    if (req.originalUrl == null) req.originalUrl = pathname + qs;
  } else if (req.url && String(req.url).startsWith('/api/')) {
    req.path = String(req.url).split('?')[0];
    if (req.originalUrl == null) req.originalUrl = req.url;
  }
  return handler(req, res);
}
