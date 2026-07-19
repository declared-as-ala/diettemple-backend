/**
 * Export sessions from Atlas and save to file for seeding
 * Usage: npx ts-node src/scripts/export-atlas-sessions.ts
 */
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';

const ATLAS_URI = 'mongodb+srv://ala:ala123@cluster0.tojwjkt.mongodb.net/diettemple';

async function exportSessions() {
  try {
    console.log('🔗 Connecting to Atlas diettemple...');
    const atlasConn = await mongoose.createConnection(ATLAS_URI).asPromise();

    console.log('📥 Fetching all sessiontemplates...');
    const sessionsCollection = atlasConn.collection('sessiontemplates');
    const sessions = await sessionsCollection.find({}).toArray();

    if (sessions.length === 0) {
      console.log('❌ No sessions found in Atlas');
      await atlasConn.close();
      return;
    }

    console.log(`✅ Found ${sessions.length} sessions`);

    // Save to file
    const outputDir = path.join(__dirname, '../../data');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = path.join(outputDir, 'atlas-sessions.json');
    fs.writeFileSync(outputPath, JSON.stringify(sessions, null, 2));

    console.log(`💾 Exported to: ${outputPath}`);
    console.log(`\n📋 Sessions exported:`);
    sessions.forEach(s => {
      console.log(`   - ${s.title} (${s.items?.length || 0} exercises)`);
    });

    await atlasConn.close();
    console.log('\n✅ Export complete!');
  } catch (err) {
    console.error('❌ Export failed:', err);
    process.exit(1);
  }
}

exportSessions();
