/**
 * Vercel serverless entry. Root /health /favicon.ico respond immediately
 * without loading Express or MongoDB. Other routes: init DB + app in parallel;
 * if init takes too long (cold start), return 503 so client can retry instead of 300s timeout.
 */
const STARTUP_TIMEOUT_MS = 55_000; // Return 503 before Vercel kills at 60s (or 300s on some plans)

let dbConnected = false;
let handler: (req: any, res: any) => Promise<any> | void;

function getPath(req: any): string {
  const raw = (req.url || req.path || req.originalUrl || '') as string;
  const path = raw.split('?')[0].toLowerCase().replace(/\/+$/, '') || '/';
  return path;
}

function isQuickPath(req: any): boolean {
  if (req.method !== 'GET') return false;
  const path = getPath(req);
  return path === '/' || path === '/health' || path === '/favicon.ico';
}

function sendQuickResponse(res: any, path: string): void {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  const body =
    path === '/health'
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

/** Lazy-load mongoose so /health never loads it. Connect with shorter timeouts for faster fail. */
async function ensureDb(): Promise<void> {
  if (dbConnected) return;
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not set. Add it in Vercel Environment Variables.');
  }
  const mongoose = (await import('mongoose')).default;
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 8000,
    connectTimeoutMS: 6000,
  });
  dbConnected = true;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Startup timeout — cold start took too long. Please retry.')), ms);
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

  try {
    // Run DB + app load in parallel; fail fast if cold start exceeds limit so client gets 503 and can retry
    const [, h] = await withTimeout(
      Promise.all([ensureDb(), getHandler()]),
      STARTUP_TIMEOUT_MS
    );
    await h(req, res);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Startup failed';
    send503(res, message);
  }
}
