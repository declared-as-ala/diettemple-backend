/**
 * GET /api/foods?q=... — search foods by name/synonyms for scan meal "Remplacer" / "Ajouter un aliment".
 */
import { Router, Response } from 'express';
import { query } from 'express-validator';
import Food from '../models/Food.model';
import { normalizeText, rankFoods, escapeRegex } from '../lib/foodMatcher';
import { unitsForFood } from '../lib/portion';
import { AuthRequest } from '../middleware/auth.middleware';

const router = Router();

router.get(
  '/',
  [query('q').optional().isString()],
  async (req: AuthRequest, res: Response) => {
    try {
      const q = (req.query.q as string)?.trim() || '';
      const limit = Math.min(parseInt((req.query.limit as string) || '30', 10) || 30, 50);
      const select = '_id nameFr nameAr nameEn nameLocal synonyms searchKeys macrosPer100g tags servingUnits defaultUnit portionPresets nutritionBasis isDish cuisine';
      let list: any[] = [];
      if (q.length >= 1) {
        const norm = normalizeText(q);
        const re = new RegExp(escapeRegex(q), 'i');
        const candidates = await Food.find({
          $or: [{ nameFr: re }, { synonyms: re }, { nameAr: re }, { nameLocal: re }, { nameEn: re }, { searchKeys: new RegExp(escapeRegex(norm)) }],
        })
          .select(select)
          .limit(100)
          .lean();
        // Best matches first (aliases, Arabic/Tunisian names included), then the rest.
        const ranked = rankFoods(q, candidates as any[], limit).map((r) => r.food);
        const rest = (candidates as any[]).filter((c) => !ranked.includes(c));
        list = [...ranked, ...rest].slice(0, limit);
      } else {
        list = await Food.find().select(select).limit(limit).lean();
      }
      res.json({
        foods: list.map((f: any) => ({
          foodId: f._id.toString(),
          name: f.nameFr,
          ...(f.nameLocal ? { nameLocal: f.nameLocal } : {}),
          ...(f.nameAr ? { nameAr: f.nameAr } : {}),
          synonyms: f.synonyms || [],
          macrosPer100g: f.macrosPer100g,
          tags: f.tags || [],
          units: unitsForFood(f),
          ...(f.defaultUnit ? { defaultUnit: f.defaultUnit } : {}),
          ...(f.portionPresets ? { portionPresets: f.portionPresets } : {}),
          ...(f.nutritionBasis ? { nutritionBasis: f.nutritionBasis } : {}),
        })),
      });
    } catch (e: unknown) {
      res.status(500).json({ error: 'error', message: (e as Error).message });
    }
  }
);

export default router;
