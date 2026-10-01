/**
 * Meal scan v2 pipeline:
 *   image --(AI: what / how many / rough grams)--> parse --> match against the Food database
 *   --> deterministic units, suggestions, nutrition.
 * The AI never decides nutrition values when a database record exists.
 */
import { extractJsonObject } from '../utils/jsonExtract';
import { MATCH_THRESHOLD, type RankedFood } from './foodMatcher';
import {
  GRAM_UNIT,
  ML_UNIT,
  buildSuggestions,
  macrosForGrams,
  resolvePortion,
  roundEstimate,
  sumMacros,
  unitsForFood,
  type Per100,
  type PortionSuggestion,
} from './portion';
import type { IServingUnit } from '../models/Food.model';

// ───────────────────────────── Prompt ─────────────────────────────

/** Static hints used when the database has no Tunisian dishes yet. */
const BASE_TUNISIAN_HINTS = [
  'couscous tunisien (poulet / viande / poisson / légumes)', 'ojja (merguez, fruits de mer)', 'lablabi', 'brik (œuf, thon, fromage)',
  'mlawi / mlewi', 'chapati tunisien', 'fricassé', 'bambalouni', 'makroudh', 'salade mechouia', 'slata tounsia', 'chakchouka',
  'tajine tunisien', 'kafteji', 'chorba frik', 'marqa', 'kamounia', 'spaghetti / makarouna bel salsa', 'kesra', 'tabouna', 'baguette', 'dattes', 'olives', 'harissa',
];

export function buildMealPrompt(knownDishes: string[] = []): string {
  const hints = [...new Set([...knownDishes, ...BASE_TUNISIAN_HINTS])].slice(0, 80).join(', ');
  return `You are the vision engine of DietTemple, a nutrition app used mostly by Tunisian users. Analyse this photo of food.

Rules:
- Only list food that is visibly supported by the photo. Never invent ingredients.
- Prioritise Tunisian cuisine. Known Tunisian foods/dishes (not exhaustive): ${hints}. Use the Tunisian/French name when it fits (e.g. "Couscous tunisien au poulet", "Brik à l'œuf", "Ojja merguez"), not a generic international name.
- If the photo shows ONE composed dish, set "isMixedDish": true and list its visible "components" (e.g. couscous, chicken, chickpeas, carrots, potatoes, sauce) with a rough weight each. If you cannot reliably tell the components apart, keep isMixedDish true but leave "components" empty and estimate the whole dish.
- If the photo shows several separate foods (a full plate, a breakfast), return one item per food.
- Choose the most NATURAL unit for each item: "piece" for countable foods (eggs, banana, apple, dates, brik, bread slice -> "slice"), "plate"/"bowl"/"serving" for cooked dishes, "glass"/"cup"/"ml" for drinks, "can" for tinned fish, "scoop" for powders, "g" only when nothing else makes sense (e.g. a piece of meat).
- "quantity" is the count in that unit (e.g. 2 eggs -> unit "piece", quantity 2). "estimatedGrams" is the edible weight of the WHOLE item. It is a visual ESTIMATE, never a measurement: do not pretend precision.
- "confidence" is 0..1 for the identification. Be honest: use < 0.5 if unsure, and give up to 3 "alternatives" (other plausible names).
- Add "nutritionEstimatePer100g" ONLY as a fallback for foods you are unsure exist in a standard food table (typical values per 100 g).
- If the image is blurry, dark, shows no food, or an empty plate, set "imageQuality" accordingly ("poor" or "not_food") and return fewer or no items.
- Maximum 8 items. Names in French (add the Tunisian/Arabic name in "foodNameLocal" when you know it).

Respond with a single valid JSON object, nothing else:
{
  "mealName": "short meal name or null",
  "cuisine": "Tunisian|Mediterranean|International|Unknown",
  "isTunisian": true,
  "imageQuality": "good|poor|not_food",
  "notes": "one short sentence in French about uncertainty, if any",
  "items": [{
    "foodName": "…",
    "foodNameLocal": "…or null",
    "category": "protein|carb|fat|vegetable|fruit|sauce|drink|dish|other",
    "confidence": 0.0,
    "isMixedDish": false,
    "unit": "piece|slice|plate|bowl|serving|glass|cup|can|scoop|container|ml|g",
    "quantity": 1,
    "estimatedGrams": 100,
    "alternatives": ["…"],
    "components": [{ "foodName": "…", "estimatedGrams": 100, "confidence": 0.0 }],
    "nutritionEstimatePer100g": { "kcal": 0, "protein": 0, "carbs": 0, "fat": 0 }
  }]
}`;
}

// ───────────────────────────── Parsing ─────────────────────────────

const CATEGORIES = ['protein', 'carb', 'fat', 'vegetable', 'fruit', 'sauce', 'drink', 'dish', 'other'];
const UNIT_ALIASES: Record<string, string> = {
  piece: 'piece', pieces: 'piece', 'pièce': 'piece', 'pièces': 'piece', unit: 'piece', units: 'piece', oeuf: 'piece', 'œuf': 'piece', egg: 'piece',
  slice: 'slice', slices: 'slice', tranche: 'slice', tranches: 'slice',
  plate: 'plate', assiette: 'plate', assiettes: 'plate',
  bowl: 'bowl', bol: 'bowl', bols: 'bowl',
  serving: 'serving', portion: 'serving', portions: 'serving',
  glass: 'glass', verre: 'glass', cup: 'cup', tasse: 'cup',
  can: 'can', 'boîte': 'can', boite: 'can',
  scoop: 'scoop', dosette: 'scoop',
  container: 'container', pot: 'container',
  ml: 'ml', g: 'g', gram: 'g', grams: 'g', gramme: 'g', grammes: 'g',
};

export interface AiComponent {
  foodName: string;
  estimatedGrams: number;
  confidence: number;
}
export interface AiItem {
  foodName: string;
  foodNameLocal?: string;
  category: string;
  confidence: number;
  isMixedDish: boolean;
  unit?: string;
  quantity?: number;
  estimatedGrams?: number;
  alternatives: string[];
  components: AiComponent[];
  nutritionEstimatePer100g?: Per100;
}
export interface AiMeal {
  mealName?: string;
  cuisine?: string;
  isTunisian: boolean;
  imageQuality: 'good' | 'poor' | 'not_food';
  notes: string;
  items: AiItem[];
}

const clamp = (n: unknown, min: number, max: number, fb = 0) => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fb;
};
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export function parseMealV2(content: string): AiMeal | null {
  const parsed = extractJsonObject<Record<string, any>>(content);
  if (!parsed || !Array.isArray(parsed.items)) return null;
  const items: AiItem[] = [];
  for (const raw of parsed.items.slice(0, 8)) {
    if (!raw || typeof raw !== 'object') continue;
    const foodName = str(raw.foodName ?? raw.label);
    if (!foodName) continue;
    const category = str(raw.category).toLowerCase();
    const unitKey = str(raw.unit).toLowerCase();
    const est = raw.nutritionEstimatePer100g;
    const macros: Per100 | undefined =
      est && typeof est === 'object' && [est.kcal, est.protein, est.carbs, est.fat].some((x: unknown) => Number(x) > 0)
        ? { kcal: clamp(est.kcal, 0, 900), protein: clamp(est.protein, 0, 100), carbs: clamp(est.carbs, 0, 100), fat: clamp(est.fat, 0, 100) }
        : undefined;
    items.push({
      foodName: cap(foodName),
      foodNameLocal: str(raw.foodNameLocal) || undefined,
      category: CATEGORIES.includes(category) ? category : 'other',
      confidence: clamp(raw.confidence, 0, 1, 0.6),
      isMixedDish: raw.isMixedDish === true,
      unit: UNIT_ALIASES[unitKey],
      quantity: Number(raw.quantity) > 0 ? clamp(raw.quantity, 0.25, 50) : undefined,
      estimatedGrams: Number(raw.estimatedGrams ?? raw.defaultGrams) > 0 ? clamp(raw.estimatedGrams ?? raw.defaultGrams, 5, 2000) : undefined,
      alternatives: Array.isArray(raw.alternatives) ? raw.alternatives.map(str).filter(Boolean).slice(0, 3) : [],
      components: Array.isArray(raw.components)
        ? raw.components
            .map((c: any): AiComponent => ({
              foodName: cap(str(c?.foodName ?? c?.label)),
              estimatedGrams: clamp(c?.estimatedGrams, 5, 1500, 0),
              confidence: clamp(c?.confidence, 0, 1, 0.6),
            }))
            .filter((c: AiComponent) => c.foodName && c.estimatedGrams > 0)
            .slice(0, 8)
        : [],
      nutritionEstimatePer100g: macros,
    });
  }
  const q = str(parsed.imageQuality);
  return {
    mealName: str(parsed.mealName) || undefined,
    cuisine: str(parsed.cuisine) || undefined,
    isTunisian: parsed.isTunisian === true || /tunis/i.test(str(parsed.cuisine)),
    imageQuality: q === 'poor' || q === 'not_food' ? q : 'good',
    notes: str(parsed.notes),
    items,
  };
}

// ───────────────────────────── Enrichment ─────────────────────────────

export type NutritionSource = 'database' | 'ai_estimate' | 'none';

export interface SuggestedFoodV2 {
  foodId: string;
  name: string;
  nameLocal?: string;
  macrosPer100g?: Per100;
  units: IServingUnit[];
  defaultUnit?: string;
  portionPresets?: { small: number; medium: number; large: number };
  nutritionBasis?: 'reference' | 'estimated';
  matchScore?: number;
}

export interface ScanItemV2 {
  id: string;
  /** legacy contract (kept for older app builds) */
  label: string;
  category: string;
  confidence: number;
  defaultGrams: number;
  suggestedFoods: SuggestedFoodV2[];
  macrosPer100g?: Per100;
  /** v2 */
  labelLocal?: string;
  isDish: boolean;
  group?: string;
  nutritionSource: NutritionSource;
  nutritionBasis?: 'reference' | 'estimated';
  uncertain: boolean;
  matchScore: number;
  units: IServingUnit[];
  portion: { unit: string; quantity: number; estimatedGrams: number; approximate: true };
  suggestions: PortionSuggestion[];
  breakdown?: Array<{ label: string; estimatedGrams: number }>;
}

export interface ScanResponseV2 {
  ok: true;
  schemaVersion: 2;
  source: 'gemini';
  meal: { name?: string; cuisine?: string; isTunisian: boolean; imageQuality: string; mode: 'items' | 'dish' | 'components'; dishName?: string };
  items: ScanItemV2[];
  totals: { kcal: number; protein: number; carbs: number; fat: number; fiber: number };
  notes: string;
}

export type Lookup = (label: string) => Promise<RankedFood<any>[]>;

function toSuggested(r: RankedFood<any>): SuggestedFoodV2 {
  const f = r.food;
  return {
    foodId: String(f._id ?? ''),
    name: f.nameFr,
    ...(f.nameLocal ? { nameLocal: f.nameLocal } : {}),
    macrosPer100g: f.macrosPer100g,
    units: unitsForFood(f),
    ...(f.defaultUnit ? { defaultUnit: f.defaultUnit } : {}),
    ...(f.portionPresets ? { portionPresets: f.portionPresets } : {}),
    ...(f.nutritionBasis ? { nutritionBasis: f.nutritionBasis } : {}),
    matchScore: r.score,
  };
}

async function bestMatch(lookup: Lookup, names: string[]): Promise<RankedFood<any>[]> {
  const seen = new Map<string, RankedFood<any>>();
  for (const name of names.filter(Boolean)) {
    for (const r of await lookup(name)) {
      const key = String(r.food._id ?? r.food.nameFr);
      if (!seen.has(key) || seen.get(key)!.score < r.score) seen.set(key, r);
    }
  }
  return [...seen.values()].sort((a, b) => b.score - a.score).slice(0, 4);
}

async function enrichItem(
  ai: { foodName: string; foodNameLocal?: string; category: string; confidence: number; unit?: string; quantity?: number; estimatedGrams?: number; alternatives: string[]; nutritionEstimatePer100g?: Per100; isMixedDish?: boolean },
  id: string,
  lookup: Lookup,
  group?: string
): Promise<ScanItemV2> {
  const ranked = await bestMatch(lookup, [ai.foodName, ai.foodNameLocal || '']);
  const top = ranked[0];
  const matched = !!top && top.score >= MATCH_THRESHOLD;

  // Alternatives suggested by the AI itself, resolved against the DB so they carry real nutrition.
  if (ai.alternatives.length && ranked.length < 4) {
    for (const alt of ai.alternatives) {
      const r = (await lookup(alt))[0];
      if (r && !ranked.some((x) => String(x.food._id) === String(r.food._id))) ranked.push({ ...r, score: Math.min(r.score, 0.59) });
      if (ranked.length >= 4) break;
    }
  }

  const baseFood = matched ? top.food : undefined;
  const isDrink = ai.category === 'drink';
  const units = baseFood ? unitsForFood(baseFood) : [isDrink ? ML_UNIT : GRAM_UNIT];
  const portion = resolvePortion({ units, aiUnit: ai.unit, aiQuantity: ai.quantity, aiGrams: ai.estimatedGrams });
  const suggestions = buildSuggestions({
    units,
    unit: portion.unit,
    quantity: portion.quantity,
    estimatedGrams: portion.grams,
    portionPresets: baseFood?.portionPresets,
  });

  const per100: Per100 | undefined = baseFood?.macrosPer100g ?? ai.nutritionEstimatePer100g;
  const nutritionSource: NutritionSource = baseFood ? 'database' : ai.nutritionEstimatePer100g ? 'ai_estimate' : 'none';
  const suggestedFoods = ranked.map(toSuggested);
  if (!matched && ai.nutritionEstimatePer100g) {
    suggestedFoods.unshift({ foodId: '', name: ai.foodName, macrosPer100g: ai.nutritionEstimatePer100g, units, matchScore: 0 });
  }

  return {
    id,
    label: baseFood ? baseFood.nameFr : ai.foodName,
    category: ai.category,
    confidence: ai.confidence,
    defaultGrams: portion.grams,
    suggestedFoods,
    ...(per100 ? { macrosPer100g: per100 } : {}),
    ...(ai.foodNameLocal ? { labelLocal: ai.foodNameLocal } : {}),
    isDish: !!(baseFood?.isDish || ai.isMixedDish),
    ...(group ? { group } : {}),
    nutritionSource,
    ...(baseFood?.nutritionBasis ? { nutritionBasis: baseFood.nutritionBasis } : {}),
    uncertain: ai.confidence < 0.5 || !matched,
    matchScore: top?.score ?? 0,
    units,
    portion: { unit: portion.unit, quantity: portion.quantity, estimatedGrams: portion.grams, approximate: true },
    suggestions,
  };
}

function totalsOf(items: ScanItemV2[]) {
  return sumMacros(items.filter((i) => i.macrosPer100g).map((i) => macrosForGrams(i.portion.estimatedGrams, i.macrosPer100g as Per100)));
}

/** Builds the API response. `components` mode is used only when the breakdown is reliable. */
export async function buildScanResponse(meal: AiMeal, lookup: Lookup): Promise<ScanResponseV2> {
  const items: ScanItemV2[] = [];
  let mode: 'items' | 'dish' | 'components' = 'items';
  let dishName: string | undefined;
  let n = 0;

  for (const ai of meal.items) {
    const comps = ai.components;
    if (ai.isMixedDish && comps.length >= 2) {
      const enrichedComps = await Promise.all(
        comps.map((c, i) =>
          enrichItem(
            { foodName: c.foodName, category: 'other', confidence: c.confidence, estimatedGrams: c.estimatedGrams, alternatives: [] },
            `c${n}_${i}`,
            lookup,
            ai.foodName
          )
        )
      );
      const matchedShare = enrichedComps.filter((c) => c.nutritionSource === 'database').length / enrichedComps.length;
      if (matchedShare >= 0.7 && ai.confidence >= 0.5) {
        items.push(...enrichedComps);
        mode = 'components';
        dishName = ai.foodName;
        n++;
        continue;
      }
      // Not reliable enough: keep the whole dish (database average) and show the breakdown for information only.
      const dish = await enrichItem(ai, `i${n++}`, lookup);
      dish.breakdown = comps.map((c) => ({ label: c.foodName, estimatedGrams: roundEstimate(c.estimatedGrams) }));
      items.push(dish);
      mode = 'dish';
      dishName = ai.foodName;
      continue;
    }
    items.push(await enrichItem(ai, `i${n++}`, lookup));
  }

  let notes = meal.notes;
  if (meal.imageQuality === 'not_food' || items.length === 0) {
    notes = 'Aucun aliment détecté clairement. Réessaie avec une photo plus nette ou ajoute manuellement.';
  } else if (items.some((i) => i.uncertain)) {
    notes = notes || 'Identification incertaine pour certains aliments : vérifie ou remplace-les.';
  } else if (!notes) {
    notes = 'Détection IA terminée. Vérifie les aliments et ajuste les quantités.';
  }

  return {
    ok: true,
    schemaVersion: 2,
    source: 'gemini',
    meal: {
      name: meal.mealName || dishName,
      cuisine: meal.cuisine,
      isTunisian: meal.isTunisian,
      imageQuality: meal.imageQuality,
      mode,
      ...(dishName ? { dishName } : {}),
    },
    items,
    totals: totalsOf(items),
    notes,
  };
}
