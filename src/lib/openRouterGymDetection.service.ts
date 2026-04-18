/**
 * Gym presence detection via OpenRouter API.
 * Gemma-safe: no system/developer messages — all instructions in a single user message.
 * Fallback chain + 429 retry + safe JSON parsing. Never throws; returns safe result if all models fail.
 *
 * Caller (gymVerify.ts) is expected to fall back to the local CLIP/MobileNet
 * classifier when this returns `model: 'none'` so production never breaks when
 * OpenRouter free-tier model IDs rotate or rate-limit.
 */

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

/**
 * Free vision models — tried in order until one succeeds.
 * Override at runtime with OPENROUTER_GYM_MODELS_JSON=["provider/model:free", ...].
 *
 * This list MIRRORS the meal-scan service (mealScanOpenRouter.service.ts) on
 * purpose: those are the exact free models the DietTemple OpenRouter account
 * has access to today. If meal-scan works, gym detection works. When the
 * free-tier IDs rotate, patch both services together (or set the env var).
 */
const DEFAULT_GYM_MODELS = [
  'google/gemma-3-4b-it:free',
  'google/gemma-3-12b-it:free',
  'google/gemma-3-27b-it:free',
  'mistralai/mistral-small-3.1-24b-instruct:free',
  'nvidia/nemotron-nano-12b-v2-vl:free',
];

function loadModels(): string[] {
  const raw = process.env.OPENROUTER_GYM_MODELS_JSON;
  if (raw) {
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.every((x) => typeof x === 'string')) return arr;
    } catch {
      /* fall through */
    }
  }
  return DEFAULT_GYM_MODELS;
}

const GYM_MODELS = loadModels();

const REQUEST_TIMEOUT_MS = parseInt(process.env.OPENROUTER_TIMEOUT_MS || '15000', 10) || 15_000;
const RETRY_DELAY_MS = 1000;
/** Max image side (px) before re-encoding for the OpenRouter payload. Keeps base64 small. */
const MAX_IMAGE_SIDE = parseInt(process.env.OPENROUTER_MAX_IMAGE_SIDE || '1024', 10) || 1024;
const JPEG_QUALITY = parseInt(process.env.OPENROUTER_JPEG_QUALITY || '80', 10) || 80;

/** Single user-message prompt (Gemma-compatible: no system/developer). */
const USER_PROMPT = `You are a scene classifier. Look at this image and decide if it shows a gym, fitness center, workout room, or weight room.

Respond with ONLY a valid JSON object, no other text or markdown. Use this exact structure:
{
  "label": "gym" | "not_gym" | "uncertain",
  "confidence": 0.0 to 1.0,
  "secondary_label": "optional second choice",
  "secondary_confidence": 0.0 to 1.0,
  "indicators": {
    "fitness_equipment_visible": true/false,
    "multiple_machines_or_weights": true/false,
    "locker_room_or_gym_layout": true/false,
    "looks_like_home_setting": true/false,
    "looks_like_office_or_shop": true/false,
    "photo_of_screen_or_printed_image": true/false
  },
  "reasonCode": "no_equipment" | "too_dark" | "screenshot_suspected" | "not_a_gym" | "gym_confirmed" | "uncertain_scene",
  "reason": "short explanation in English",
  "tips": ["conseil en français pour aider l'utilisateur à reprendre une meilleure photo", "conseil optionnel 2"]
}
Rules:
- Use reasonCode "gym_confirmed" when label is "gym".
- Use reasonCode "no_equipment" when you see a room but no fitness equipment.
- Use reasonCode "too_dark" when the image is very dark or poorly lit.
- Use reasonCode "screenshot_suspected" when the image looks like a screenshot or photo of a screen.
- Use reasonCode "not_a_gym" when it is clearly not a gym (office, home, outdoor, food, etc.).
- Use reasonCode "uncertain_scene" when unclear.
- tips must be in French and help the user take a better photo. 1-2 short tips maximum.
- If the image is unclear or you are not sure, use label "uncertain" and lower confidence.`;

export interface ClassificationLabel {
  label: string;
  score: number;
}

export interface ModelResponseItem {
  content: string;
  fullResponse?: unknown;
  error?: string;
  statusCode?: number;
}

export interface OpenRouterGymResult {
  topPrediction: string;
  confidence: number;
  labels: ClassificationLabel[];
  topPredictions: ClassificationLabel[];
  model: string;
  modelResponses?: Record<string, ModelResponseItem>;
  /** AI-provided reason code for rejection/acceptance */
  reasonCode?: string;
  /** AI-provided tips in French for the user */
  tips?: string[];
}

const GYM_REASON_CODES = ['no_equipment', 'too_dark', 'screenshot_suspected', 'not_a_gym', 'gym_confirmed', 'uncertain_scene'] as const;
type GymReasonCode = (typeof GYM_REASON_CODES)[number];

interface ParsedClassifierResponse {
  label: 'gym' | 'not_gym' | 'uncertain';
  confidence: number;
  secondary_label?: string;
  secondary_confidence?: number;
  reasonCode?: GymReasonCode;
  reason?: string;
  tips?: string[];
}

const GYM_LABELS = ['gym interior', 'fitness center', 'workout room', 'weight room'];

/**
 * Downscale + re-encode to JPEG to keep the base64 payload small.
 * Free-tier models often reject multi-MB images; a ~1024px JPEG is plenty for scene classification.
 */
async function getBase64DataUrl(imagePath: string): Promise<string> {
  try {
    const meta = await sharp(imagePath).metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    const maxSide = Math.max(w, h);
    let pipeline = sharp(imagePath).rotate();
    if (maxSide > MAX_IMAGE_SIDE) {
      pipeline = pipeline.resize({ width: MAX_IMAGE_SIDE, height: MAX_IMAGE_SIDE, fit: 'inside' });
    }
    const buffer = await pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer();
    return `data:image/jpeg;base64,${buffer.toString('base64')}`;
  } catch {
    const ext = path.extname(imagePath).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    const buffer = fs.readFileSync(imagePath);
    return `data:${mime};base64,${buffer.toString('base64')}`;
  }
}

/** Sleep for ms + random jitter (0–30% of ms). */
function sleepWithJitter(ms: number): Promise<void> {
  const jitter = Math.floor(ms * 0.3 * Math.random());
  return new Promise((resolve) => setTimeout(resolve, ms + jitter));
}

/**
 * Safe JSON parse: strip markdown code fences if present, extract JSON object, parse.
 * Returns null on any failure (no throw).
 */
function safeParseJson<T = Record<string, unknown>>(raw: string): T | null {
  if (!raw || typeof raw !== 'string') return null;
  let text = raw.trim();
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) text = fenceMatch[1].trim();
  const objectMatch = text.match(/\{[\s\S]*\}/);
  if (!objectMatch) return null;
  try {
    return JSON.parse(objectMatch[0]) as T;
  } catch {
    return null;
  }
}

/** Parse and normalize classifier response. Returns null if invalid. */
function parseClassifierResponse(text: string): ParsedClassifierResponse | null {
  const parsed = safeParseJson<Record<string, unknown>>(text);
  if (!parsed || typeof parsed.label !== 'string') return null;
  const label = parsed.label.toLowerCase().trim();
  if (!['gym', 'not_gym', 'uncertain'].includes(label)) return null;
  let confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0.5;
  confidence = Math.max(0, Math.min(1, Number(confidence)));
  const secondary_label = typeof parsed.secondary_label === 'string' ? parsed.secondary_label.trim() : undefined;
  let secondary_confidence = typeof parsed.secondary_confidence === 'number' ? parsed.secondary_confidence : undefined;
  if (secondary_confidence != null) secondary_confidence = Math.max(0, Math.min(1, secondary_confidence));
  const reason = typeof parsed.reason === 'string' ? parsed.reason.trim() : undefined;
  const rawCode = typeof parsed.reasonCode === 'string' ? parsed.reasonCode.trim() : undefined;
  const reasonCode = rawCode && GYM_REASON_CODES.includes(rawCode as GymReasonCode) ? (rawCode as GymReasonCode) : undefined;
  const tips = Array.isArray(parsed.tips)
    ? (parsed.tips as unknown[]).filter((t) => typeof t === 'string' && (t as string).trim()).map((t) => (t as string).trim()).slice(0, 2)
    : undefined;
  return {
    label: label as 'gym' | 'not_gym' | 'uncertain',
    confidence,
    secondary_label: secondary_label || undefined,
    secondary_confidence,
    reasonCode,
    reason,
    tips: tips && tips.length > 0 ? tips : undefined,
  };
}

/** Build request body for a given model. */
function buildRequestBody(imageDataUrl: string, modelId: string): Record<string, unknown> {
  return {
    model: modelId,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: USER_PROMPT },
          { type: 'image_url', image_url: { url: imageDataUrl } },
        ],
      },
    ],
    max_tokens: 1024,
    temperature: 0,
  };
}

/** Sanitize error body for logging (truncate, no secrets). */
function sanitizeErrorBody(body: string): string {
  if (!body || typeof body !== 'string') return '';
  const s = body.slice(0, 400).replace(/\b(api[_-]?key|auth|token|bearer)\s*[:=]\s*["']?[\w-]+/gi, '$1=***');
  return s;
}

/**
 * Try one model once (no per-model retry — handled by the outer loop).
 */
async function callModel(imageDataUrl: string, modelId: string, requestId: string): Promise<{ success: boolean; content?: string; statusCode?: number; error?: string }> {
  const payload = buildRequestBody(imageDataUrl, modelId);
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
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const statusCode = res.status;
    const responseText = await res.text();
    console.log(`[OpenRouter] requestId=${requestId} model=${modelId} status=${statusCode} response_len=${responseText.length}`);
    if (res.ok) {
      let data: unknown;
      try { data = JSON.parse(responseText); } catch {
        return { success: false, statusCode, error: 'body_parse_failed' };
      }
      const content = (data as any)?.choices?.[0]?.message?.content?.trim() ?? '';
      if (!content) return { success: false, statusCode, error: 'empty_content' };
      return { success: true, content, statusCode };
    }
    return { success: false, statusCode, error: `HTTP ${statusCode}` };
  } catch (e: unknown) {
    clearTimeout(timeoutId);
    const msg = e instanceof Error ? e.message : String(e);
    const isTimeout = /abort|timeout/i.test(msg);
    console.warn(`[OpenRouter] requestId=${requestId} model=${modelId} ${isTimeout ? 'timeout' : 'error'} msg=${msg}`);
    return { success: false, error: isTimeout ? 'timeout' : msg };
  }
}

function buildResultFromParsed(parsed: ParsedClassifierResponse, modelId: string): OpenRouterGymResult {
  const confidence = Math.round(parsed.confidence * 100) / 100;
  let topPrediction: string;
  const topPredictions: ClassificationLabel[] = [];

  if (parsed.label === 'gym') {
    topPrediction = 'gym interior';
    topPredictions.push({ label: 'gym interior', score: confidence });
    if (parsed.secondary_label != null && parsed.secondary_confidence != null) {
      topPredictions.push({ label: parsed.secondary_label, score: Math.round(parsed.secondary_confidence * 100) / 100 });
    } else {
      topPredictions.push({ label: 'not_gym', score: Math.round((1 - confidence) * 100) / 100 });
    }
  } else if (parsed.label === 'not_gym') {
    topPrediction = parsed.secondary_label && parsed.secondary_label !== 'gym' ? parsed.secondary_label : 'unknown';
    topPredictions.push({ label: topPrediction, score: confidence });
    topPredictions.push({ label: 'gym interior', score: parsed.secondary_confidence != null ? Math.round(parsed.secondary_confidence * 100) / 100 : 0.2 });
  } else {
    topPrediction = 'uncertain';
    topPredictions.push({ label: 'uncertain', score: confidence });
    if (parsed.secondary_label) topPredictions.push({ label: parsed.secondary_label, score: parsed.secondary_confidence ?? 0 });
  }

  return {
    topPrediction,
    confidence,
    labels: topPredictions,
    topPredictions: topPredictions.slice(0, 3),
    model: modelId,
    ...(parsed.reasonCode && { reasonCode: parsed.reasonCode }),
    ...(parsed.tips && { tips: parsed.tips }),
  };
}

/** Safe result when all models fail. */
function safeResult(modelResponses: Record<string, ModelResponseItem>): OpenRouterGymResult {
  console.warn('[OpenRouter] all_models_failed returning_safe_result');
  return {
    topPrediction: 'uncertain',
    confidence: 0.2,
    labels: [],
    topPredictions: [{ label: 'uncertain', score: 0.2 }],
    model: 'none',
    modelResponses,
  };
}

/** Single pass through the model list. Returns either a successful result or null. */
async function tryModels(
  imageDataUrl: string,
  requestId: string,
  modelResponses: Record<string, ModelResponseItem>
): Promise<OpenRouterGymResult | null> {
  for (let i = 0; i < GYM_MODELS.length; i++) {
    const modelId = GYM_MODELS[i];
    const result = await callModel(imageDataUrl, modelId, requestId);

    modelResponses[modelId] = { content: result.content ?? '', error: result.error, statusCode: result.statusCode };

    if (!result.success) {
      const isRateLimit = result.statusCode === 429;
      console.warn(
        `[OpenRouter] requestId=${requestId} model=${modelId} failed status=${result.statusCode ?? 'n/a'} reason=${result.error} trying_next=${i < GYM_MODELS.length - 1}`
      );
      if (i < GYM_MODELS.length - 1) {
        await sleepWithJitter(isRateLimit ? RETRY_DELAY_MS : 400);
        continue;
      }
      return null;
    }

    const content = result.content ?? '';
    const parsed = parseClassifierResponse(content);
    if (!parsed) {
      console.warn(
        `[OpenRouter] requestId=${requestId} model=${modelId} parse_failed content_len=${content.length} preview=${content.slice(0, 200)}`
      );
      if (i < GYM_MODELS.length - 1) {
        await sleepWithJitter(400);
        continue;
      }
      return null;
    }

    const selected = buildResultFromParsed(parsed, modelId);
    console.log(
      `[OpenRouter] requestId=${requestId} model=${modelId} label=${parsed.label} confidence=${parsed.confidence} reasonCode=${parsed.reasonCode ?? 'n/a'}`
    );
    return selected;
  }
  return null;
}

/**
 * Classify image with OpenRouter. Tries each model in GYM_MODELS until one succeeds.
 * On 429 waits 1s before next model. Attempts one full retry if the first pass fails
 * (handles transient DNS/connection errors at cold start). Never throws; returns
 * `model: 'none'` if all fail, so the caller can fall back to the local CLIP model.
 */
export async function classifyGymSceneOpenRouter(imagePath: string): Promise<OpenRouterGymResult> {
  const requestId = `gym-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  if (!OPENROUTER_API_KEY) {
    console.warn(`[OpenRouter] requestId=${requestId} OPENROUTER_API_KEY missing — set it in PM2/Vercel env`);
    return safeResult({});
  }

  console.log(
    `[OpenRouter] requestId=${requestId} start models=${GYM_MODELS.length} apiKeyPrefix=${OPENROUTER_API_KEY.slice(0, 8)}… timeoutMs=${REQUEST_TIMEOUT_MS}`
  );
  const imageDataUrl = await getBase64DataUrl(imagePath);
  console.log(`[OpenRouter] requestId=${requestId} image_payload_bytes=${imageDataUrl.length}`);

  const modelResponses: Record<string, ModelResponseItem> = {};

  let attempt = await tryModels(imageDataUrl, requestId, modelResponses);
  if (attempt) return { ...attempt, modelResponses };

  // Single full retry — covers transient DNS/connection hiccups common on fresh VPS boots.
  console.warn(`[OpenRouter] requestId=${requestId} first_pass_failed retrying_after=${RETRY_DELAY_MS}ms`);
  await sleepWithJitter(RETRY_DELAY_MS);
  attempt = await tryModels(imageDataUrl, `${requestId}-r2`, modelResponses);
  if (attempt) return { ...attempt, modelResponses };

  return safeResult(modelResponses);
}

