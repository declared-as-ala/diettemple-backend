/**
 * Shared Gemini vision provider for meal analysis and gym-scene verification.
 * The API key is read only from GEMINI_API_KEY on the server.
 */

import fs from 'fs';
import sharp from 'sharp';
import { extractJsonObject } from '../utils/jsonExtract';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
// Ordered model chain. The 2.5 family is "no longer available to new users" (Google), so it is not used.
// GEMINI_MODELS="a,b" overrides; GEMINI_MODEL (single) is still honoured as the first entry.
const GEMINI_MODELS: string[] = (
  process.env.GEMINI_MODELS ||
  [process.env.GEMINI_MODEL, 'gemini-3.1-flash-lite', 'gemini-3.5-flash'].filter(Boolean).join(',')
)
  .split(',')
  .map((m) => m.trim())
  .filter((m, i, all) => m && all.indexOf(m) === i);
const GEMINI_MODEL = GEMINI_MODELS[0];
const REQUEST_TIMEOUT_MS = parseInt(process.env.GEMINI_TIMEOUT_MS || '15000', 10) || 15_000;
/** Gym check-in has an automatic fallback now, so never make the client wait long for the AI. */
const GYM_TIMEOUT_MS = parseInt(process.env.GEMINI_GYM_TIMEOUT_MS || '7000', 10) || 7_000;
/** If the first model has not answered after this long, ask the next model too and take whoever answers first. */
const HEDGE_AFTER_MS = parseInt(process.env.GEMINI_HEDGE_AFTER_MS || '3000', 10) || 3_000;
const MAX_IMAGE_SIDE = parseInt(process.env.GEMINI_MAX_IMAGE_SIDE || '768', 10) || 768;
const JPEG_QUALITY = parseInt(process.env.GEMINI_JPEG_QUALITY || '80', 10) || 80;
const geminiUrl = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

const CATEGORIES = ['protein', 'carb', 'fat', 'vegetable', 'fruit', 'sauce', 'drink', 'other'] as const;
const GYM_REASON_CODES = ['no_equipment', 'too_dark', 'screenshot_suspected', 'not_a_gym', 'gym_confirmed', 'uncertain_scene'] as const;

export interface MealDetectionItem {
  label: string;
  confidence: number;
  category: string;
  defaultGrams: number;
  macrosPer100g?: { kcal: number; protein: number; carbs: number; fat: number };
}

export interface MealDetectionSuccess {
  ok: true;
  source: 'gemini';
  items: MealDetectionItem[];
  notes: string;
}

export interface MealDetectionFailure {
  ok: false;
  code: 'provider_error' | 'parse_error';
  message: string;
}

export type MealDetectionResult = MealDetectionSuccess | MealDetectionFailure;

export interface GeminiGymResult {
  topPrediction: string;
  confidence: number;
  labels: Array<{ label: string; score: number }>;
  topPredictions: Array<{ label: string; score: number }>;
  model: string;
  reasonCode?: string;
  tips?: string[];
}

const MEAL_PROMPT = `Analyse cette photo de repas et liste uniquement les aliments réellement visibles.
Réponds uniquement avec un objet JSON valide suivant cette structure :
{
  "items": [{
    "label": "nom de l'aliment en français",
    "confidence": 0.0,
    "category": "protein|carb|fat|vegetable|fruit|sauce|drink|other",
    "defaultGrams": 100,
    "macrosPer100g": { "kcal": 0, "protein": 0, "carbs": 0, "fat": 0 }
  }],
  "notes": "courte phrase en français"
}
Règles : 1 à 8 aliments maximum, quantités entre 20 et 500 g, macros typiques pour 100 g. Si la photo ne montre pas clairement un repas, retourne items: []. N'invente aucun aliment.`;

const GYM_PROMPT = `Classify this image as a gym scene, not a gym scene, or uncertain.
Respond only with a valid JSON object using this structure:
{
  "label": "gym|not_gym|uncertain",
  "confidence": 0.0,
  "secondary_label": "optional second choice",
  "secondary_confidence": 0.0,
  "reasonCode": "no_equipment|too_dark|screenshot_suspected|not_a_gym|gym_confirmed|uncertain_scene",
  "reason": "short explanation",
  "tips": ["conseil court en français", "conseil optionnel en français"]
}
A gym must visibly contain fitness equipment or an unmistakable fitness-center layout. Use gym_confirmed only for label gym. If unclear, use uncertain with lower confidence.`;

function clamp(n: unknown, min: number, max: number, fallback = 0): number {
  const value = Number(n);
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

function safeNone(): GeminiGymResult {
  return {
    topPrediction: 'uncertain',
    confidence: 0.2,
    labels: [],
    topPredictions: [{ label: 'uncertain', score: 0.2 }],
    model: 'none',
  };
}

interface VisionOpts {
  maxOutputTokens?: number;
  timeoutMs?: number;
  hedgeAfterMs?: number;
}

/** One request to one model. Returns the text, or null on any failure (logged). */
async function requestOnce(
  model: string,
  prompt: string,
  base64: string,
  mime: string,
  maxOutputTokens: number,
  signal: AbortSignal,
  requestId: string
): Promise<string | null> {
  try {
    const response = await fetch(geminiUrl(model), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType: mime, data: base64 } }] }],
        generationConfig: { temperature: 0, maxOutputTokens, responseMimeType: 'application/json' },
      }),
      signal,
    });
    const responseText = await response.text();
    if (!response.ok) {
      console.warn(`[gemini-vision] requestId=${requestId} model=${model} status=${response.status}`);
      return null;
    }
    let data: { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    try {
      data = JSON.parse(responseText) as typeof data;
    } catch {
      console.warn(`[gemini-vision] requestId=${requestId} model=${model} response_not_json`);
      return null;
    }
    const content = data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('').trim() || '';
    if (!content) {
      console.warn(`[gemini-vision] requestId=${requestId} model=${model} empty_content`);
      return null;
    }
    return content;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (!signal.aborted) console.warn(`[gemini-vision] requestId=${requestId} model=${model} ${/abort|timeout/i.test(message) ? 'timeout' : 'request_failed'}`);
    return null;
  }
}

/**
 * Fast + resilient: asks the first model; if it fails it moves to the next at once, and if it is merely SLOW
 * (> hedgeAfterMs) it asks the next model in parallel. The first good answer wins and the rest are cancelled.
 * Hard overall deadline = timeoutMs.
 */
async function callGeminiVision(
  prompt: string,
  buffer: Buffer,
  mime: string,
  opts: VisionOpts = {}
): Promise<{ content: string; model: string } | null> {
  const requestId = `gemini-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  if (!GEMINI_API_KEY) {
    console.warn(`[gemini-vision] requestId=${requestId} GEMINI_API_KEY missing`);
    return null;
  }
  const totalMs = opts.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const hedgeMs = opts.hedgeAfterMs ?? HEDGE_AFTER_MS;
  const maxOutputTokens = opts.maxOutputTokens ?? 2048;
  const base64 = buffer.toString('base64');
  const startedAt = Date.now();

  return new Promise((resolve) => {
    const controllers: AbortController[] = [];
    let settled = false;
    let started = 0;
    let failed = 0;
    let hedgeTimer: ReturnType<typeof setTimeout> | undefined;

    const finish = (value: { content: string; model: string } | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      if (hedgeTimer) clearTimeout(hedgeTimer);
      controllers.forEach((c) => c.abort());
      if (value) console.log(`[gemini-vision] requestId=${requestId} model=${value.model} ok in ${Date.now() - startedAt}ms`);
      else console.warn(`[gemini-vision] requestId=${requestId} no answer after ${Date.now() - startedAt}ms`);
      resolve(value);
    };
    const deadline = setTimeout(() => finish(null), totalMs);

    const startNext = () => {
      if (settled || started >= GEMINI_MODELS.length) return;
      if (hedgeTimer) clearTimeout(hedgeTimer);
      const model = GEMINI_MODELS[started++];
      const ac = new AbortController();
      controllers.push(ac);
      void requestOnce(model, prompt, base64, mime, maxOutputTokens, ac.signal, requestId).then((content) => {
        if (content) return finish({ content, model });
        failed += 1;
        if (failed >= GEMINI_MODELS.length) finish(null);
        else startNext(); // this one failed: try the next model immediately
      });
      if (started < GEMINI_MODELS.length) hedgeTimer = setTimeout(startNext, hedgeMs);
    };
    startNext();
  });
}

function parseMacros(raw: unknown): MealDetectionItem['macrosPer100g'] {
  if (!raw || typeof raw !== 'object') return undefined;
  const value = raw as Record<string, unknown>;
  const macros = {
    kcal: clamp(value.kcal, 0, 900),
    protein: clamp(value.protein, 0, 100),
    carbs: clamp(value.carbs, 0, 100),
    fat: clamp(value.fat, 0, 100),
  };
  return Object.values(macros).some((macro) => macro > 0) ? macros : undefined;
}

function parseMealResponse(content: string): MealDetectionSuccess | null {
  const parsed = extractJsonObject<Record<string, unknown>>(content);
  if (!parsed || !Array.isArray(parsed.items)) return null;

  const items = parsed.items.slice(0, 8).flatMap((raw): MealDetectionItem[] => {
    if (!raw || typeof raw !== 'object') return [];
    const value = raw as Record<string, unknown>;
    const label = String(value.label || '').trim();
    if (!label) return [];
    const category = String(value.category || 'other').toLowerCase();
    const macrosPer100g = parseMacros(value.macrosPer100g);
    return [{
      label: label.charAt(0).toUpperCase() + label.slice(1).toLowerCase(),
      confidence: clamp(value.confidence, 0, 1, 0.7),
      category: CATEGORIES.includes(category as (typeof CATEGORIES)[number]) ? category : 'other',
      defaultGrams: Math.round(clamp(value.defaultGrams, 20, 500, 100)),
      ...(macrosPer100g && { macrosPer100g }),
    }];
  });

  return {
    ok: true,
    source: 'gemini',
    items,
    notes: typeof parsed.notes === 'string' && parsed.notes.trim()
      ? parsed.notes.trim()
      : 'Détection IA terminée. Vérifie les aliments et les quantités avant validation.',
  };
}

export async function analyzeMealWithGemini(imageBuffer: Buffer, mime = 'image/jpeg'): Promise<MealDetectionResult> {
  const normalizedMime = ['image/png', 'image/webp'].includes(mime) ? mime : 'image/jpeg';
  const answer = await callGeminiVision(MEAL_PROMPT, imageBuffer, normalizedMime, { timeoutMs: MEAL_V2_TIMEOUT_MS, hedgeAfterMs: MEAL_HEDGE_AFTER_MS });
  const content = answer?.content;
  if (!content) {
    return { ok: false, code: 'provider_error', message: 'Analyse IA indisponible pour le moment. Tu peux ajouter les aliments manuellement.' };
  }
  const parsed = parseMealResponse(content);
  return parsed || { ok: false, code: 'parse_error', message: 'Réponse IA illisible. Réessaie ou ajoute les aliments manuellement.' };
}

// Must stay BELOW the server's REQUEST_BUDGET_MS (25 s) or the request is cut off with a 503 first.
const MEAL_V2_TIMEOUT_MS = parseInt(process.env.GEMINI_MEAL_TIMEOUT_MS || '21000', 10) || 21_000;
const MEAL_HEDGE_AFTER_MS = parseInt(process.env.GEMINI_MEAL_HEDGE_AFTER_MS || '7000', 10) || 7_000;

/** Meal analysis v2: structured JSON (dish/ingredients, natural unit, estimate). Nutrition is NOT taken from the model. */
export async function analyzeMealV2(
  imageBuffer: Buffer,
  mime = 'image/jpeg',
  knownDishes: string[] = []
): Promise<{ ok: true; meal: import('./mealScanPipeline').AiMeal } | MealDetectionFailure> {
  const { buildMealPrompt, parseMealV2 } = await import('./mealScanPipeline');
  const normalizedMime = ['image/png', 'image/webp'].includes(mime) ? mime : 'image/jpeg';
  const answer = await callGeminiVision(buildMealPrompt(knownDishes), imageBuffer, normalizedMime, {
    maxOutputTokens: 4096,
    timeoutMs: MEAL_V2_TIMEOUT_MS,
    hedgeAfterMs: MEAL_HEDGE_AFTER_MS,
  });
  const content = answer?.content;
  if (!content) {
    return { ok: false, code: 'provider_error', message: 'Analyse IA indisponible pour le moment. Tu peux ajouter les aliments manuellement.' };
  }
  const meal = parseMealV2(content);
  return meal ? { ok: true, meal } : { ok: false, code: 'parse_error', message: 'Réponse IA illisible. Réessaie ou ajoute les aliments manuellement.' };
}

async function prepareGymImage(imagePath: string): Promise<Buffer> {
  try {
    return await sharp(imagePath)
      .rotate()
      .resize({ width: MAX_IMAGE_SIDE, height: MAX_IMAGE_SIDE, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toBuffer();
  } catch {
    return fs.readFileSync(imagePath);
  }
}

export async function classifyGymSceneGemini(imagePath: string): Promise<GeminiGymResult> {
  const buffer = await prepareGymImage(imagePath);
  const answer = await callGeminiVision(GYM_PROMPT, buffer, 'image/jpeg', { maxOutputTokens: 256, timeoutMs: GYM_TIMEOUT_MS });
  const content = answer?.content;
  if (!content) return safeNone();

  const parsed = extractJsonObject<Record<string, unknown>>(content);
  const rawLabel = String(parsed?.label || '').toLowerCase().trim();
  if (!parsed || !['gym', 'not_gym', 'uncertain'].includes(rawLabel)) return safeNone();

  const confidence = Math.round(clamp(parsed.confidence, 0, 1, 0.5) * 100) / 100;
  const secondaryLabel = typeof parsed.secondary_label === 'string' ? parsed.secondary_label.trim() : '';
  const secondaryConfidence = Math.round(clamp(parsed.secondary_confidence, 0, 1, 1 - confidence) * 100) / 100;
  const topPrediction = rawLabel === 'gym'
    ? 'gym interior'
    : rawLabel === 'not_gym'
      ? (secondaryLabel && secondaryLabel !== 'gym' ? secondaryLabel : 'not_gym')
      : 'uncertain';
  const topPredictions = [
    { label: topPrediction, score: confidence },
    { label: rawLabel === 'gym' ? 'not_gym' : 'gym interior', score: secondaryConfidence },
  ];
  const rawReasonCode = typeof parsed.reasonCode === 'string' ? parsed.reasonCode : '';
  const reasonCode = GYM_REASON_CODES.includes(rawReasonCode as (typeof GYM_REASON_CODES)[number]) ? rawReasonCode : undefined;
  const tips = Array.isArray(parsed.tips)
    ? parsed.tips.filter((tip): tip is string => typeof tip === 'string' && Boolean(tip.trim())).map((tip) => tip.trim()).slice(0, 2)
    : undefined;

  return {
    topPrediction,
    confidence,
    labels: topPredictions,
    topPredictions,
    model: `gemini:${answer?.model ?? GEMINI_MODEL}`,
    ...(reasonCode && { reasonCode }),
    ...(tips?.length && { tips }),
  };
}
