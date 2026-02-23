/**
 * Test which OpenRouter Gemma vision models accept image input and return 200.
 * Usage: npx ts-node src/scripts/test-vision-models.ts [path/to/image.jpg]
 *   If no image path is given, uses a minimal 1x1 PNG to test API acceptance.
 * Requires OPENROUTER_API_KEY in .env (or set in shell).
 *
 * Output: which models work; use the first working as primary, second as fallback in mealScanOpenRouter.service.ts
 */
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const API_KEY = process.env.OPENROUTER_API_KEY || '';

/** Gemma vision-capable free models in quality order (best first). */
const CANDIDATE_MODELS = [
  'google/gemma-3-27b-it:free',   // Gemma 3 27B – best quality
  'google/gemma-3-12b-it:free',   // Gemma 3 12B
  'google/gemma-3-4b-it:free',    // Gemma 3 4B
  'google/gemma-3n-e4b-it:free',  // Gemma 3n 4B (efficient)
  'google/gemma-3n-e2b-it:free',  // Gemma 3n 2B (smallest)
];

/** Minimal 1x1 red pixel PNG (base64) for quick test without a file. */
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

interface TestResult {
  model: string;
  status: number;
  ok: boolean;
  hasContent: boolean;
  error?: string;
  durationMs: number;
}

async function testModel(
  model: string,
  imageDataUrl: string,
  timeoutMs: number = 15_000
): Promise<TestResult> {
  const start = Date.now();
  const body = {
    model,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: "What do you see in this image? Reply in one short sentence." },
          { type: 'image_url', image_url: { url: imageDataUrl } },
        ],
      },
    ],
    max_tokens: 100,
    temperature: 0,
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
        'HTTP-Referer': 'https://diettemple.app',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const responseText = await res.text();
    const durationMs = Date.now() - start;

    let hasContent = false;
    let error: string | undefined;
    if (res.ok) {
      try {
        const data = JSON.parse(responseText);
        const content = data?.choices?.[0]?.message?.content?.trim?.();
        hasContent = typeof content === 'string' && content.length > 0;
      } catch {
        error = 'Response not JSON';
      }
    } else {
      error = responseText.slice(0, 120).replace(/\n/g, ' ');
    }

    return {
      model,
      status: res.status,
      ok: res.ok && hasContent,
      hasContent,
      error,
      durationMs,
    };
  } catch (e: unknown) {
    const durationMs = Date.now() - start;
    const errMsg = e instanceof Error ? e.message : String(e);
    return {
      model,
      status: -1,
      ok: false,
      hasContent: false,
      error: errMsg.slice(0, 100),
      durationMs,
    };
  }
}

async function main() {
  if (!API_KEY) {
    console.error('OPENROUTER_API_KEY is not set. Add it to .env or set the env var.');
    process.exit(1);
  }

  let imageDataUrl: string;
  const imagePath = process.argv[2];
  if (imagePath) {
    const absPath = path.isAbsolute(imagePath) ? imagePath : path.resolve(process.cwd(), imagePath);
    if (!fs.existsSync(absPath)) {
      console.error('File not found:', absPath);
      process.exit(1);
    }
    const buffer = fs.readFileSync(absPath);
    const ext = path.extname(absPath).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    imageDataUrl = `data:${mime};base64,${buffer.toString('base64')}`;
    console.log('Using image:', absPath, buffer.length, 'bytes');
  } else {
    imageDataUrl = `data:image/png;base64,${TINY_PNG_BASE64}`;
    console.log('Using minimal 1x1 PNG (no image file provided). Pass a path to test with a real meal image.');
  }
  console.log('Testing', CANDIDATE_MODELS.length, 'models...\n');

  const results: TestResult[] = [];
  for (const model of CANDIDATE_MODELS) {
    const result = await testModel(model, imageDataUrl);
    results.push(result);
    const icon = result.ok ? '✓' : '✗';
    const statusStr = result.status >= 0 ? String(result.status) : 'err';
    console.log(`${icon} ${model}  status=${statusStr}  ${result.durationMs}ms  ${result.error || (result.hasContent ? 'OK' : 'empty')}`);
    // Small delay to avoid bursting
    await new Promise((r) => setTimeout(r, 400));
  }

  const working = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);

  console.log('\n--- Summary ---');
  console.log('Working:', working.length);
  if (working.length > 0) {
    console.log('\nUse in mealScanOpenRouter.service.ts MEAL_MODELS (primary first, then fallbacks):');
    console.log(
      'const MEAL_MODELS = [\n  ' +
        working.map((r) => `'${r.model}'`).join(',\n  ') +
        '\n];'
    );
  }
  if (failed.length > 0) {
    console.log('\nFailed:', failed.map((r) => `${r.model} (${r.status})`).join(', '));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
