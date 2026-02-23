/**
 * Reset database (dev only): drop all collections used by coaching seeds.
 * Use with caution.
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

const envPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: envPath });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/diettemple';

async function resetDb() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('resetDb is not allowed in production');
  }
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;
  if (!db) throw new Error('No database connection');
  const collections = await db.listCollections().toArray();
  const names = collections.map((c) => c.name);
  const toDrop = names.filter(
    (n) =>
      n === 'exercises' ||
      n === 'sessiontemplates' ||
      n === 'leveltemplates' ||
      n === 'users' ||
      n === 'subscriptions'
  );
  for (const name of toDrop) {
    await db.dropCollection(name);
    console.log(`Dropped ${name}`);
  }
  await mongoose.disconnect();
  console.log('✅ Reset complete.');
}

resetDb()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
