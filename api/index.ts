/**
 * Vercel serverless entry. Root /health /favicon.ico respond immediately
 * without loading Express or MongoDB to avoid 300s timeout.
 */
import mongoose from 'mongoose';

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

async function getHandler(): Promise<(req: any, res: any) => Promise<any> | void> {
  if (handler) return handler;
  const serverless = (await import('serverless-http')).default;
  const app = (await import('../src/app')).default;
  handler = serverless(app);
  return handler;
}

async function ensureDb(): Promise<void> {
  if (dbConnected) return;
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not set. Add it in Vercel Environment Variables.');
  }
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
  });
  dbConnected = true;
}

export default async function (req: any, res: any) {
  if (isQuickPath(req)) {
    sendQuickResponse(res, getPath(req));
    return;
  }
  await ensureDb();
  const h = await getHandler();
  return h(req, res);
}
