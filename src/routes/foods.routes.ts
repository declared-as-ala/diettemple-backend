/**
 * GET /api/foods?q=... — search foods by name/synonyms for scan meal "Remplacer" / "Ajouter un aliment".
 */
import { Router, Response } from 'express';
import { query } from 'express-validator';
import Food from '../models/Food.model';
import { normalizeText, rankFoods, escapeRegex } from '../lib/foodMatcher';
import { unitsForFood } from '../lib/portion';
import { lookupBarcode, normalizeBarcode } from '../services/nutritionProviders.service';
import { AuthRequest } from '../middleware/auth.middleware';

const router = Router();

/**
 * Barcode lookup: local verified cache first, then Open Food Facts. A provider result is
 * persisted as an additive Food record so repeated scans are fast and respect rate limits.
 */
router.get('/barcode/:barcode', async (req: AuthRequest, res: Response) => {
  try {
    const barcode = normalizeBarcode(req.params.barcode);
    if (!barcode) return res.status(400).json({ found: false, message: 'Code-barres invalide.' });

    let food: any = await Food.findOne({ barcode }).lean();
    if (!food) {
      const product = await lookupBarcode(barcode);
      if (!product) return res.status(404).json({ found: false, barcode, message: 'Produit introuvable. Ajoute-le manuellement.' });
      const unit = product.basis === '100ml' ? { unit: 'ml', label: 'ml', labelPlural: 'ml', grams: 1, step: 25 } : { unit: 'g', label: 'g', labelPlural: 'g', grams: 1, step: 10 };
      food = await Food.findOneAndUpdate(
        { barcode: product.barcode },
        {
          $set: {
            nameFr: product.name,
            synonyms: [product.name, product.brand].filter(Boolean),
            searchKeys: [product.name, product.brand].filter(Boolean).map((v) => String(v).toLowerCase()),
            macrosPer100g: product.macrosPer100,
            servingUnits: [unit],
            defaultUnit: unit.unit,
            tags: ['packaged', product.basis === '100ml' ? 'drink' : 'food'],
            barcode: product.barcode,
            brand: product.brand,
            imageUrl: product.imageUrl,
            provider: 'open_food_facts',
            nutritionBasis: 'reference',
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      ).lean();
    }

    return res.json({
      found: true,
      product: {
        foodId: food._id.toString(),
        barcode: food.barcode,
        name: food.nameFr,
        brand: food.brand,
        imageUrl: food.imageUrl,
        macrosPer100g: food.macrosPer100g,
        units: unitsForFood(food),
        defaultUnit: food.defaultUnit,
        nutritionBasis: food.nutritionBasis || 'reference',
        provider: food.provider || 'catalog',
      },
    });
  } catch (e: unknown) {
    return res.status(502).json({ found: false, message: 'Recherche produit indisponible. Ajoute-le manuellement.' });
  }
});

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
