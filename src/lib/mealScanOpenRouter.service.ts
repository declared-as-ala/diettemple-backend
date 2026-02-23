/**
 * Meal scan via OpenRouter vision (same architecture as gym verification).
 * Timeout, retry, strict JSON prompt, robust parse. No fake fallback.
 */

import { extractJsonObject } from '../utils/jsonExtract';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
/** Vision models (primary then fallback). Updated from test-vision-models.ts output. */
const MEAL_MODELS = [
  'google/gemma-3-12b-it:free',
  'google/gemma-3-4b-it:free',
];
const REQUEST_TIMEOUT_MS = 14_000;

const CATEGORIES = ['protein', 'carb', 'fat', 'vegetable', 'fruit', 'sauce', 'drink', 'other'] as const;

const USER_PROMPT = `Analyse cette photo de repas. Liste les aliments visibles et pour CHAQUE aliment estime les macros nutritionnels (pour 100g).

Réponds UNIQUEMENT avec un objet JSON valide, sans texte avant ou après, sans markdown, sans \`\`\`.
Structure exacte:
{
  "items": [
    {
      "label": "nom de l'aliment en français",
      "confidence": 0.0 à 1.0,
      "category": "protein" | "carb" | "fat" | "vegetable" | "fruit" | "sauce" | "drink" | "other",
      "defaultGrams": nombre estimé en grammes (20-500),
      "macrosPer100g": {
        "kcal": nombre (calories pour 100g),
        "protein": nombre (protéines en g pour 100g),
        "carbs": nombre (glucides en g pour 100g),
        "fat": nombre (lipides en g pour 100g)
      }
    }
  ],
  "notes": "une courte phrase en français"
}

Règles:
- Entre 1 et 8 items maximum.
- Pour CHAQUE item inclus macrosPer100g: estime kcal, protein, carbs, fat pour 100g de cet aliment (valeurs typiques pour l'aliment).
- Ne pas inventer des aliments: si tu ne vois pas clairement, mets une confiance basse (< 0.6) ou ne l'inclus pas.
- Si l'image ne montre pas un repas clairement, retourne items: [] et notes explicatives.`;

export interface MealDetectionItem {
  label: string;
  confidence: number;
  category: string;
  defaultGrams: number;
  /** AI-estimated macros per 100g; used when Foods DB has no match */
  macrosPer100g?: { kcal: number; protein: number; carbs: number; fat: number };
}

export interface MealDetectionSuccess {
  ok: true;
  source: 'openrouter';
  items: MealDetectionItem[];
  notes: string;
}

export interface MealDetectionFailure {
  ok: false;
  code: 'provider_error' | 'parse_error';
  message: string;
}

export type MealDetectionResult = MealDetectionSuccess | MealDetectionFailure;

function clampConfidence(n: number): number {
  return Math.max(0, Math.min(1, Number(n)));
}

function clampDefaultGrams(n: number): number {
  return Math.max(20, Math.min(1000, Math.round(Number(n)) || 100));
}

function clampMacro(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number(n) || 0));
}

function parseMacrosPer100g(raw: unknown): { kcal: number; protein: number; carbs: number; fat: number } | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const kcal = clampMacro(o.kcal as number, 0, 900);
  const protein = clampMacro(o.protein as number, 0, 100);
  const carbs = clampMacro(o.carbs as number, 0, 100);
  const fat = clampMacro(o.fat as number, 0, 100);
  if (kcal === 0 && protein === 0 && carbs === 0 && fat === 0) return undefined;
  return { kcal, protein, carbs, fat };
}

function normalizeCategory(c: unknown): string {
  const s = String(c || 'other').toLowerCase().trim();
  return CATEGORIES.includes(s as (typeof CATEGORIES)[number]) ? s : 'other';
}

function validateAndNormalizeItems(raw: unknown): MealDetectionItem[] {
  if (!Array.isArray(raw)) return [];
  const out: MealDetectionItem[] = [];
  for (let i = 0; i < Math.min(raw.length, 8); i++) {
    const x = raw[i];
    if (!x || typeof x !== 'object') continue;
    const label = String((x as any).label ?? 'Aliment').trim();
    if (!label) continue;
    const macrosPer100g = parseMacrosPer100g((x as any).macrosPer100g);
    out.push({
      label: label.charAt(0).toUpperCase() + label.slice(1).toLowerCase(),
      confidence: clampConfidence((x as any).confidence),
      category: normalizeCategory((x as any).category),
      defaultGrams: clampDefaultGrams((x as any).defaultGrams),
      ...(macrosPer100g && { macrosPer100g }),
    });
  }
  return out;
}

function parseMealResponse(content: string): MealDetectionSuccess | null {
  const parsed = extractJsonObject<{ items?: unknown; notes?: string }>(content);
  if (!parsed) return null;
  const items = validateAndNormalizeItems(parsed.items);
  const notes = typeof parsed.notes === 'string' ? parsed.notes.trim() : 'Détection IA. Vérifie les aliments et les quantités avant validation.';
  return {
    ok: true,
    source: 'openrouter',
    items,
    notes: notes || 'Détection IA. Vérifie les aliments et les quantités avant validation.',
  };
}

function getDataUrl(buffer: Buffer, mime: string): string {
  const base64 = buffer.toString('base64');
  const m = mime === 'image/png' ? 'image/png' : mime === 'image/webp' ? 'image/webp' : 'image/jpeg';
  return `data:${m};base64,${base64}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Call OpenRouter vision for meal analysis.
 * On 429 (rate limit) or 503: tries next model in MEAL_MODELS, then returns a clear message.
 * Returns structured result or provider_error/parse_error (no fake data).
 */
export async function analyzeMealWithOpenRouter(
  imageBuffer: Buffer,
  mime: string = 'image/jpeg'
): Promise<MealDetectionResult> {
  if (!OPENROUTER_API_KEY) {
    console.warn('[meal-scan] OPENROUTER_API_KEY missing');
    return {
      ok: false,
      code: 'provider_error',
      message: 'Analyse IA indisponible pour le moment. Tu peux ajouter les aliments manuellement.',
    };
  }

  const imageDataUrl = getDataUrl(imageBuffer, mime);
  const rateLimitMessage =
    'Le service d’analyse est temporairement surchargé. Réessaye dans une minute ou ajoute les aliments manuellement.';

  for (let modelIndex = 0; modelIndex < MEAL_MODELS.length; modelIndex++) {
    const model = MEAL_MODELS[modelIndex];
    const body = {
      model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: USER_PROMPT },
            { type: 'image_url', image_url: { url: imageDataUrl } },
          ],
        },
      ],
      max_tokens: 512,
      temperature: 0,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(OPENROUTER_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'https://diettemple.app',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const responseText = await res.text();

      if (process.env.NODE_ENV !== 'production') {
        console.log('[meal-scan] OpenRouter model=', model, 'status=', res.status, 'response length=', responseText.length);
      }

      if (res.ok) {
        let data: { choices?: Array<{ message?: { content?: string } }> };
        try {
          data = JSON.parse(responseText);
        } catch {
          console.warn('[meal-scan] provider_error: response not JSON');
          continue;
        }
        const content = data?.choices?.[0]?.message?.content?.trim() ?? '';
        if (!content) {
          console.warn('[meal-scan] provider_error: empty content');
          continue;
        }
        const parsed = parseMealResponse(content);
        if (parsed) {
          console.log('[meal-scan] parsed items=', parsed.items.length, 'labels=', parsed.items.map((i) => i.label));
          return parsed;
        }
        console.warn('[meal-scan] parse_error: invalid JSON shape content_len=', content.length);
        return {
          ok: false,
          code: 'parse_error',
          message: 'Analyse indisponible pour le moment. Tu peux ajouter les aliments manuellement.',
        };
      }

      const isRateLimit = res.status === 429;
      const isServerError = res.status >= 500 && res.status < 600;
      if (isRateLimit || isServerError) {
        console.warn('[meal-scan] provider_error status=', res.status, 'body=', responseText.slice(0, 200));
        if (modelIndex < MEAL_MODELS.length - 1) {
          const delay = 600;
          console.log('[meal-scan] trying fallback model in', delay, 'ms');
          await sleep(delay);
          continue;
        }
        return {
          ok: false,
          code: 'provider_error',
          message: isRateLimit ? rateLimitMessage : 'Service temporairement indisponible. Réessaye dans un instant ou ajoute les aliments manuellement.',
        };
      }

      console.warn('[meal-scan] provider_error status=', res.status, 'body=', responseText.slice(0, 200));
      if (modelIndex < MEAL_MODELS.length - 1) {
        await sleep(400);
        continue;
      }
      return {
        ok: false,
        code: 'provider_error',
        message: 'Analyse IA indisponible pour le moment. Tu peux ajouter les aliments manuellement.',
      };
    } catch (e: unknown) {
      clearTimeout(timeoutId);
      const errMsg = e instanceof Error ? e.message : String(e);
      const isTimeout = /abort|timeout/i.test(errMsg);
      if (process.env.NODE_ENV !== 'production') {
        console.log('[meal-scan]', isTimeout ? 'timeout' : 'error', 'model=', model, 'msg=', errMsg);
      }
      if (modelIndex < MEAL_MODELS.length - 1) {
        await sleep(500);
        continue;
      }
      return {
        ok: false,
        code: 'provider_error',
        message: isTimeout ? 'La requête a pris trop de temps. Réessaye ou ajoute les aliments manuellement.' : rateLimitMessage,
      };
    }
  }

  return {
    ok: false,
    code: 'provider_error',
    message: rateLimitMessage,
  };
}
