/**
 * Gym scene classification via Groq Cloud (OpenAI-compatible chat completions + vision).
 * Same JSON contract as OpenRouter path; used as primary when GROQ_API_KEY is set.
 */

import {
  encodeGymImageDataUrl,
  parseClassifierResponse,
  classifierParsedToOpenRouterResult,
  type OpenRouterGymResult,
} from './openRouterGymDetection.service';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_GYM_MODEL = process.env.GROQ_GYM_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct';
const REQUEST_TIMEOUT_MS = parseInt(process.env.GROQ_TIMEOUT_MS || process.env.OPENROUTER_TIMEOUT_MS || '10000', 10) || 10_000;

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

function safeNone(): OpenRouterGymResult {
  return {
    topPrediction: 'uncertain',
    confidence: 0.2,
    labels: [],
    topPredictions: [{ label: 'uncertain', score: 0.2 }],
    model: 'none',
  };
}

/**
 * Classify gym image with Groq vision. Never throws; returns model: 'none' on missing key / failure.
 */
export async function classifyGymSceneGroq(imagePath: string): Promise<OpenRouterGymResult> {
  const requestId = `groq-gym-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  if (!GROQ_API_KEY) {
    console.warn(`[Groq] requestId=${requestId} GROQ_API_KEY missing`);
    return safeNone();
  }

  const imageDataUrl = await encodeGymImageDataUrl(imagePath);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_GYM_MODEL,
        temperature: 0.2,
        max_tokens: 1024,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: USER_PROMPT },
              { type: 'image_url', image_url: { url: imageDataUrl } },
            ],
          },
        ],
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const text = await res.text();
    if (!res.ok) {
      console.warn(`[Groq] requestId=${requestId} status=${res.status} body=${text.slice(0, 300)}`);
      return safeNone();
    }
    let data: { choices?: Array<{ message?: { content?: string } }> };
    try {
      data = JSON.parse(text) as typeof data;
    } catch {
      console.warn(`[Groq] requestId=${requestId} invalid JSON body`);
      return safeNone();
    }
    const content = data?.choices?.[0]?.message?.content?.trim() ?? '';
    if (!content) {
      console.warn(`[Groq] requestId=${requestId} empty content`);
      return safeNone();
    }
    const parsed = parseClassifierResponse(content);
    if (!parsed) {
      console.warn(`[Groq] requestId=${requestId} parse_failed preview=${content.slice(0, 200)}`);
      return safeNone();
    }
    const out = classifierParsedToOpenRouterResult(parsed, `groq:${GROQ_GYM_MODEL}`);
    console.log(`[Groq] requestId=${requestId} label=${parsed.label} confidence=${parsed.confidence}`);
    return out;
  } catch (e: unknown) {
    clearTimeout(timeoutId);
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[Groq] requestId=${requestId} error=${msg}`);
    return safeNone();
  }
}
