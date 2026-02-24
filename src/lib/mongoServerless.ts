/**
 * Serverless-friendly MongoDB connection: single cached promise, fast-fail timeouts.
 * Used by Vercel api/index.ts only. Local server uses src/index.ts (mongoose.connect there).
 */

const SERVER_SELECTION_TIMEOUT_MS = 5000;
const CONNECT_TIMEOUT_MS = 5000;
const SOCKET_TIMEOUT_MS = 10000;

declare global {
  // eslint-disable-next-line no-var
  var __MONGO_CONNECTION_PROMISE__: Promise<void> | undefined;
}

function getUri(): string {
  const uri = process.env.MONGODB_URI;
  if (!uri || typeof uri !== 'string' || uri.trim() === '') {
    console.error('[mongoServerless] MONGODB_URI is missing or empty. Set it in Vercel Environment Variables.');
    throw new Error('MONGODB_URI is not set. Add it in Vercel → Project → Settings → Environment Variables.');
  }
  if (!uri.startsWith('mongodb') && !uri.startsWith('mongodb+srv')) {
    console.error('[mongoServerless] MONGODB_URI must start with mongodb:// or mongodb+srv://');
    throw new Error('MONGODB_URI must be a valid MongoDB connection string (mongodb:// or mongodb+srv://).');
  }
  return uri.trim();
}

/**
 * Connect once per serverless invocation context; reuse the same promise across concurrent requests.
 * Fast-fail so we return 503 instead of hanging 60s.
 */
export async function connectMongo(): Promise<void> {
  if (global.__MONGO_CONNECTION_PROMISE__) {
    return global.__MONGO_CONNECTION_PROMISE__;
  }

  const uri = getUri();
  const mongoose = (await import('mongoose')).default;

  const promise = mongoose.connect(uri, {
    serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS,
    connectTimeoutMS: CONNECT_TIMEOUT_MS,
    socketTimeoutMS: SOCKET_TIMEOUT_MS,
  }).then(() => {
    if (mongoose.connection.readyState !== 1) {
      throw new Error('MongoDB connection not ready after connect.');
    }
  });

  global.__MONGO_CONNECTION_PROMISE__ = promise;
  return promise;
}
