import { Router } from 'express';
import mongoose from 'mongoose';
import Recipe from '../models/Recipe.model';
import { buildRecipeQuery, calculateIngredientMatch, normalizeIngredientName, type IngredientMatchMode } from '../services/recipeFilter.service';

const router = Router();

/** Fields added by the managed recipe import (all optional: legacy recipes simply don't have them). */
function publicRecipeExtras(r: any) {
  return {
    ...(r.slug ? { slug: r.slug } : {}),
    ...(r.fiber != null ? { fiber: r.fiber } : {}),
    ...(Array.isArray(r.instructions) && r.instructions.length ? { instructions: r.instructions } : {}),
    ...(Array.isArray(r.notes) && r.notes.length ? { notes: r.notes } : {}),
    ...(r.servingLabel ? { servingLabel: r.servingLabel } : {}),
    ...(r.macrosApproximate ? { macrosApproximate: true } : {}),
    ...(r.nutritionOriginal ? { nutritionOriginal: r.nutritionOriginal } : {}),
    ...(Array.isArray(r.images) && r.images.length ? { images: r.images } : {}),
  };
}

function toPublicRecipe(r: any) {
  const rawIngredients = Array.isArray(r.ingredients) ? r.ingredients : [];
  return {
    _id: r._id.toString(),
    title: r.title,
    calories: r.calories,
    protein: r.protein,
    carbs: r.carbs,
    fat: r.fat,
    imageUrl: r.imageUrl,
    tags: r.tags || [],
    videoSource: r.videoSource,
    videoUrl: r.videoUrl,
    posterUrl: r.posterUrl,
    preparationTimeMinutes: r.preparationTimeMinutes ?? null,
    preparationTimeLabel: r.preparationTimeLabel ?? null,
    mealPrepDays: r.mealPrepDays || [],
    isBatchCookingFriendly: !!r.isBatchCookingFriendly,
    servings: r.servings ?? null,
    storageInstructions: r.storageInstructions ?? null,
    ingredients: rawIngredients.map((ing: any) =>
      typeof ing === 'string'
        ? { name: ing, normalizedName: normalizeIngredientName(ing) }
        : { name: ing?.name ?? '', normalizedName: ing?.normalizedName || normalizeIngredientName(ing?.name || ''), quantity: ing?.quantity, unit: ing?.unit }
    ),
    ...publicRecipeExtras(r),
  };
}

const QUERY_TIMEOUT_MS = 10_000;
const MAX_RECIPES_LIST = 100;

// GET /api/recipes — list all recipes (public or auth), paginated
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(parseInt((req.query.limit as string) || '20', 10) || 20, MAX_RECIPES_LIST);
    const page = Math.max(1, parseInt((req.query.page as string) || '1', 10) || 1);
    const skip = (page - 1) * limit;
    const maxPreparationTime = req.query.maxPreparationTime != null ? Number(req.query.maxPreparationTime) : undefined;
    const mealPrepDays = req.query.mealPrepDays != null ? Number(req.query.mealPrepDays) : undefined;
    const ingredients = typeof req.query.ingredients === 'string'
      ? req.query.ingredients.split(',').map((s) => s.trim()).filter(Boolean)
      : [];
    const matchMode: IngredientMatchMode = req.query.matchMode === 'all' ? 'all' : 'partial';

    const query = buildRecipeQuery({ maxPreparationTime, mealPrepDays });
    const total = await Recipe.countDocuments(query).maxTimeMS(QUERY_TIMEOUT_MS);
    const recipes = await Recipe.find(query)
      .maxTimeMS(QUERY_TIMEOUT_MS)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const mapped = recipes.map((r: any) => {
      const rawIngredients = Array.isArray(r.ingredients) ? r.ingredients : [];
      const normalizedIngredients = rawIngredients.map((ing: any) => {
        if (typeof ing === 'string') {
          return { name: ing, normalizedName: normalizeIngredientName(ing) };
        }
        return {
          name: ing?.name ?? '',
          normalizedName: ing?.normalizedName || normalizeIngredientName(ing?.name || ''),
          quantity: ing?.quantity,
          unit: ing?.unit,
        };
      });
      const ingredientMatch = ingredients.length > 0
        ? calculateIngredientMatch(normalizedIngredients as any, ingredients)
        : null;
      return {
        _id: r._id.toString(),
        title: r.title,
        calories: r.calories,
        protein: r.protein,
        carbs: r.carbs,
        fat: r.fat,
        imageUrl: r.imageUrl,
        tags: r.tags || [],
        videoSource: r.videoSource,
        videoUrl: r.videoUrl,
        posterUrl: r.posterUrl,
        preparationTimeMinutes: r.preparationTimeMinutes ?? null,
        preparationTimeLabel: r.preparationTimeLabel ?? null,
        mealPrepDays: r.mealPrepDays || [],
        isBatchCookingFriendly: !!r.isBatchCookingFriendly,
        servings: r.servings ?? null,
        storageInstructions: r.storageInstructions ?? null,
        ingredients: normalizedIngredients,
        ingredientMatch,
        ...publicRecipeExtras(r),
      };
    });

    let filtered = mapped;
    if (ingredients.length > 0 && matchMode === 'all') {
      filtered = mapped.filter((r) => (r.ingredientMatch?.missingCount ?? 0) === 0);
    }
    if (ingredients.length > 0) {
      filtered = filtered.sort((a, b) => {
        const ap = a.ingredientMatch?.matchPercentage ?? 0;
        const bp = b.ingredientMatch?.matchPercentage ?? 0;
        if (bp !== ap) return bp - ap;
        const am = a.ingredientMatch?.missingCount ?? 0;
        const bm = b.ingredientMatch?.missingCount ?? 0;
        if (am !== bm) return am - bm;
        const at = a.preparationTimeMinutes ?? Number.MAX_SAFE_INTEGER;
        const bt = b.preparationTimeMinutes ?? Number.MAX_SAFE_INTEGER;
        return at - bt;
      });
    }

    res.json({
      recipes: filtered,
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (e: unknown) {
    res.status(500).json({ error: 'error', message: (e as Error).message });
  }
});

// GET /api/recipes/:id — one recipe. Archived (replaced) recipes still resolve so favorites/history stay readable;
// recipes under review are never exposed.
router.get('/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Identifiant invalide.' });
    const r: any = await Recipe.findOne({ _id: req.params.id, status: { $ne: 'review' } }).maxTimeMS(QUERY_TIMEOUT_MS).lean();
    if (!r) return res.status(404).json({ message: 'Recette introuvable.' });
    res.json({ recipe: { ...toPublicRecipe(r), ...(r.status === 'archived' ? { archived: true } : {}) } });
  } catch (e: unknown) {
    res.status(500).json({ error: 'error', message: (e as Error).message });
  }
});

export default router;
