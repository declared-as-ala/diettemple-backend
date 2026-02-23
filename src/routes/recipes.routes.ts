import { Router } from 'express';
import Recipe from '../models/Recipe.model';

const router = Router();

// GET /api/recipes — list all recipes (public or auth)
router.get('/', async (_req, res) => {
  try {
    const recipes = await Recipe.find().lean().sort({ createdAt: -1 });
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
    res.status(500).json({ message: (e as Error).message });
  }
});

export default router;
