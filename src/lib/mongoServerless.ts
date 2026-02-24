/**
 * Serverless-friendly MongoDB Atlas connection for Vercel.
 * - Singleton: one cached connection per process (global promise reuse).
 * - Never create a new connection per request; never call close() in request path.
 * - Env-driven timeouts and pool so we fail fast before platform 504.
 *
 * Atlas: allow 0.0.0.0/0 in Network Access (Vercel uses dynamic IPs).
 */

function numEnv(name: string, defaultVal: number): number {
  const v = process.env[name];
  if (v === undefined || v === '') return defaultVal;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? defaultVal : n;
}

const SERVER_SELECTION_TIMEOUT_MS = numEnv('MONGODB_SERVER_SELECTION_TIMEOUT_MS', 5_000);
const CONNECT_TIMEOUT_MS = numEnv('MONGODB_CONNECT_TIMEOUT_MS', 5_000);
const SOCKET_TIMEOUT_MS = numEnv('MONGODB_SOCKET_TIMEOUT_MS', 10_000);
const MAX_POOL_SIZE = numEnv('MONGODB_MAX_POOL_SIZE', 10);
const MAX_IDLE_TIME_MS = numEnv('MONGODB_MAX_IDLE_TIME_MS', 60_000);
/** Hard cap on connect so we 503 before Vercel 504. */
const CONNECT_TOTAL_TIMEOUT_MS = numEnv('MONGODB_CONNECT_TOTAL_TIMEOUT_MS', 15_000);

declare global {
  // eslint-disable-next-line no-var
  var __MONGO_CONNECTION_PROMISE__: Promise<void> | undefined;
}

function getUri(): string {
  const uri = process.env.MONGODB_URI;
  if (!uri || typeof uri !== 'string' || uri.trim() === '') {
    console.error('[mongoServerless] MONGODB_URI is missing or empty.');
    throw new Error('MONGODB_URI is not set. Add it in Vercel → Project → Settings → Environment Variables.');
  }
  if (!uri.startsWith('mongodb') && !uri.startsWith('mongodb+srv')) {
    console.error('[mongoServerless] MONGODB_URI must start with mongodb:// or mongodb+srv://');
    throw new Error('MONGODB_URI must be a valid MongoDB connection string.');
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
 * Connect once per serverless process; reuse across warm invocations.
 * Do NOT call mongoose.connection.close() after requests.
 */
export async function connectMongo(): Promise<void> {
  if (global.__MONGO_CONNECTION_PROMISE__) {
    return global.__MONGO_CONNECTION_PROMISE__;
  }

  const uri = getUri();
  const mongoose = (await import('mongoose')).default;

  mongoose.set('bufferCommands', false);

  const connectPromise = mongoose.connect(uri, {
    serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS,
    connectTimeoutMS: CONNECT_TIMEOUT_MS,
    socketTimeoutMS: SOCKET_TIMEOUT_MS,
    maxPoolSize: MAX_POOL_SIZE,
    maxIdleTimeMS: MAX_IDLE_TIME_MS,
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
