/**
 * Gym presence verification decision logic.
 * Inputs: classification result, geofence, upload source → verified, trustLevel, reason.
 */

import type { GeofenceResult } from './geofence';

export type UploadSource = 'camera' | 'gallery' | 'unknown';

export type TrustLevel = 'high' | 'medium' | 'low';

const THRESHOLD = parseFloat(process.env.GYM_VERIFY_THRESHOLD || '0.40');
const MARGIN = parseFloat(process.env.GYM_VERIFY_MARGIN || '0.05');
const MANUAL_REVIEW_MIN = parseFloat(process.env.GYM_VERIFY_MANUAL_REVIEW_MIN || '0.35');
const MANUAL_REVIEW_MAX = parseFloat(process.env.GYM_VERIFY_MANUAL_REVIEW_MAX || '0.50');

const GYM_LABELS = new Set([
  'gym interior',
  'fitness center',
  'workout room',
  'weight room',
]);

function isGymRelated(label: string): boolean {
  const lower = label.toLowerCase().trim();
  return Array.from(GYM_LABELS).some((g) => lower.includes(g));
}

export interface ClassificationInput {
  topPrediction: string;
  confidence: number;
  topPredictions: Array<{ label: string; score: number }>;
}

export interface DecisionInput {
  classification: ClassificationInput;
  geofence: GeofenceResult;
  uploadSource: UploadSource;
}

export interface DecisionResult {
  verified: boolean;
  reason: string;
  manualReviewFlag: boolean;
  trustLevel: TrustLevel;
  thresholds: { threshold: number; margin: number };
}

export function decideVerification(input: DecisionInput): DecisionResult {
  const { classification, geofence, uploadSource } = input;
  const { topPrediction, confidence, topPredictions } = classification;

  const top1 = topPredictions[0]?.score ?? confidence;
  const top2 = topPredictions.length > 1 ? (topPredictions[1]?.score ?? 0) : 0;
  const marginOk = top1 - top2 >= MARGIN;
  const gymRelated = isGymRelated(topPrediction);
  const aboveThreshold = confidence >= THRESHOLD;

  const verified = gymRelated && aboveThreshold && marginOk;
  const isUncertain = topPrediction.toLowerCase().trim() === 'uncertain';

  const manualReviewFlag =
    isUncertain || (confidence >= MANUAL_REVIEW_MIN && confidence <= MANUAL_REVIEW_MAX);

  let trustLevel: TrustLevel = 'low';
  if (verified && geofence.geofenceMatch && uploadSource === 'camera') {
    trustLevel = 'high';
  } else if (verified && (geofence.gpsProvided && !geofence.geofenceMatch)) {
    trustLevel = 'medium'; // AI pass + GPS but no geofence match
  } else if (verified && uploadSource === 'gallery') {
    trustLevel = 'medium'; // AI pass + gallery upload
  } else if (verified) {
    trustLevel = 'medium'; // AI pass only (e.g. camera but no GPS)
  }

  let reason: string;
  if (verified) {
    reason = 'Scene classified as gym with sufficient confidence.';
  } else if (isUncertain) {
    reason = 'Classification uncertain; manual review may be required.';
  } else if (!gymRelated) {
    reason = 'Image does not appear to be a gym (e.g. fitness center, workout room).';
  } else if (!aboveThreshold) {
    reason = 'Low confidence: please capture a clearer view of the gym.';
  } else if (!marginOk) {
    reason = 'Classification uncertain; try a clearer photo of the gym.';
  } else {
    reason = 'Verification could not confirm gym scene.';
  }

  return {
    verified,
    reason,
    manualReviewFlag,
    trustLevel,
    thresholds: { threshold: THRESHOLD, margin: MARGIN },
  };
}

export { THRESHOLD as GYM_VERIFY_THRESHOLD, MARGIN as GYM_VERIFY_MARGIN };
