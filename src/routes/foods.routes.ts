/**
 * GET /api/foods?q=... — search foods by name/synonyms for scan meal "Remplacer" / "Ajouter un aliment".
 */
import { Router, Response } from 'express';
import { query } from 'express-validator';
import Food from '../models/Food.model';
import { AuthRequest } from '../middleware/auth.middleware';

const router = Router();

router.get(
  '/',
  [query('q').optional().isString()],
  async (req: AuthRequest, res: Response) => {
    try {
      const q = (req.query.q as string)?.trim() || '';
      const limit = Math.min(parseInt((req.query.limit as string) || '30', 10) || 30, 50);
      let list: any[] = [];
      if (q.length >= 1) {
        list = await Food.find({
          $or: [
            { nameFr: new RegExp(q, 'i') },
            { synonyms: new RegExp(q, 'i') },
          ],
        })
          .select('_id nameFr synonyms macrosPer100g tags')
          .limit(limit)
          .lean();
      } else {
        list = await Food.find().select('_id nameFr synonyms macrosPer100g tags').limit(limit).lean();
      }
      res.json({
        foods: list.map((f: any) => ({
          foodId: f._id.toString(),
          name: f.nameFr,
          synonyms: f.synonyms || [],
          macrosPer100g: f.macrosPer100g,
          tags: f.tags || [],
        })),
      });
    } catch (e: unknown) {
      res.status(500).json({ message: (e as Error).message });
    }
  }
);

export default router;
