/**
 * Gym presence detection via OpenRouter API.
 * Gemma-safe: no system/developer messages — all instructions in a single user message.
 * Fallback chain + 429 retry + safe JSON parsing. Never throws; returns safe result if all models fail.
 */

import fs from 'fs';
import path from 'path';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_API_KEY = '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';

/** Single model that works reliably (Gemma 3 12B; no system/developer messages). */
const OPENROUTER_MODEL_ID = 'google/gemma-3-12b-it:free';

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RETRIES_429 = 2;
const RETRY_DELAY_BASE_MS = 800;
const RETRY_DELAY_SECOND_MS = 1500;

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
  "reason": "short explanation"
}
If the image is unclear or you are not sure, use label "uncertain" and lower confidence.`;

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
}

interface ParsedClassifierResponse {
  label: 'gym' | 'not_gym' | 'uncertain';
  confidence: number;
  secondary_label?: string;
  secondary_confidence?: number;
  reason?: string;
}

const GYM_LABELS = ['gym interior', 'fitness center', 'workout room', 'weight room'];

function getBase64DataUrl(imagePath: string): string {
  const ext = path.extname(imagePath).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  const buffer = fs.readFileSync(imagePath);
  const base64 = buffer.toString('base64');
  return `data:${mime};base64,${base64}`;
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
  return {
    label: label as 'gym' | 'not_gym' | 'uncertain',
    confidence,
    secondary_label: secondary_label || undefined,
    secondary_confidence,
    reason,
  };
}

/** Build Gemma-safe request body: only user message, no system/developer, no response_format. */
function buildRequestBody(imageDataUrl: string): Record<string, unknown> {
  return {
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
}

/** Sanitize error body for logging (truncate, no secrets). */
function sanitizeErrorBody(body: string): string {
  if (!body || typeof body !== 'string') return '';
  const s = body.slice(0, 400).replace(/\b(api[_-]?key|auth|token|bearer)\s*[:=]\s*["']?[\w-]+/gi, '$1=***');
  return s;
}

interface CallResult {
  success: boolean;
  modelId: string;
  content?: string;
  fullResponse?: unknown;
  statusCode?: number;
  errorBody?: string;
  error?: string;
}

/**
 * Call the configured model with timeout and 429 retry (exponential backoff + jitter).
 */
async function callModel(imageDataUrl: string): Promise<CallResult> {
  const modelId = OPENROUTER_MODEL_ID;
  const body = buildRequestBody(imageDataUrl);
  const payload = { ...body, model: modelId };

  for (let attempt = 1; attempt <= MAX_RETRIES_429 + 1; attempt++) {
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

      if (res.ok) {
        let data: unknown;
        try {
          data = JSON.parse(responseText);
        } catch {
          console.warn(`[OpenRouter] model=${modelId} attempt=${attempt} status=${statusCode} body_parse_failed`);
          return { success: false, modelId, statusCode, error: 'Invalid JSON response', errorBody: responseText.slice(0, 200) };
        }
        const content = (data as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]?.message?.content ?? '';
        console.log(`[OpenRouter] model=${modelId} attempt=${attempt} status=${statusCode} success`);
        return { success: true, modelId, content, fullResponse: data, statusCode };
      }

      if (statusCode === 429 && attempt <= MAX_RETRIES_429) {
        const delayMs = attempt === 1 ? RETRY_DELAY_BASE_MS : RETRY_DELAY_SECOND_MS;
        console.warn(`[OpenRouter] model=${modelId} attempt=${attempt} status=429 rate_limited retry_in_ms=${delayMs}`);
        await sleepWithJitter(delayMs);
        continue;
      }

      const sanitized = sanitizeErrorBody(responseText);
      console.warn(`[OpenRouter] model=${modelId} attempt=${attempt} status=${statusCode} error_body=${sanitized}`);
      return { success: false, modelId, statusCode, error: `HTTP ${statusCode}`, errorBody: responseText.slice(0, 300) };
    } catch (e: unknown) {
      clearTimeout(timeoutId);
      const errMsg = e instanceof Error ? e.message : String(e);
      const isTimeout = /abort|timeout/i.test(errMsg);
      console.warn(`[OpenRouter] model=${modelId} attempt=${attempt} ${isTimeout ? 'timeout' : 'error'} msg=${errMsg}`);
      if (attempt <= MAX_RETRIES_429) {
        const delayMs = attempt === 1 ? RETRY_DELAY_BASE_MS : RETRY_DELAY_SECOND_MS;
        await sleepWithJitter(delayMs);
        continue;
      }
      return { success: false, modelId, error: errMsg };
    }
  }

  return { success: false, modelId, error: 'Max retries exceeded' };
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

/**
 * Classify image with OpenRouter (single model: Gemma 3 12B). Retries on 429.
 * On failure or parse error, returns safe result (never throw).
 */
export async function classifyGymSceneOpenRouter(imagePath: string): Promise<OpenRouterGymResult> {
  const imageDataUrl = getBase64DataUrl(imagePath);
  const modelId = OPENROUTER_MODEL_ID;
  const result = await callModel(imageDataUrl);

  const modelResponses: Record<string, ModelResponseItem> = {
    [modelId]: {
      content: result.content ?? '',
      fullResponse: result.fullResponse,
      error: result.error,
      statusCode: result.statusCode,
    },
  };

  if (!result.success) {
    console.warn(`[OpenRouter] model=${modelId} failed reason=${result.error ?? result.statusCode}`);
    return safeResult(modelResponses);
  }

  const content = result.content ?? '';
  const parsed = parseClassifierResponse(content);
  if (!parsed) {
    console.warn(`[OpenRouter] model=${modelId} parse_failed content_len=${content.length}`);
    return safeResult(modelResponses);
  }

  const selected = buildResultFromParsed(parsed, modelId);
  console.log(`[OpenRouter] model=${modelId} label=${parsed.label} confidence=${parsed.confidence}`);
  return { ...selected, modelResponses };
}

export { OPENROUTER_MODEL_ID };
