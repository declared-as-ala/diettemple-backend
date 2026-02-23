/**
 * Vercel serverless entry: wraps Express app and ensures MongoDB is connected.
 * Root and /health skip DB so they respond fast (avoids cold-start timeout).
 */
import mongoose from 'mongoose';
import serverless from 'serverless-http';
import app from '../src/app';

let dbConnected = false;

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

const handler = serverless(app);

function isHealthOrRoot(req: any): boolean {
  const path = ((req.url || req.path || '') as string).split('?')[0].replace(/\/$/, '') || '/';
  return req.method === 'GET' && (path === '/' || path === '/health');
}

export default async function (req: any, res: any) {
  if (isHealthOrRoot(req)) {
    return handler(req, res);
  }
  await ensureDb();
  return handler(req, res);
}
