/**
 * Gym photo validation for check-in (séance Démarrer).
 * Uses the same OpenRouter AI + decision logic as profile "Verify I am at the gym" (classifyGymSceneOpenRouter + decideVerification).
 * Local checks: min size/dimensions, screenshot heuristic, too dark. Then AI + decision; on failure → provider_error.
 */
import path from 'path';
import fs from 'fs';
import os from 'os';
import sharp from 'sharp';
import { classifyGymSceneOpenRouter } from './openRouterGymDetection.service';
import { decideVerification } from './gymVerificationDecision';

const MIN_SIZE_BYTES = 200 * 1024; // 200KB
const MIN_DIMENSION = 600;
const SCREENSHOT_MAX_RATIO = 0.6; // width/height
const DARK_MEAN_THRESHOLD = 40; // below this mean (0-255) consider "too_dark"
const GYM_GEOFENCE_METERS = 300; // within this distance consider geofence match for check-in
const RELAXED_MIN_CONFIDENCE = 0.35; // safety net after 2 failed attempts
const GYM_TOP_LABELS = ['gym interior', 'fitness center', 'workout room', 'weight room'];

export type RejectReason = 'too_dark' | 'blurry' | 'no_equipment' | 'looks_like_food' | 'screenshot_suspected' | 'invalid_file' | 'ai_unavailable' | 'provider_error';

export interface GymVerifyResult {
  accepted: boolean;
  reason: string;
  reasonCode?: RejectReason;
  aiScore?: number;
  gpsDistance?: number;
  details?: { width?: number; height?: number; sizeBytes?: number };
  /** French tips for the user when rejected */
  tips?: string[];
}

interface EnsureResult {
  pathToUse: string;
  tempPath: string | null;
  width: number;
  height: number;
  sizeBytes: number;
  /** mean pixel intensity 0-255 (rough brightness) */
  meanBrightness?: number;
}

async function ensureMinSize(filePath: string): Promise<EnsureResult> {
  const stats = fs.statSync(filePath);
  let width: number;
  let height: number;
  try {
    const meta = await sharp(filePath).metadata();
    width = meta.width ?? 0;
    height = meta.height ?? 0;
  } catch (e) {
    throw new Error('Fichier image invalide.');
  }

  const minSide = Math.min(width, height);
  const tooSmall = stats.size < MIN_SIZE_BYTES || minSide < MIN_DIMENSION;

  if (!tooSmall) {
    let meanBrightness: number | undefined;
    try {
      const st = await sharp(filePath).stats();
      const ch = st.channels || [];
      if (ch.length) {
        const sum = ch.slice(0, 3).reduce((a, c) => a + (c.mean ?? 0), 0);
        meanBrightness = Math.round(sum / Math.min(3, ch.length));
      }
    } catch (_) {}
    return { pathToUse: filePath, tempPath: null, width, height, sizeBytes: stats.size, meanBrightness };
  }

  const scale = MIN_DIMENSION / minSide;
  const newWidth = Math.round(width * scale);
  const newHeight = Math.round(height * scale);
  const tempPath = path.join(os.tmpdir(), `gym-verify-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`);

  await sharp(filePath)
    .resize(newWidth, newHeight, { fit: 'inside' })
    .jpeg({ quality: 88 })
    .toFile(tempPath);

  const newStats = fs.statSync(tempPath);
  let meanBrightness: number | undefined;
  try {
    const st = await sharp(tempPath).stats();
    const ch = st.channels || [];
    if (ch.length) {
      const sum = ch.slice(0, 3).reduce((a, c) => a + (c.mean ?? 0), 0);
      meanBrightness = Math.round(sum / Math.min(3, ch.length));
    }
  } catch (_) {}
  if (process.env.NODE_ENV !== 'production') {
    console.log('[gym-verify] Image upscaled', { original: `${width}x${height}`, resized: `${newWidth}x${newHeight}`, meanBrightness });
  }
  return { pathToUse: tempPath, tempPath, width: newWidth, height: newHeight, sizeBytes: newStats.size, meanBrightness };
}

function tipsForReason(code: RejectReason): string[] {
  switch (code) {
    case 'provider_error':
      return ['Le service de vérification est temporairement indisponible.', 'Réessaie dans quelques instants ou vérifie ta connexion.'];
    case 'too_dark':
      return ['Éclaire mieux la scène ou rapproche-toi d’une source de lumière.', 'Évite les photos dans le noir.'];
    case 'no_equipment':
      return ['Cadre une machine, des haltères, un rack ou le miroir de la salle.', 'Prends la photo de plus loin pour inclure l’équipement.'];
    case 'screenshot_suspected':
      return ["Utilise l’appareil photo de l’app pour prendre une vraie photo.", "Les captures d’écran ne sont pas acceptées."];
    case 'invalid_file':
      return ['Assure-toi que la photo est nette et bien cadrée.', 'Reprends une photo avec l’appareil photo.'];
    case 'ai_unavailable':
      return ['Réessaie dans quelques secondes.', 'Vérifie ta connexion internet.'];
    default:
      return ['Reprends une photo avec une machine ou des haltères bien visibles.', 'Cadre un équipement de salle (poulie, banc, rack).'];
  }
}

export interface ValidateGymPhotoOptions {
  gpsDistanceMeters?: number;
  openaiApiKey?: string;
  /** When true (e.g. after 2 failed attempts), use THRESHOLD_LOW for safety net */
  relaxedThreshold?: boolean;
}

function isGymTopLabel(label: string): boolean {
  const lower = label.toLowerCase().trim();
  return GYM_TOP_LABELS.some((g) => lower.includes(g));
}

export async function validateGymPhoto(
  filePath: string,
  options: ValidateGymPhotoOptions = {}
): Promise<GymVerifyResult> {
  const { gpsDistanceMeters, relaxedThreshold } = options;
  let pathToUse = filePath;
  let tempPath: string | null = null;
  let width: number;
  let height: number;
  let sizeBytes: number;
  let meanBrightness: number | undefined;

  try {
    const ensured = await ensureMinSize(filePath);
    pathToUse = ensured.pathToUse;
    tempPath = ensured.tempPath;
    width = ensured.width;
    height = ensured.height;
    sizeBytes = ensured.sizeBytes;
    meanBrightness = ensured.meanBrightness;
  } catch (e) {
    if (tempPath && fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    console.log('[gym-verify] REJECTED — reason: invalid_file (fichier image invalide).');
    return {
      accepted: false,
      reason: 'Fichier image invalide.',
      reasonCode: 'invalid_file',
      tips: tipsForReason('invalid_file'),
      details: undefined,
    };
  }

  const ratio = width / (height || 1);
  if (ratio < SCREENSHOT_MAX_RATIO || ratio > 1 / SCREENSHOT_MAX_RATIO) {
    if (tempPath && fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    const reason = "Cette image ressemble à une capture d'écran. Prends une vraie photo à la salle.";
    console.log('[gym-verify] REJECTED — reason: screenshot_suspected (ratio=%s).', ratio.toFixed(2));
    return {
      accepted: false,
      reason,
      reasonCode: 'screenshot_suspected',
      tips: tipsForReason('screenshot_suspected'),
      details: { width, height, sizeBytes },
    };
  }

  // Heuristic: very dark image
  if (meanBrightness != null && meanBrightness < DARK_MEAN_THRESHOLD) {
    if (tempPath && fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    console.log('[gym-verify] REJECTED — reason: too_dark (meanBrightness=%s).', meanBrightness);
    return {
      accepted: false,
      reason: 'Photo trop sombre. Éclaire la scène ou rapproche-toi d’une lumière.',
      reasonCode: 'too_dark',
      tips: tipsForReason('too_dark'),
      details: { width, height, sizeBytes },
    };
  }

  try {
    // Same OpenRouter AI + decision as profile "Verify I am at the gym"
    const classification = await classifyGymSceneOpenRouter(pathToUse);
    const aiScore = classification.confidence;

    if (classification.model === 'none') {
      console.log('[gym-verify] REJECTED — provider_error: AI unavailable (same logic as profile verification).');
      if (tempPath && fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      return {
        accepted: false,
        reason: 'Le service de vérification est temporairement indisponible. Réessaie.',
        reasonCode: 'provider_error',
        tips: tipsForReason('provider_error'),
        details: { width, height, sizeBytes },
      };
    }

    const gpsProvided = gpsDistanceMeters != null;
    const geofenceMatch = gpsProvided && gpsDistanceMeters! <= GYM_GEOFENCE_METERS;
    const geofence = {
      gpsProvided,
      geofenceMatch,
      nearestGymDistanceMeters: gpsDistanceMeters ?? null,
    };
    const decision = decideVerification({
      classification: {
        topPrediction: classification.topPrediction,
        confidence: classification.confidence,
        topPredictions: classification.topPredictions,
      },
      geofence,
      uploadSource: 'camera',
    });

    if (decision.verified) {
      console.log('[gym-verify] ACCEPTED — same AI as profile. label=%s confidence=%s', classification.topPrediction, aiScore.toFixed(2));
      if (tempPath && fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      return {
        accepted: true,
        reason: 'OK',
        aiScore,
        gpsDistance: gpsDistanceMeters,
        details: { width, height, sizeBytes },
      };
    }

    // Safety net after 2 failed attempts: accept if gym-related and confidence >= relaxed min
    if (relaxedThreshold && isGymTopLabel(classification.topPrediction) && aiScore >= RELAXED_MIN_CONFIDENCE) {
      console.log('[gym-verify] ACCEPTED — relaxed (after retries). label=%s confidence=%s', classification.topPrediction, aiScore.toFixed(2));
      if (tempPath && fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      return {
        accepted: true,
        reason: 'OK',
        aiScore,
        gpsDistance: gpsDistanceMeters,
        details: { width, height, sizeBytes },
      };
    }

    console.log('[gym-verify] REJECTED — same AI as profile. label=%s confidence=%s reason=%s', classification.topPrediction, aiScore.toFixed(2), decision.reason);
    if (tempPath && fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    return {
      accepted: false,
      reason: decision.reason || 'On ne voit pas assez d’équipement de salle. Cadre une machine, des haltères ou le miroir.',
      reasonCode: 'no_equipment',
      aiScore,
      gpsDistance: gpsDistanceMeters,
      tips: tipsForReason('no_equipment'),
      details: { width, height, sizeBytes },
    };
  } catch (outerError) {
    if (tempPath && fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    console.error('[gym-verify] Unexpected error', outerError);
    return {
      accepted: false,
      reason: 'Le service de vérification est temporairement indisponible. Réessaie.',
      reasonCode: 'provider_error',
      tips: tipsForReason('provider_error'),
      details: undefined,
    };
  } finally {
    if (tempPath && fs.existsSync(tempPath)) try { fs.unlinkSync(tempPath); } catch (_) {}
  }
}

