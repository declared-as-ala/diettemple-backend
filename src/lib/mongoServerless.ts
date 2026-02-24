/**
 * Serverless-friendly MongoDB Atlas connection for Vercel:
 * - Single cached connection per invocation (global promise reuse)
 * - Aggressive timeouts so we return 503 instead of 504
 * - bufferCommands: false so operations fail fast if not connected
 * - Small pool (maxPoolSize: 2) for serverless
 *
 * Atlas requirement: In Network Access, allow 0.0.0.0/0 (Vercel uses dynamic IPs).
 */

const SERVER_SELECTION_TIMEOUT_MS = 8000;
const CONNECT_TIMEOUT_MS = 8000;
const SOCKET_TIMEOUT_MS = 12000;
/** Hard cap: if connect doesn't resolve in this time, reject (prevents 60s burn). */
const CONNECT_TOTAL_TIMEOUT_MS = 15000;

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
  let out = uri.trim();
  const addParam = (key: string, value: string) => {
    if (new RegExp(`[?&]${key}=`, 'i').test(out)) return;
    out += out.includes('?') ? '&' : '?';
    out += `${key}=${value}`;
  };
  addParam('retryWrites', 'true');
  addParam('retryReads', 'true');
  return out;
}

/**
 * Connect once per serverless invocation; reuse the same promise.
 * Fails fast so Vercel returns 503 instead of 504 gateway timeout.
 */
export async function connectMongo(): Promise<void> {
  if (global.__MONGO_CONNECTION_PROMISE__) {
    return global.__MONGO_CONNECTION_PROMISE__;
  }

  const uri = getUri();
  const mongoose = (await import('mongoose')).default;

  // Serverless: do not buffer commands; fail immediately if not connected
  mongoose.set('bufferCommands', false);

  const connectPromise = mongoose.connect(uri, {
    serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS,
    connectTimeoutMS: CONNECT_TIMEOUT_MS,
    socketTimeoutMS: SOCKET_TIMEOUT_MS,
    maxPoolSize: 2,
  }).then(() => {
    if (mongoose.connection.readyState !== 1) {
      throw new Error('MongoDB connection not ready after connect.');
    }
  });

  const wrapped = new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => {
      reject(new Error('MongoDB Atlas connection timed out. Check Network Access (0.0.0.0/0) and cluster region.'));
    }, CONNECT_TOTAL_TIMEOUT_MS);
    connectPromise.then(
      () => {
        clearTimeout(t);
        resolve();
      },
      (err) => {
        clearTimeout(t);
        reject(err);
      }
    );
  });

  global.__MONGO_CONNECTION_PROMISE__ = wrapped;
  return wrapped;
}
