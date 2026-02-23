/**
 * Seed recipes and recipe favorites for user1@diettemple.com.
 * Run: npm run seed:nutrition
 */
import User from '../models/User.model';
import Recipe from '../models/Recipe.model';
import RecipeFavorite from '../models/RecipeFavorite.model';
import { runSeed } from './runSeed';

const RECIPES = [
  { title: 'Chicken Rice Bowl', calories: 550, protein: 42, carbs: 48, fat: 18, imageUrl: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400', tags: ['protéines'], ingredients: ['150 g poulet', '100 g riz cuit', '50 g légumes sautés', '1 c. à s. sauce soja'] },
  { title: 'Omelette protéinée', calories: 150, protein: 14, carbs: 2, fat: 10, imageUrl: 'https://images.unsplash.com/photo-1525351484163-7529414344d8?w=400', tags: ['petit-déjeuner'], ingredients: ['3 œufs', '30 g fromage', 'Herbes'] },
  { title: 'Salade thon', calories: 320, protein: 35, carbs: 12, fat: 14, imageUrl: 'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?w=400', tags: ['léger'], ingredients: ['100 g thon', 'Salade verte', 'Tomates', 'Maïs', 'Vinaigrette légère'] },
  { title: 'Porridge whey', calories: 380, protein: 28, carbs: 52, fat: 6, imageUrl: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400', tags: ['petit-déjeuner'], ingredients: ['60 g flocons d\'avoine', '30 g whey', 'Banane', 'Miel'] },
  { title: 'Poulet curry', calories: 420, protein: 38, carbs: 35, fat: 16, imageUrl: 'https://images.unsplash.com/photo-1455619452474-d2be8b1e70cd?w=400', tags: ['protéines'], ingredients: ['150 g poulet', 'Riz', 'Lait de coco', 'Curry', 'Légumes'] },
  { title: 'Bowl quinoa légumes', calories: 290, protein: 10, carbs: 42, fat: 8, imageUrl: 'https://images.unsplash.com/photo-1546069901-d5bfd2cbfb1f?w=400', tags: ['végan'], ingredients: ['80 g quinoa cuit', 'Avocat', 'Chou rouge', 'Carottes', 'Graines'] },
  { title: 'Smoothie protéiné', calories: 180, protein: 22, carbs: 14, fat: 2, imageUrl: 'https://images.unsplash.com/photo-1505252585461-04db1ebc25b1?w=400', tags: ['snack'], ingredients: ['30 g whey', '1 banane', 'Lait d\'amande', 'Glaçons'] },
  { title: 'Saumon riz asperges', calories: 510, protein: 36, carbs: 45, fat: 20, imageUrl: 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=400', tags: ['protéines'], ingredients: ['150 g saumon', '100 g riz', 'Asperges', 'Citron'] },
  { title: 'Soupe miso tofu', calories: 140, protein: 10, carbs: 12, fat: 6, imageUrl: 'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=400', tags: ['léger'], ingredients: ['Pâte miso', '80 g tofu', 'Algues', 'Oignon vert'] },
  { title: 'Wrap poulet avocat', calories: 450, protein: 32, carbs: 38, fat: 20, imageUrl: 'https://images.unsplash.com/photo-1626700051175-6818013e1d4f?w=400', tags: ['déjeuner'], ingredients: ['1 tortilla', '100 g poulet', '½ avocat', 'Crudités'] },
  { title: 'Pâtes complètes pesto', calories: 520, protein: 18, carbs: 62, fat: 22, imageUrl: 'https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=400', tags: ['glucides'], ingredients: ['120 g pâtes', 'Pesto', 'Parmesan', 'Tomates cerises'] },
  { title: 'Cottage cheese fruits', calories: 220, protein: 24, carbs: 22, fat: 4, imageUrl: 'https://images.unsplash.com/photo-1494597564530-871f2b93ac55?w=400', tags: ['snack'], ingredients: ['200 g cottage cheese', 'Fruits frais', 'Miel'] },
];

export async function seedNutrition(): Promise<void> {
  const user = await User.findOne({ email: 'user1@diettemple.com' }).lean();
  if (!user) {
    console.log('⚠️ user1@diettemple.com not found. Run seed:users first.');
  }

  const existing = await Recipe.countDocuments();
  if (existing === 0) {
    await Recipe.insertMany(RECIPES);
    console.log(`✅ Created ${RECIPES.length} recipes`);
  } else {
    console.log(`✅ Recipes already exist (${existing} docs)`);
  }

  const recipeIds = (await Recipe.find().select('_id').lean()).map((r: any) => r._id);
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
