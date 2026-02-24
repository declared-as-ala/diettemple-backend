import { Router } from 'express';
import Recipe from '../models/Recipe.model';

const router = Router();

const QUERY_TIMEOUT_MS = 10_000;
const MAX_RECIPES_LIST = 100;

// GET /api/recipes — list all recipes (public or auth), paginated
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(parseInt((req.query.limit as string) || '50', 10) || 50, MAX_RECIPES_LIST);
    const recipes = await Recipe.find()
      .maxTimeMS(QUERY_TIMEOUT_MS)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    res.json({
      recipes: recipes.map((r: any) => ({
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
        ingredients: r.ingredients || [],
      })),
    });
  } catch (e: unknown) {
    res.status(500).json({ error: 'error', message: (e as Error).message });
  }
});

export default router;
