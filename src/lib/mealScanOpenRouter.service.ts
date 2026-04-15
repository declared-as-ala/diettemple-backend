/**
 * Meal scan via OpenRouter vision (same architecture as gym verification).
 * Timeout, retry, strict JSON prompt, robust parse. No fake fallback.
 */

import { extractJsonObject } from '../utils/jsonExtract';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
console.log('[meal-scan] API key loaded:', OPENROUTER_API_KEY ? `${OPENROUTER_API_KEY.slice(0, 12)}...` : 'MISSING');
/** Free vision-capable models on OpenRouter (primary then fallbacks). */
const MEAL_MODELS = [
  'google/gemma-3-4b-it:free',
  'google/gemma-3-12b-it:free',
  'google/gemma-3-27b-it:free',
  'mistralai/mistral-small-3.1-24b-instruct:free',
  'nvidia/nemotron-nano-12b-v2-vl:free',
];
const REQUEST_TIMEOUT_MS = 14_000;
const MAX_RETRIES_PER_MODEL = 1; // retry once within same model on timeout or 5xx

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
    const x = raw[i] as any;
    if (!x || typeof x !== 'object') continue;
    // Accept label / name / food / aliment / item / ingredient
    const label = String(x.label ?? x.name ?? x.food ?? x.aliment ?? x.item ?? x.ingredient ?? 'Aliment').trim();
    if (!label || label === 'Aliment') continue;
    // Accept defaultGrams / grams / amount / quantity / weight / portion
    const gramsRaw = x.defaultGrams ?? x.grams ?? x.amount ?? x.quantity ?? x.weight ?? x.portion ?? 100;
    // Accept macrosPer100g / macros / nutrition / nutrients / per100g
    const macrosRaw = x.macrosPer100g ?? x.macros ?? x.nutrition ?? x.nutrients ?? x.per100g ?? x.nutritionPer100g;
    const macrosPer100g = parseMacrosPer100g(macrosRaw);
    out.push({
      label: label.charAt(0).toUpperCase() + label.slice(1).toLowerCase(),
      confidence: clampConfidence(x.confidence ?? x.score ?? 0.7),
      category: normalizeCategory(x.category ?? x.type ?? x.group),
      defaultGrams: clampDefaultGrams(gramsRaw),
      ...(macrosPer100g && { macrosPer100g }),
    });
  }
  return out;
}

function parseMealResponse(content: string): MealDetectionSuccess | null {
  const parsed = extractJsonObject<Record<string, unknown>>(content);
  if (!parsed) return null;
  // Accept common aliases: items / foods / food / aliments / results
  const rawItems = parsed.items ?? parsed.foods ?? parsed.food ?? parsed.aliments ?? parsed.results ?? parsed.ingredients;
  const items = validateAndNormalizeItems(rawItems);
  // Accept common note aliases
  const rawNotes = parsed.notes ?? parsed.note ?? parsed.description ?? parsed.summary ?? parsed.remarques;
  const notes = typeof rawNotes === 'string' ? rawNotes.trim() : '';
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
 * Per-model retry (MAX_RETRIES_PER_MODEL) on timeout or 5xx, then falls to next model.
 * On 429: no per-model retry, go straight to next model.
 * Returns structured result or provider_error/parse_error (no fake data).
 */
export async function analyzeMealWithOpenRouter(
  imageBuffer: Buffer,
  mime: string = 'image/jpeg'
): Promise<MealDetectionResult> {
  const requestId = `meal-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  if (!OPENROUTER_API_KEY) {
    console.warn(`[meal-scan] requestId=${requestId} OPENROUTER_API_KEY missing`);
    return {
      ok: false,
      code: 'provider_error',
      message: 'Analyse IA indisponible pour le moment. Tu peux ajouter les aliments manuellement.',
    };
  }

  const imageDataUrl = getDataUrl(imageBuffer, mime);
  const rateLimitMessage =
    'Le service d\'analyse est temporairement surchargé. Réessaye dans une minute ou ajoute les aliments manuellement.';

  console.log(`[meal-scan] requestId=${requestId} start mime=${mime} size=${imageBuffer.length}`);

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
      max_tokens: 1500,
      temperature: 0,
    };

    const maxAttempts = MAX_RETRIES_PER_MODEL + 1;
    let lastError: string | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
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

        console.log(`[meal-scan] requestId=${requestId} model=${model} attempt=${attempt} status=${res.status} response_len=${responseText.length}`);

        if (res.ok) {
          let data: { choices?: Array<{ message?: { content?: string; reasoning?: string } }> };
          try {
            data = JSON.parse(responseText);
          } catch {
            console.warn(`[meal-scan] requestId=${requestId} model=${model} attempt=${attempt} provider_error: response not JSON`);
            lastError = 'response_not_json';
            break; // move to next model
          }
          const msg = data?.choices?.[0]?.message;
          // some models put content in reasoning field
          const content = (msg?.content ?? msg?.reasoning ?? '').trim();
          if (!content) {
            console.warn(`[meal-scan] requestId=${requestId} model=${model} attempt=${attempt} provider_error: empty content raw=${responseText.slice(0, 300)}`);
            lastError = 'empty_content';
            break; // move to next model
          }
          const parsed = parseMealResponse(content);
          if (parsed) {
            console.log(`[meal-scan] requestId=${requestId} model=${model} attempt=${attempt} success items=${parsed.items.length} labels=${parsed.items.map((i) => i.label).join(',')}`);
            return parsed;
          }
          console.warn(`[meal-scan] requestId=${requestId} model=${model} attempt=${attempt} parse_error content_len=${content.length} content_preview=${content.slice(0, 500)}`);
          return {
            ok: false,
            code: 'parse_error',
            message: 'Analyse indisponible pour le moment. Tu peux ajouter les aliments manuellement.',
          };
        }

        // 429: rate limit — wait before trying next model
        if (res.status === 429) {
          console.warn(`[meal-scan] requestId=${requestId} model=${model} attempt=${attempt} status=429 rate_limited`);
          lastError = 'rate_limit';
          if (modelIndex < MEAL_MODELS.length - 1) await sleep(2000);
          break;
        }

        // 5xx: retry within same model before falling back
        if (res.status >= 500 && res.status < 600) {
          console.warn(`[meal-scan] requestId=${requestId} model=${model} attempt=${attempt} status=${res.status} server_error body=${responseText.slice(0, 200)}`);
          lastError = `server_error_${res.status}`;
          if (attempt < maxAttempts) {
            await sleep(600);
            continue;
          }
          break; // move to next model
        }

        // Other 4xx: no retry
        console.warn(`[meal-scan] requestId=${requestId} model=${model} attempt=${attempt} status=${res.status} client_error body=${responseText.slice(0, 200)}`);
        lastError = `http_${res.status}`;
        break; // move to next model
      } catch (e: unknown) {
        clearTimeout(timeoutId);
        const errMsg = e instanceof Error ? e.message : String(e);
        const isTimeout = /abort|timeout/i.test(errMsg);
        console.warn(`[meal-scan] requestId=${requestId} model=${model} attempt=${attempt} ${isTimeout ? 'timeout' : 'error'} msg=${errMsg}`);
        lastError = isTimeout ? 'timeout' : 'network_error';
        if (isTimeout && attempt < maxAttempts) {
          // retry once more on timeout
          await sleep(500);
          continue;
        }
        break; // move to next model
      }
    }

    // Try next model if available
    if (modelIndex < MEAL_MODELS.length - 1) {
      console.log(`[meal-scan] requestId=${requestId} model=${model} failed(${lastError}) trying_next_model`);
      await sleep(1000);
      continue;
    }

    // All models exhausted
    const isRateLimit = lastError === 'rate_limit';
    const isTimeout = lastError === 'timeout';
    console.warn(`[meal-scan] requestId=${requestId} all_models_failed last_error=${lastError}`);
    return {
      ok: false,
      code: 'provider_error',
      message: isRateLimit
        ? rateLimitMessage
        : isTimeout
          ? 'La requête a pris trop de temps. Réessaye ou ajoute les aliments manuellement.'
          : 'Analyse IA indisponible pour le moment. Tu peux ajouter les aliments manuellement.',
    };
  }

  return {
    ok: false,
    code: 'provider_error',
    message: rateLimitMessage,
  };
}
