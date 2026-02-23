/**
 * Client for the local vision microservice (FastAPI).
 * Same service can expose /vision/gym-score and /vision/meal-detect.
 * No OpenRouter for these flows.
 */

const VISION_SERVICE_URL = process.env.VISION_SERVICE_URL || '';
const VISION_TIMEOUT_MS = Number(process.env.VISION_TIMEOUT_MS) || 15000;

export interface MealDetectItem {
  label: string;
  category: string;
  confidence: number;
  defaultGrams: number;
  suggestedFoods?: Array<{ foodId?: string; name: string; macrosPer100g?: { kcal: number; protein: number; carbs: number; fat: number } }>;
}

export interface MealDetectResponse {
  items: MealDetectItem[];
  notes: string;
  lowConfidence?: boolean;
}

/**
 * Call local vision service POST /vision/meal-detect with image base64.
 * Returns parsed response or null if service unavailable / error.
 */
export async function mealDetectFromLocalVision(imageBase64: string): Promise<MealDetectResponse | null> {
  const base = (VISION_SERVICE_URL || '').replace(/\/$/, '');
  if (!base) {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[local-vision] VISION_SERVICE_URL not set, skipping meal-detect');
    }
    return null;
  }
  const url = `${base}/vision/meal-detect`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VISION_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64 }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      console.warn('[local-vision] meal-detect non-OK', res.status, await res.text().catch(() => ''));
      return null;
    }
    const data = (await res.json()) as MealDetectResponse;
    if (!data || !Array.isArray(data.items)) {
      console.warn('[local-vision] meal-detect invalid response shape');
      return null;
    }
    if (process.env.NODE_ENV !== 'production') {
      console.log('[meal-scan] local vision detected', data.items.map((i) => ({ label: i.label, confidence: i.confidence })));
    }
    return {
      items: data.items.map((i) => ({
        label: String(i?.label ?? 'Aliment').trim().toLowerCase(),
        category: String(i?.category ?? 'other').toLowerCase(),
        confidence: Math.max(0, Math.min(1, Number(i?.confidence) ?? 0.5)),
        defaultGrams: Math.max(20, Math.min(500, Number(i?.defaultGrams) ?? 100)),
        suggestedFoods: i.suggestedFoods,
      })),
      notes: data.notes || 'Détection locale. Vérifie les quantités.',
      lowConfidence: data.lowConfidence ?? data.items.some((i) => (i.confidence ?? 0) < 0.6),
    };
  } catch (e: unknown) {
    clearTimeout(timeout);
    const err = e as Error & { code?: string };
    if (err.name === 'AbortError') {
      console.warn('[local-vision] meal-detect timeout after', VISION_TIMEOUT_MS, 'ms');
    } else {
      console.warn('[local-vision] meal-detect error', err?.message || err);
    }
    return null;
  }
}
