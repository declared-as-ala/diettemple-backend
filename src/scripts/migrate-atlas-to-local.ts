/**
 * Migration: Extract sessions & exercises from Atlas production database
 * and push them into local VPS database
 *
 * Usage: npx ts-node src/scripts/migrate-atlas-to-local.ts
 */
import mongoose from 'mongoose';
import Exercise from '../models/Exercise.model';
import SessionTemplate from '../models/SessionTemplate.model';

const ATLAS_URI = 'mongodb+srv://ala:ala123@cluster0.tojwjkt.mongodb.net/?appName=Cluster0';
const LOCAL_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/diettemple';

async function migrateData() {
  try {
    console.log('🔗 Connecting to Atlas...');
    const atlasConn = await mongoose.createConnection(ATLAS_URI).asPromise();

    console.log('🔗 Connecting to Local DB...');
    const localConn = await mongoose.createConnection(LOCAL_URI).asPromise();

    // Fetch exercises from Atlas
    console.log('📥 Fetching exercises from Atlas...');
    const atlasExercisesCollection = atlasConn.collection('exercises');
    const atlasExercises = await atlasExercisesCollection.find({}).toArray();
    console.log(`✅ Found ${atlasExercises.length} exercises from Atlas`);

    // Fetch sessions from Atlas
    console.log('📥 Fetching sessions from Atlas...');
    const atlasSessionsCollection = atlasConn.collection('sessiontemplates');
    const atlasSessions = await atlasSessionsCollection.find({}).toArray();
    console.log(`✅ Found ${atlasSessions.length} sessions from Atlas`);

    // Insert exercises into local database
    if (atlasExercises.length > 0) {
      console.log('💾 Inserting exercises into local DB...');
      const localExercisesCollection = localConn.collection('exercises');

      let inserted = 0;
      let updated = 0;

      for (const exercise of atlasExercises) {
        const result = await localExercisesCollection.updateOne(
          { name: exercise.name },
          { $set: exercise },
          { upsert: true }
        );
        if (result.upsertedId) inserted++;
        else if (result.modifiedCount > 0) updated++;
      }

      console.log(`✅ Exercises: ${inserted} inserted, ${updated} updated`);
    }

    // Insert sessions into local database
    if (atlasSessions.length > 0) {
      console.log('💾 Inserting sessions into local DB...');
      const localSessionsCollection = localConn.collection('sessiontemplates');

      let inserted = 0;
      let updated = 0;

      for (const session of atlasSessions) {
        const result = await localSessionsCollection.updateOne(
          { title: session.title },
          { $set: session },
          { upsert: true }
        );
        if (result.upsertedId) inserted++;
        else if (result.modifiedCount > 0) updated++;
      }

      console.log(`✅ Sessions: ${inserted} inserted, ${updated} updated`);
    }

    // Verify
    console.log('📊 Verifying local database...');
    const localExercisesCount = await localConn.collection('exercises').countDocuments();
    const localSessionsCount = await localConn.collection('sessiontemplates').countDocuments();

    console.log(`📊 Local DB now has:`);
    console.log(`   - ${localExercisesCount} exercises`);
    console.log(`   - ${localSessionsCount} sessions`);

    await atlasConn.close();
    await localConn.close();

    console.log('\n✅ Migration complete!');
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  }
}

migrateData();
