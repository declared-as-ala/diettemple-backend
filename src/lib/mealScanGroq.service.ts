/**
 * Meal scan via Groq vision (OpenAI-compatible API).
 * Same prompt and JSON contract as mealScanOpenRouter; used first when GROQ_API_KEY is set.
 */

import {
  getMealScanImageDataUrl,
  parseMealResponse,
  MEAL_VISION_USER_PROMPT,
  type MealDetectionResult,
} from './mealScanOpenRouter.service';

import { groqPool } from './keyPool';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MEAL_MODEL =
  process.env.GROQ_MEAL_MODEL || process.env.GROQ_GYM_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct';
const REQUEST_TIMEOUT_MS =
  parseInt(process.env.GROQ_TIMEOUT_MS || process.env.OPENROUTER_TIMEOUT_MS || '14000', 10) || 14_000;

/**
 * Analyze meal image with Groq. On missing key, HTTP error, empty content, or parse failure
 * returns ok: false so the caller can fall back to OpenRouter.
 */
export async function analyzeMealWithGroq(
  imageBuffer: Buffer,
  mime: string = 'image/jpeg'
): Promise<MealDetectionResult> {
  const requestId = `meal-groq-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const apiKey = groqPool.getKey();
  if (!apiKey) {
    console.warn(`[meal-scan] requestId=${requestId} All Groq keys exhausted — skipping Groq`);
    return { ok: false, code: 'provider_error', message: 'Groq non disponible.' };
  }

  const imageDataUrl = getMealScanImageDataUrl(imageBuffer, mime);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MEAL_MODEL,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: MEAL_VISION_USER_PROMPT },
              { type: 'image_url', image_url: { url: imageDataUrl } },
            ],
          },
        ],
        max_tokens: 1500,
        temperature: 0,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const responseText = await res.text();
    console.log(
      `[meal-scan] requestId=${requestId} groq model=${GROQ_MEAL_MODEL} status=${res.status} len=${responseText.length}`
    );

    if (!res.ok) {
      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get('retry-after') ?? '60', 10) * 1000;
        groqPool.markRateLimited(apiKey, retryAfter);
      }
      console.warn(`[meal-scan] requestId=${requestId} groq http_error status=${res.status} body=${responseText.slice(0, 240)}`);
      return { ok: false, code: 'provider_error', message: 'Analyse Groq indisponible.' };
    }

    let data: { choices?: Array<{ message?: { content?: string } }> };
    try {
      data = JSON.parse(responseText) as typeof data;
    } catch {
      console.warn(`[meal-scan] requestId=${requestId} groq response_not_json`);
      return {
        ok: false,
        code: 'provider_error',
        message: 'Réponse Groq invalide.',
      };
    }

    const content = (data?.choices?.[0]?.message?.content ?? '').trim();
    if (!content) {
      console.warn(`[meal-scan] requestId=${requestId} groq empty_content`);
      return {
        ok: false,
        code: 'provider_error',
        message: 'Réponse Groq vide.',
      };
    }

    const parsed = parseMealResponse(content, 'groq');
    if (!parsed) {
      console.warn(`[meal-scan] requestId=${requestId} groq parse_error preview=${content.slice(0, 400)}`);
      return {
        ok: false,
        code: 'parse_error',
        message: 'Analyse Groq: JSON illisible.',
      };
    }

    console.log(
      `[meal-scan] requestId=${requestId} groq success items=${parsed.items.length} labels=${parsed.items.map((i) => i.label).join(',')}`
    );
    return parsed;
  } catch (e: unknown) {
    clearTimeout(timeoutId);
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[meal-scan] requestId=${requestId} groq error=${msg}`);
    return {
      ok: false,
      code: 'provider_error',
      message: 'Erreur réseau ou timeout Groq.',
    };
  }
}
