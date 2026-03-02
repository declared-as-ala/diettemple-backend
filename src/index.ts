// Load env first (app.ts also loads it; ensure local .env is used when present)
import dotenv from 'dotenv';
import path from 'path';
const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath }) || dotenv.config();

import mongoose from 'mongoose';
import app from './app';

const PORT = parseInt(process.env.PORT || '5000', 10);

mongoose
  .connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/diettemple')
  .then(() => {
    console.log('Connected to MongoDB');
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  });
