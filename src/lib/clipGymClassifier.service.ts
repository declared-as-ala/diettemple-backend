/**
 * CLIP zero-shot image classification for gym presence verification.
 * Scene/place classification (not object detection). Singleton model load; robust errors and timeout.
 * Replaces MobileNet for better accuracy on "gym interior" vs "office", "restaurant", etc.
 * On Windows, if ONNX Runtime native DLL fails to load, falls back to legacy MobileNet (TensorFlow.js).
 */

const INFERENCE_TIMEOUT_MS = parseInt(process.env.GYM_VERIFY_INFERENCE_TIMEOUT_MS || '60000', 10) || 60000;
const MODEL_ID = process.env.GYM_VERIFY_CLIP_MODEL || 'Xenova/clip-vit-base-patch32';

/** Zero-shot labels (scene/place). Configurable via env GYM_VERIFY_LABELS_JSON for future. */
const DEFAULT_LABELS = [
  'gym interior',
  'fitness center',
  'workout room',
  'weight room',
  'home interior',
  'office',
  'restaurant',
  'outdoor street',
  'bedroom',
  'shop interior',
];

function getLabels(): string[] {
  const raw = process.env.GYM_VERIFY_LABELS_JSON;
  if (raw && typeof raw === 'string') {
    try {
      const arr = JSON.parse(raw) as unknown;
      return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : DEFAULT_LABELS;
    } catch {
      return DEFAULT_LABELS;
    }
  }
  return DEFAULT_LABELS;
}

export interface ClassificationLabel {
  label: string;
  score: number;
}

export interface ClipClassificationResult {
  topPrediction: string;
  confidence: number;
  labels: ClassificationLabel[];
  topPredictions: ClassificationLabel[];
  model: string;
}

let pipelineInstance: any = null;
let pipelinePromise: Promise<any> | null = null;
/** When true, CLIP/ONNX failed to load (e.g. Windows DLL); use legacy MobileNet for all requests. */
let useLegacyFallback = false;

function isNativeLoadError(e: any): boolean {
  const msg = e?.message ?? '';
  return /DLL|onnxruntime|dynamic link library|\.node\b|initialization routine failed/i.test(msg);
}

async function getPipeline(): Promise<any> {
  if (useLegacyFallback) return null;
  if (pipelineInstance) return pipelineInstance;
  if (pipelinePromise) return pipelinePromise;
  pipelinePromise = (async () => {
    try {
      const { pipeline } = await import('@huggingface/transformers');
      const classifier = await pipeline('zero-shot-image-classification', MODEL_ID);
      pipelineInstance = classifier;
      if (process.env.NODE_ENV !== 'production') {
        console.log('[clip-gym] Model loaded:', MODEL_ID);
      }
      return classifier;
    } catch (e: any) {
      if (isNativeLoadError(e)) {
        useLegacyFallback = true;
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[clip-gym] CLIP/ONNX unavailable (e.g. Windows DLL). Using legacy MobileNet fallback.');
        }
      }
      throw e;
    }
  })();
  return pipelinePromise;
}


function processRaw(raw: Array<{ label: string; score: number }>, modelLabel: string): ClipClassificationResult {
  if (!Array.isArray(raw) || raw.length === 0) return fallbackResult(modelLabel);
  const sorted = [...raw].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const topPredictions = sorted.slice(0, 3).map((p) => ({
    label: p.label ?? '',
    score: typeof p.score === 'number' ? Math.round(p.score * 100) / 100 : 0,
  }));
  const top = topPredictions[0];
  const topLabel = top?.label ?? 'unknown';
  const confidence = top?.score ?? 0;
  return {
    topPrediction: topLabel,
    confidence,
    labels: sorted.map((p) => ({ label: p.label ?? '', score: typeof p.score === 'number' ? Math.round(p.score * 100) / 100 : 0 })),
    topPredictions,
    model: modelLabel,
  };
}

const DECISION_THRESHOLD = parseFloat(process.env.GYM_VERIFY_THRESHOLD || '0.40');
const DECISION_MARGIN = parseFloat(process.env.GYM_VERIFY_MARGIN || '0.05');
const LEGACY_GYM_MIN_CONFIDENCE = 0.15;

/** MobileNet/ImageNet class names that indicate gym (must match legacy service list). */
const LEGACY_GYM_KEYWORDS = [
  'dumbbell', 'barbell', 'gymnastic', 'gym', 'weight', 'balance beam',
  'punching bag', 'sports', 'exercise', 'fitness',
];

function isLegacyGymLabel(label: string): boolean {
  const lower = label.toLowerCase();
  return LEGACY_GYM_KEYWORDS.some((k) => lower.includes(k));
}

/** Adapt legacy MobileNet result to ClipClassificationResult for the same API/decision layer. */
async function runLegacyFallback(imagePath: string): Promise<ClipClassificationResult> {
  const { classifyGymScene } = await import('./gymSceneClassification.service');
  const legacy = await classifyGymScene(imagePath);
  const rawTop = (legacy.labels ?? []).slice(0, 3).map((p) => ({
    label: p.label ?? '',
    score: typeof p.score === 'number' ? Math.round(p.score * 100) / 100 : 0,
  }));
  const topLabel = rawTop[0]?.label ?? 'unknown';
  const confidence = legacy.confidence ?? rawTop[0]?.score ?? 0;
  const gymRelatedInTop = rawTop.some((p) => isLegacyGymLabel(p.label));
  const treatAsGym = legacy.isGym || (confidence >= LEGACY_GYM_MIN_CONFIDENCE && gymRelatedInTop);

  let topPrediction: string;
  let topPredictions: ClassificationLabel[];
  if (treatAsGym) {
    topPrediction = 'gym interior';
    const score = Math.max(confidence, DECISION_THRESHOLD);
    topPredictions = [
      { label: 'gym interior', score },
      { label: rawTop[0]?.label ?? 'other', score: Math.min(rawTop[0]?.score ?? 0, score - DECISION_MARGIN) },
      ...rawTop.slice(1, 2).map((p) => ({ label: p.label, score: p.score })),
    ].slice(0, 3);
    return {
      topPrediction,
      confidence: score,
      labels: legacy.labels ?? [],
      topPredictions,
      model: 'mobilenet-v2-fallback',
    };
  }
  topPredictions = rawTop;
  return {
    topPrediction: topLabel,
    confidence,
    labels: legacy.labels ?? [],
    topPredictions,
    model: 'mobilenet-v2-fallback',
  };
}

/**
 * Classify image with CLIP zero-shot. Returns top predictions and gym decision inputs.
 * Caller applies threshold/margin and trustLevel in decision layer.
 * On timeout we resolve with fallback (no unhandled rejection) and clear the timer.
 * If CLIP/ONNX failed to load (e.g. Windows DLL), uses legacy MobileNet automatically.
 */
export async function classifyGymSceneClip(imagePath: string): Promise<ClipClassificationResult> {
  const labels = getLabels();
  const modelLabel = MODEL_ID;

  if (useLegacyFallback) {
    try {
      return await runLegacyFallback(imagePath);
    } catch (e: any) {
      if (process.env.NODE_ENV !== 'production') {
        console.log('[clip-gym] Legacy fallback error:', e?.message);
      }
      return fallbackResult(modelLabel);
    }
  }

  try {
    const classifier = await getPipeline();
    if (!classifier) {
      return await runLegacyFallback(imagePath);
    }
    const { RawImage } = await import('@huggingface/transformers');
    const image = await RawImage.read(imagePath);
    const runPromise = classifier(image, labels) as Promise<Array<{ label: string; score: number }>>;

    return await new Promise<ClipClassificationResult>((resolve) => {
      const timer = setTimeout(() => {
        if (process.env.NODE_ENV !== 'production') {
          console.log('[clip-gym] Classification timeout after', INFERENCE_TIMEOUT_MS, 'ms');
        }
        resolve(fallbackResult(modelLabel));
      }, INFERENCE_TIMEOUT_MS);

      runPromise
        .then((raw) => {
          clearTimeout(timer);
          resolve(processRaw(raw, modelLabel));
        })
        .catch((e: any) => {
          clearTimeout(timer);
          if (isNativeLoadError(e)) {
            useLegacyFallback = true;
            if (process.env.NODE_ENV !== 'production') {
              console.warn('[clip-gym] Switching to legacy MobileNet fallback.');
            }
            runLegacyFallback(imagePath).then(resolve).catch(() => resolve(fallbackResult(modelLabel)));
          } else {
            if (process.env.NODE_ENV !== 'production') {
              console.log('[clip-gym] Classification error:', e?.message);
            }
            resolve(fallbackResult(modelLabel));
          }
        });
    });
  } catch (e: any) {
    if (isNativeLoadError(e)) {
      useLegacyFallback = true;
      try {
        return await runLegacyFallback(imagePath);
      } catch (_) {
        return fallbackResult(modelLabel);
      }
    }
    if (process.env.NODE_ENV !== 'production') {
      console.log('[clip-gym] Classification error:', e?.message);
    }
    return fallbackResult(modelLabel);
  }
}

function fallbackResult(model: string): ClipClassificationResult {
  return {
    topPrediction: 'unknown',
    confidence: 0,
    labels: [],
    topPredictions: [],
    model,
  };
}

export { MODEL_ID as GYM_VERIFY_CLIP_MODEL };
