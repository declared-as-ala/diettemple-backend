/**
 * Seed recipe favorites for user1@diettemple.com (recipes come from the managed dataset: npm run seed:recipes).
 * Run: npm run seed:nutrition
 */
import User from '../models/User.model';
import Recipe from '../models/Recipe.model';
import RecipeFavorite from '../models/RecipeFavorite.model';
import { runSeed } from './runSeed';

// Recipes are no longer seeded here: the catalogue is the managed dataset (npm run seed:recipes).


export async function seedNutrition(): Promise<void> {
  const user = await User.findOne({ email: 'user1@diettemple.com' }).lean();
  if (!user) {
    console.log('⚠️ user1@diettemple.com not found. Run seed:users first.');
  }

  const recipeIds = (await Recipe.find({ status: 'published' }).select('_id').lean()).map((r: any) => r._id);
  if (recipeIds.length < 4) {
    console.log('⚠️ Need at least 4 recipes for favorites seed.');
    return;
  }

  if (user) {
    const userId = user._id;
    await RecipeFavorite.deleteMany({ userId });
    const toFavorite = recipeIds.slice(0, 5);
    await RecipeFavorite.insertMany(toFavorite.map((recipeId) => ({ userId, recipeId })));
    console.log(`✅ Seeded ${toFavorite.length} recipe favorites for user1@diettemple.com`);
    console.log('   userId:', userId.toString());
    console.log('   favorites count:', toFavorite.length);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dateKey = today.toISOString().split('T')[0];
  console.log('   today dateKey:', dateKey);
}

if (require.main === module) {
  runSeed('nutrition', seedNutrition)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
