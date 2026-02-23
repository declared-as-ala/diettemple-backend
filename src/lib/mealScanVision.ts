/**
 * Meal scan: OpenRouter vision in Node (same architecture as gym verification).
 * searchSuggestedFoods maps AI labels to Foods DB for macros.
 */
import crypto from 'crypto';
import Food from '../models/Food.model';

export interface MealScanItem {
  label: string;
  category: string;
  confidence: number;
  defaultGrams: number;
}

const FALLBACK_MEALS: MealScanItem[][] = [
  [
    { label: 'poulet grillé', category: 'protein', confidence: 0.72, defaultGrams: 150 },
    { label: 'riz', category: 'carb', confidence: 0.68, defaultGrams: 120 },
    { label: 'salade', category: 'vegetable', confidence: 0.65, defaultGrams: 80 },
  ],
  [
    { label: 'œufs', category: 'protein', confidence: 0.78, defaultGrams: 100 },
    { label: 'pain', category: 'carb', confidence: 0.7, defaultGrams: 60 },
    { label: 'avocat', category: 'fat', confidence: 0.65, defaultGrams: 50 },
  ],
  [
    { label: 'saumon', category: 'protein', confidence: 0.75, defaultGrams: 120 },
    { label: 'quinoa', category: 'carb', confidence: 0.62, defaultGrams: 100 },
    { label: 'brocoli', category: 'vegetable', confidence: 0.7, defaultGrams: 80 },
  ],
  [
    { label: 'steak', category: 'protein', confidence: 0.8, defaultGrams: 150 },
    { label: 'pâtes', category: 'carb', confidence: 0.72, defaultGrams: 120 },
    { label: 'tomates', category: 'vegetable', confidence: 0.68, defaultGrams: 60 },
  ],
  [
    { label: 'thon', category: 'protein', confidence: 0.76, defaultGrams: 100 },
    { label: 'lentilles', category: 'carb', confidence: 0.64, defaultGrams: 100 },
    { label: 'concombre', category: 'vegetable', confidence: 0.72, defaultGrams: 50 },
  ],
  [
    { label: 'tofu', category: 'protein', confidence: 0.6, defaultGrams: 120 },
    { label: 'riz complet', category: 'carb', confidence: 0.7, defaultGrams: 130 },
    { label: 'épinards', category: 'vegetable', confidence: 0.65, defaultGrams: 60 },
  ],
];

function imageHash(buffer: Buffer): number {
  const hash = crypto.createHash('sha256').update(buffer).digest();
  return hash.readUInt32BE(0);
}

/** Script-only: hash-based variable fallback when OpenRouter unavailable. API never returns fake data. */
export function getFallbackMealItems(imageBase64: string): MealScanItem[] {
  const buffer = Buffer.from(imageBase64, 'base64');
  const index = imageHash(buffer) % FALLBACK_MEALS.length;
  const set = FALLBACK_MEALS[index]!;
  console.log('[meal-scan] fallback (hash)', { index, labels: set.map((s) => s.label) });
  return set.map((s) => ({ ...s }));
}

/**
 * Legacy entry point: base64 → validate → OpenRouter → items/notes.
 * Used by scripts; main API uses analyzeMealWithOpenRouter + searchSuggestedFoods in the route.
 */
export async function detectMealWithVision(
  imageBase64: string,
  _apiKey?: string
): Promise<{ items: MealScanItem[]; notes: string; lowConfidence: boolean } | null> {
  const buffer = Buffer.from(imageBase64 || '', 'base64');
  if (buffer.length === 0) return null;
  const { validateMealImage, resizeMealImageIfNeeded } = await import('../utils/imageValidation');
  const validation = await validateMealImage(buffer, 'image/jpeg');
  if (!validation.valid) return null;
  let imageBuffer = validation.buffer;
  const resized = await resizeMealImageIfNeeded(imageBuffer, validation.mime);
  if (resized !== imageBuffer) imageBuffer = resized;
  const { analyzeMealWithOpenRouter } = await import('./mealScanOpenRouter.service');
  const result = await analyzeMealWithOpenRouter(imageBuffer, validation.mime);
  if (!result.ok) return null;
  const lowConfidence = result.items.some((i) => i.confidence < 0.6);
  return {
    items: result.items.map((i) => ({
      label: i.label,
      category: i.category,
      confidence: i.confidence,
      defaultGrams: i.defaultGrams,
    })),
    notes: result.notes,
    lowConfidence,
  };
}

export async function searchSuggestedFoods(label: string, limit: number = 5): Promise<Array<{ foodId: string; name: string; macrosPer100g: { kcal: number; protein: number; carbs: number; fat: number } }>> {
  const q = (label || '').trim().slice(0, 50);
  if (!q) return [];
  const list = await Food.find({
    $or: [
      { nameFr: new RegExp(q, 'i') },
      { synonyms: new RegExp(q, 'i') },
    ],
  })
    .select('_id nameFr macrosPer100g')
    .limit(limit)
    .lean();
  return list.map((f: any) => ({
    foodId: f._id.toString(),
    name: f.nameFr,
    macrosPer100g: f.macrosPer100g || { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  }));
}
