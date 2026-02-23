import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

const envPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: envPath });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/diettemple';

export async function connectDb(): Promise<void> {
  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected to MongoDB');
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
  console.log('✅ Disconnected from MongoDB');
}

export async function runSeed(name: string, fn: () => Promise<void | number>): Promise<void> {
  try {
    await connectDb();
    await fn();
  } catch (err) {
    console.error(`❌ Seed ${name} failed:`, err);
    throw err;
  } finally {
    await disconnectDb();
  }
}
