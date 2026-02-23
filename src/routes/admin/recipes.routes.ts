/**
 * Admin recipe routes: list, get one, update (including video URL / upload).
 */
import { Router, Response } from 'express';
import { param, body, validationResult } from 'express-validator';
import Recipe from '../../models/Recipe.model';
import { AuthRequest } from '../../middleware/auth.middleware';

const router = Router();

// GET /admin/recipes — list all
router.get('/', async (_req, res: Response) => {
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

// GET /admin/recipes/:id
router.get('/:id', param('id').isMongoId(), async (req: AuthRequest, res: Response) => {
  try {
    const r = await Recipe.findById(req.params.id).lean();
    if (!r) return res.status(404).json({ message: 'Recette introuvable' });
    const rec = r as any;
    res.json({
      recipe: {
        _id: rec._id.toString(),
        title: rec.title,
        calories: rec.calories,
        protein: rec.protein,
        carbs: rec.carbs,
        fat: rec.fat,
        imageUrl: rec.imageUrl,
        tags: rec.tags || [],
        videoSource: rec.videoSource,
        videoUrl: rec.videoUrl,
        posterUrl: rec.posterUrl,
        ingredients: rec.ingredients || [],
      },
    });
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
      const r = doc.toObject();
      res.json({
        recipe: {
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
        },
      });
    } catch (e: unknown) {
      res.status(500).json({ message: (e as Error).message });
    }
  }
);

export default router;
