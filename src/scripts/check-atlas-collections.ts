/**
 * Check what collections exist in Atlas production database
 */
import mongoose from 'mongoose';

const ATLAS_URI = 'mongodb+srv://ala:ala123@cluster0.tojwjkt.mongodb.net/?appName=Cluster0';

async function checkCollections() {
  try {
    console.log('🔗 Connecting to Atlas...');
    const atlasConn = await mongoose.createConnection(ATLAS_URI).asPromise();

    console.log('📋 Listing all collections in Atlas...');
    const collections = await atlasConn.db.listCollections().toArray();

    if (collections.length === 0) {
      console.log('❌ No collections found in Atlas database');
    } else {
      console.log(`✅ Found ${collections.length} collections:\n`);
      for (const col of collections) {
        const count = await atlasConn.collection(col.name).countDocuments();
        console.log(`   - ${col.name}: ${count} documents`);
      }
    }

    await atlasConn.close();
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

checkCollections();
