import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Recipe from '../models/Recipe.model';
import { normalizeIngredientName } from '../services/recipeFilter.service';

dotenv.config();

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required');
  await mongoose.connect(uri);
  const recipes = await Recipe.find();
  let updated = 0;

  for (const recipe of recipes) {
    let changed = false;
    const r: any = recipe as any;
    if (r.preparationTimeMinutes === undefined) {
      r.preparationTimeMinutes = null;
      changed = true;
    }
    if (!Array.isArray(r.mealPrepDays)) {
      r.mealPrepDays = [];
      changed = true;
    }
    if (r.isBatchCookingFriendly === undefined) {
      r.isBatchCookingFriendly = false;
      changed = true;
    }

    const rawIngredients = Array.isArray(r.ingredients) ? r.ingredients : [];
    const normalizedIngredients = rawIngredients
      .map((ing: any) => {
        if (typeof ing === 'string') {
          const name = ing.trim();
          if (!name) return null;
          return { name, normalizedName: normalizeIngredientName(name) };
        }
        const name = String(ing?.name || '').trim();
        if (!name) return null;
        return {
          name,
          normalizedName: normalizeIngredientName(name),
          quantity: ing?.quantity,
          unit: ing?.unit,
        };
      })
      .filter(Boolean);
    if (JSON.stringify(normalizedIngredients) !== JSON.stringify(rawIngredients)) {
      r.ingredients = normalizedIngredients;
      changed = true;
    }

    if (changed) {
      await recipe.save();
      updated += 1;
    }
  }

  console.log(`Migration done. Updated recipes: ${updated}`);
  await mongoose.disconnect();
}

run().catch(async (e) => {
  console.error(e);
  await mongoose.disconnect();
  process.exit(1);
});

