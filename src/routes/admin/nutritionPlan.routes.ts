import { Router } from 'express';
import { body, param } from 'express-validator';
import NutritionPlanTemplate from '../../models/NutritionPlanTemplate.model';
import { AuthRequest } from '../../middleware/auth.middleware';

const router = Router();

router.get('/', async (_req: AuthRequest, res) => {
  try {
    const list = await NutritionPlanTemplate.find().sort({ name: 1 }).lean();
    res.json({ nutritionPlanTemplates: list });
  } catch (e: unknown) {
    res.status(500).json({ message: (e as Error).message });
  }
});

router.get(
  '/:id',
  [param('id').isMongoId()],
  async (req: AuthRequest, res) => {
    try {
      const doc = await NutritionPlanTemplate.findById(req.params.id).lean();
      if (!doc) return res.status(404).json({ message: 'Nutrition plan not found' });
      res.json({ nutritionPlanTemplate: doc });
    } catch (e: unknown) {
      res.status(500).json({ message: (e as Error).message });
    }
  }
);

router.post(
  '/',
  [
    body('name').notEmpty().trim(),
    body('goalType').isIn(['lose_weight', 'maintain', 'gain_muscle']),
    body('dailyCalories').isNumeric(),
    body('macros').isObject(),
    body('macros.proteinG').isNumeric(),
    body('macros.carbsG').isNumeric(),
    body('macros.fatG').isNumeric(),
    body('mealsTemplate').optional().isArray(),
  ],
  async (req: AuthRequest, res) => {
    try {
      const doc = await NutritionPlanTemplate.create({
        name: req.body.name,
        description: req.body.description,
        goalType: req.body.goalType,
        dailyCalories: req.body.dailyCalories,
        macros: req.body.macros,
        mealsTemplate: req.body.mealsTemplate || [],
      });
      res.status(201).json({ nutritionPlanTemplate: doc.toObject() });
    } catch (e: unknown) {
      res.status(500).json({ message: (e as Error).message });
    }
  }
);

router.put(
  '/:id',
  [param('id').isMongoId()],
  async (req: AuthRequest, res) => {
    try {
      const doc = await NutritionPlanTemplate.findByIdAndUpdate(
        req.params.id,
        {
          $set: {
            ...(req.body.name != null && { name: req.body.name }),
            ...(req.body.description !== undefined && { description: req.body.description }),
            ...(req.body.goalType != null && { goalType: req.body.goalType }),
            ...(req.body.dailyCalories != null && { dailyCalories: req.body.dailyCalories }),
            ...(req.body.macros != null && { macros: req.body.macros }),
            ...(req.body.mealsTemplate !== undefined && { mealsTemplate: req.body.mealsTemplate }),
          },
        },
        { new: true }
      );
      if (!doc) return res.status(404).json({ message: 'Nutrition plan not found' });
      res.json({ nutritionPlanTemplate: doc.toObject() });
    } catch (e: unknown) {
      res.status(500).json({ message: (e as Error).message });
    }
  }
);

router.delete(
  '/:id',
  [param('id').isMongoId()],
  async (req: AuthRequest, res) => {
    try {
      const doc = await NutritionPlanTemplate.findByIdAndDelete(req.params.id);
      if (!doc) return res.status(404).json({ message: 'Nutrition plan not found' });
      res.json({ deleted: true });
    } catch (e: unknown) {
      res.status(500).json({ message: (e as Error).message });
    }
  }
);

export default router;
