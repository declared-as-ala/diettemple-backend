/**
 * Vercel catch-all: /api/xxx (e.g. /api/products, /api/products/123).
 * Reconstructs req.url from req.query.path so Express sees the full path.
 * /api alone is still handled by api/index.ts.
 */
import handler from './index';

export default function (req: any, res: any) {
  const pathSegments = req.query?.path;
  if (Array.isArray(pathSegments) && pathSegments.length > 0) {
    const pathname = '/api/' + pathSegments.join('/');
    const query = (req.url && String(req.url).includes('?')) ? String(req.url).substring(String(req.url).indexOf('?')) : '';
    req.url = pathname + query;
    req.path = pathname;
    if (req.originalUrl == null) req.originalUrl = pathname + query;
  }
  return handler(req, res);
}
