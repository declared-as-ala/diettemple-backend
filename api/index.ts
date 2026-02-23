/**
 * Vercel serverless entry: wraps Express app and ensures MongoDB is connected.
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
  await mongoose.connect(uri);
  dbConnected = true;
}

const handler = serverless(app);

export default async function (req: any, res: any) {
  await ensureDb();
  return handler(req, res);
}
