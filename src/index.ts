// Load env first (app.ts also loads it; ensure local .env is used when present)
import dotenv from 'dotenv';
import path from 'path';
const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath }) || dotenv.config();

import mongoose from 'mongoose';
import app from './app';

const PORT = parseInt(process.env.PORT || '5000', 10);

async function migrateLevelTemplates() {
  try {
    const col = mongoose.connection.collection('leveltemplates');

    // 1. Drop any legacy unique indexes (name_1 and name_1_gender_1 if unique)
    const indexes = await col.indexes();
    for (const idx of indexes) {
      if ((idx.name === 'name_1' || idx.name === 'name_1_gender_1') && idx.unique) {
        await col.dropIndex(idx.name);
        console.log(`[migration] Dropped legacy unique index: ${idx.name}`);
      }
    }

    // 2. Set gender: 'M' on any templates that still have gender: null
    //    (templates created before the gender field was added)
    const result = await col.updateMany(
      { gender: null },
      { $set: { gender: 'M' } }
    );
    if (result.modifiedCount > 0) {
      console.log(`[migration] Set gender='M' on ${result.modifiedCount} legacy level template(s)`);
    }
  } catch (err: any) {
    if (err?.codeName !== 'IndexNotFound') console.warn('[migration] migrateLevelTemplates:', err?.message);
  }
}

mongoose
  .connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/diettemple')
  .then(async () => {
    console.log('Connected to MongoDB');
    await migrateLevelTemplates();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  });
