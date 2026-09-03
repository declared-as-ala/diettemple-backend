/**
 * Meal scan helpers backed by the shared Gemini vision provider.
 * searchSuggestedFoods maps AI labels to Foods DB for macros.
 */
import Food from '../models/Food.model';

export interface MealScanItem {
  label: string;
  category: string;
  confidence: number;
  defaultGrams: number;
}

/**
 * Legacy script entry point: base64 → validate → Gemini → items/notes.
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
  const { analyzeMealWithGemini } = await import('./geminiVision.service');
  const result = await analyzeMealWithGemini(imageBuffer, validation.mime);
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
