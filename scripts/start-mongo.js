/**
 * Helper script to check MongoDB connection
 * Run with: node scripts/start-mongo.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/diettemple';

console.log('🔌 Checking MongoDB connection...');
console.log(`URI: ${MONGODB_URI}`);

mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log('✅ MongoDB connected successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ MongoDB connection failed:');
    console.error(error.message);
    console.log('\n💡 Troubleshooting:');
    console.log('1. Ensure MongoDB is running');
    console.log('2. Check MONGODB_URI in .env file');
    console.log('3. Try: mongosh (to test MongoDB CLI)');
    process.exit(1);
  });



