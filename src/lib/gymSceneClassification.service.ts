/**
 * Gym scene classification — pure Node.js (TensorFlow.js + MobileNet, no native addons).
 * No Python; no external vision service. Uses sharp to load images and @tensorflow/tfjs (CPU) for inference.
 */
import sharp from 'sharp';

const GYM_VERIFY_THRESHOLD = parseFloat(process.env.GYM_VERIFY_THRESHOLD || '0.15');
const GYM_VERIFY_MARGIN = parseFloat(process.env.GYM_VERIFY_MARGIN || '0.02');
const MANUAL_REVIEW_MIN = parseFloat(process.env.GYM_VERIFY_MANUAL_REVIEW_MIN || '0.35');
const MANUAL_REVIEW_MAX = parseFloat(process.env.GYM_VERIFY_MANUAL_REVIEW_MAX || '0.5');

/** ImageNet (MobileNet) class names that indicate gym / fitness equipment. */
const GYM_CLASS_NAMES = [
  'dumbbell',
  'barbell',
  'gymnastic',
  'gym',
  'weight',
  'balance beam',
  'punching bag',
  'sports',
  'exercise',
  'fitness',
];

export interface ClassificationLabel {
  label: string;
  score: number;
}

export interface ClassifyGymSceneResult {
  topPrediction: string;
  confidence: number;
  labels: ClassificationLabel[];
  isGym: boolean;
  reason: string;
  manualReviewFlag: boolean;
}

function isGymClass(className: string): boolean {
  const lower = className.toLowerCase();
  return GYM_CLASS_NAMES.some((k) => lower.includes(k.trim()));
}

let cachedModel: any = null;

async function getModel(): Promise<any> {
  if (cachedModel) return cachedModel;
  const mobilenet = require('@tensorflow-models/mobilenet');
  cachedModel = await mobilenet.load({ version: 2, alpha: 1.0 });
  return cachedModel;
}

/** Load image as 224x224 RGB tensor in [0, 1] using sharp (no tfjs-node needed). */
async function loadImageTensor(imagePath: string): Promise<any> {
  const tf = require('@tensorflow/tfjs');
  const { data, info } = await sharp(imagePath)
    .resize(224, 224)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const numPixels = info.width * info.height * info.channels;
  const arr = new Float32Array(numPixels);
  for (let i = 0; i < numPixels; i++) arr[i] = data[i]! / 255;
  const tensor = tf.tensor3d(arr, [info.height, info.width, info.channels], 'float32');
  return tensor;
}

/**
 * Classify image as gym or not using MobileNet (ImageNet) in Node.js — pure JS, no Python.
 */
export async function classifyGymScene(imagePath: string): Promise<ClassifyGymSceneResult> {
  let tensor: any = null;
  try {
    tensor = await loadImageTensor(imagePath);
    const model = await getModel();
    const predictions = await model.classify(tensor, 5);
    if (tensor?.dispose) tensor.dispose();

    if (!Array.isArray(predictions) || predictions.length === 0) {
      return fallbackResult('Classification returned no predictions.');
    }

    const top5 = predictions.map((p: any) => ({
      label: p.className ?? '',
      score: typeof p.probability === 'number' ? p.probability : 0,
    }));

    const top = top5[0];
    const topLabel = top?.label ?? 'unknown';
    const confidence = top?.score ?? 0;
    const gymRelated =
      isGymClass(topLabel) || top5.some((p) => isGymClass(p?.label ?? ''));

    const maxGymInTop5 = top5.reduce((best, p) => {
      if (!isGymClass(p?.label ?? '')) return best;
      return (p?.score ?? 0) > best ? (p?.score ?? 0) : best;
    }, 0);
    const confidenceForDecision = Math.max(confidence, maxGymInTop5);

    const secondScore = top5.length > 1 ? (top5[1]?.score ?? 0) : 0;
    const marginOk = confidenceForDecision - secondScore >= GYM_VERIFY_MARGIN;
    const aboveThreshold = confidenceForDecision >= GYM_VERIFY_THRESHOLD;
    const isGym = gymRelated && aboveThreshold && marginOk;

    const manualReviewFlag =
      confidenceForDecision >= MANUAL_REVIEW_MIN &&
      confidenceForDecision <= MANUAL_REVIEW_MAX;

    let reason: string;
    if (isGym) {
      reason = 'Scene classified as gym with sufficient confidence.';
    } else if (!gymRelated) {
      reason =
        'Image does not appear to be a gym (e.g. fitness center, workout room).';
    } else if (!aboveThreshold) {
      reason =
        'Low confidence: please capture a clearer view of the gym (equipment, mirror).';
    } else if (!marginOk) {
      reason = 'Classification uncertain; try a clearer photo of the gym.';
    } else {
      reason = 'Verification could not confirm gym scene.';
    }

    return {
      topPrediction: topLabel,
      confidence: Math.round(confidenceForDecision * 100) / 100,
      labels: top5,
      isGym,
      reason,
      manualReviewFlag,
    };
  } catch (e: any) {
    if (tensor?.dispose) try { tensor.dispose(); } catch (_) {}
    if (process.env.NODE_ENV !== 'production') {
      console.log('[gym-scene] Classification error:', e?.message);
    }
    return fallbackResult(e?.message || 'Classification failed.');
  }
}

function fallbackResult(message: string): ClassifyGymSceneResult {
  return {
    topPrediction: 'unknown',
    confidence: 0,
    labels: [],
    isGym: false,
    reason: message,
    manualReviewFlag: false,
  };
}

export {
  GYM_VERIFY_THRESHOLD,
  MANUAL_REVIEW_MIN,
  MANUAL_REVIEW_MAX,
};
