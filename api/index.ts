/**
 * Vercel serverless entry. Uses src/app.ts (Express app) only — never src/index.ts (app.listen).
 * /health and /favicon.ico respond without loading Express or MongoDB.
 * Other routes: cached Mongo + Express in parallel; fast-fail 503 if init or DB times out.
 */
const STARTUP_TIMEOUT_MS = 25_000; // 503 before Vercel 60s so client can retry

let handler: ((req: any, res: any) => Promise<any> | void) | null = null;

function getPath(req: any): string {
  const raw = (req.url || req.path || req.originalUrl || '') as string;
  const path = raw.split('?')[0].toLowerCase().replace(/\/+$/, '') || '/';
  return path;
}

function isQuickPath(req: any): boolean {
  if (req.method !== 'GET') return false;
  const path = getPath(req);
  return path === '/' || path === '/api' || path === '/health' || path === '/favicon.ico';
}

function sendQuickResponse(res: any, path: string): void {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  const body =
    path === '/health' || path === '/api'
      ? JSON.stringify({ status: 'OK', message: 'DietTemple API is running' })
      : JSON.stringify({ status: 'ok', message: 'DietTemple API', health: '/health' });
  res.setHeader('Content-Length', Buffer.byteLength(body));
  res.end(body);
}

function send503(res: any, message: string): void {
  res.statusCode = 503;
  res.setHeader('Content-Type', 'application/json');
  const body = JSON.stringify({ error: 'Service temporarily unavailable', message, retry: true });
  res.setHeader('Content-Length', Buffer.byteLength(body));
  res.end(body);
}

async function getHandler(): Promise<(req: any, res: any) => Promise<any> | void> {
  if (handler) return handler;
  const serverless = (await import('serverless-http')).default;
  const app = (await import('../src/app')).default;
  handler = serverless(app);
  return handler;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error('Startup timeout — cold start took too long. Please retry.')),
      ms
    );
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

export default async function (req: any, res: any) {
  if (isQuickPath(req)) {
    sendQuickResponse(res, getPath(req));
    return;
  }

  // Validate MONGODB_URI early so we fail fast with clear error instead of hanging
  const uri = process.env.MONGODB_URI;
  if (!uri || typeof uri !== 'string' || uri.trim() === '') {
    console.error('[vercel] MONGODB_URI is missing. Set it in Vercel → Settings → Environment Variables.');
    send503(res, 'MONGODB_URI is not set. Add it in Vercel Environment Variables.');
    return;
  }

  try {
    const tStart = Date.now();
    console.log(`[vercel] request start ${getPath(req)} (before connect)`);
    const { connectMongo } = await import('../src/lib/mongoServerless');
    const connectPromise = connectMongo().then(() => {
      console.log(`[vercel] after connect ${Date.now() - tStart}ms`);
    });
    const handlerPromise = getHandler().then((h) => {
      console.log(`[vercel] handler ready ${Date.now() - tStart}ms`);
      return h;
    });
    const [, h] = await withTimeout(
      Promise.all([connectPromise, handlerPromise]),
      STARTUP_TIMEOUT_MS
    );
    await h(req, res);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Startup failed';
    console.error('[vercel]', message);
    send503(res, message);
  }
}
