/**
 * Admin recipe routes: list, create, get one, update, delete.
 */
import { Router, Response } from 'express';
import { param, body, validationResult } from 'express-validator';
import Recipe from '../../models/Recipe.model';
import RecipeFavorite from '../../models/RecipeFavorite.model';
import { AuthRequest } from '../../middleware/auth.middleware';

const router = Router();

function recipeToJson(r: any) {
  return {
    _id: r._id.toString(),
    title: r.title,
    calories: r.calories,
    protein: r.protein,
    carbs: r.carbs,
    fat: r.fat,
    imageUrl: r.imageUrl,
    images: r.images || [],
    tags: r.tags || [],
    videoSource: r.videoSource,
    videoUrl: r.videoUrl,
    posterUrl: r.posterUrl,
    ingredients: r.ingredients || [],
  };
}

// GET /admin/recipes — list all
router.get('/', async (_req, res: Response) => {
  try {
    const recipes = await Recipe.find().lean().sort({ createdAt: -1 });
    res.json({ recipes: recipes.map((r: any) => recipeToJson(r)) });
  } catch (e: unknown) {
    res.status(500).json({ message: (e as Error).message });
  }
});

// POST /admin/recipes — create (must be before GET /:id)
router.post(
  '/',
  body('title').trim().notEmpty().withMessage('Titre requis'),
  body('calories').isNumeric().withMessage('Calories requises'),
  body('protein').optional().isNumeric(),
  body('carbs').optional().isNumeric(),
  body('fat').optional().isNumeric(),
  body('imageUrl').optional().isString(),
  body('images').optional().isArray(),
  body('tags').optional().isArray(),
  body('videoSource').optional().isIn(['upload', 'youtube']),
  body('videoUrl').optional().isString(),
  body('posterUrl').optional().isString(),
  body('ingredients').optional().isArray(),
  async (req: AuthRequest, res: Response) => {
    try {
      const err = validationResult(req);
      if (!err.isEmpty()) return res.status(400).json({ errors: err.array() });
      const calories = Number(req.body.calories);
      const doc = await Recipe.create({
        title: String(req.body.title).trim(),
        calories,
        protein: req.body.protein !== undefined && req.body.protein !== '' ? Number(req.body.protein) : undefined,
        carbs: req.body.carbs !== undefined && req.body.carbs !== '' ? Number(req.body.carbs) : undefined,
        fat: req.body.fat !== undefined && req.body.fat !== '' ? Number(req.body.fat) : undefined,
        imageUrl: req.body.imageUrl || undefined,
        images: Array.isArray(req.body.images) ? req.body.images.filter(Boolean) : [],
        tags: Array.isArray(req.body.tags) ? req.body.tags.map((t: string) => String(t).trim()).filter(Boolean) : [],
        videoSource: req.body.videoSource || undefined,
        videoUrl: req.body.videoUrl || undefined,
        posterUrl: req.body.posterUrl || undefined,
        ingredients: Array.isArray(req.body.ingredients) ? req.body.ingredients.map((s: string) => String(s).trim()).filter(Boolean) : [],
      });
      res.status(201).json({ recipe: recipeToJson(doc.toObject()) });
    } catch (e: unknown) {
      res.status(500).json({ message: (e as Error).message });
    }
  }
);

// GET /admin/recipes/:id
router.get('/:id', param('id').isMongoId(), async (req: AuthRequest, res: Response) => {
  try {
    const r = await Recipe.findById(req.params.id).lean();
    if (!r) return res.status(404).json({ message: 'Recette introuvable' });
    const rec = r as any;
    res.json({ recipe: recipeToJson(rec) });
  } catch (e: unknown) {
    res.status(500).json({ message: (e as Error).message });
  }
});

// PUT /admin/recipes/:id — update (video: YouTube URL or leave for upload)
router.put(
  '/:id',
  param('id').isMongoId(),
  body('title').optional().trim().isLength({ min: 1 }),
  body('calories').optional().isNumeric(),
  body('protein').optional().isNumeric(),
  body('carbs').optional().isNumeric(),
  body('fat').optional().isNumeric(),
  body('imageUrl').optional().isString(),
  body('images').optional().isArray(),
  body('tags').optional().isArray(),
  body('videoSource').optional().isIn(['upload', 'youtube']),
  body('videoUrl').optional().isString(),
  body('posterUrl').optional().isString(),
  body('ingredients').optional().isArray(),
  async (req: AuthRequest, res: Response) => {
    try {
      const err = validationResult(req);
      if (!err.isEmpty()) return res.status(400).json({ errors: err.array() });
      const doc = await Recipe.findByIdAndUpdate(
        req.params.id,
        {
          $set: {
            ...(req.body.title !== undefined && { title: req.body.title }),
            ...(req.body.calories !== undefined && { calories: req.body.calories }),
            ...(req.body.protein !== undefined && { protein: req.body.protein }),
            ...(req.body.carbs !== undefined && { carbs: req.body.carbs }),
            ...(req.body.fat !== undefined && { fat: req.body.fat }),
            ...(req.body.imageUrl !== undefined && { imageUrl: req.body.imageUrl }),
            ...(req.body.images !== undefined && { images: req.body.images }),
            ...(req.body.tags !== undefined && { tags: req.body.tags }),
            ...(req.body.videoSource !== undefined && { videoSource: req.body.videoSource }),
            ...(req.body.videoUrl !== undefined && { videoUrl: req.body.videoUrl }),
            ...(req.body.posterUrl !== undefined && { posterUrl: req.body.posterUrl }),
            ...(req.body.ingredients !== undefined && { ingredients: req.body.ingredients }),
          },
        },
        { new: true }
      );
      if (!doc) return res.status(404).json({ message: 'Recette introuvable' });
      res.json({ recipe: recipeToJson(doc.toObject()) });
    } catch (e: unknown) {
      res.status(500).json({ message: (e as Error).message });
    }
  }
);

// DELETE /admin/recipes/:id
router.delete('/:id', param('id').isMongoId(), async (req: AuthRequest, res: Response) => {
  try {
    const err = validationResult(req);
    if (!err.isEmpty()) return res.status(400).json({ errors: err.array() });
    const id = req.params.id;
    const deleted = await Recipe.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ message: 'Recette introuvable' });
    await RecipeFavorite.deleteMany({ recipeId: id });
    res.json({ ok: true });
  } catch (e: unknown) {
    res.status(500).json({ message: (e as Error).message });
  }
});

export default router;
