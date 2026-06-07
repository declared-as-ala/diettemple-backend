/**
 * Run all seeds in order: exercises -> sessionTemplates -> levelTemplates -> users -> subscriptions
 */
import { connectDb, disconnectDb } from './runSeed';
import { seedExercises } from './seedExercises';
import { seedSessionTemplates } from './seedSessionTemplates';
import { seedLevelTemplates } from './seedLevelTemplates';
import { seedUsers } from './seedUsers';
import { seedSubscriptions } from './seedSubscriptions';

async function seedAll() {
  await connectDb();
  try {
    await seedExercises();
    await seedSessionTemplates();
    await seedLevelTemplates();
    await seedUsers();
    await seedSubscriptions();
    console.log('\n✅ All seeds completed successfully.');
  } finally {
    await disconnectDb();
  }
}

seedAll()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
