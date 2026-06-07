import { ExerciseRecommendation, ExerciseSetHistory, RecommendationDecision, SuggestedSet, TargetRepRange } from '../types/exerciseRecommendation';

interface ExerciseConfigInput {
  targetReps?: number | { min?: number; max?: number } | null;
  muscleGroup?: string | null;
}

interface HistoryInput {
  exerciseId?: string | null;
  exerciseName?: string | null;
  sessionDate?: Date | string | null;
  sets: Array<{
    setNumber?: number | null;
    weight?: number | null;
    reps?: number | null;
  }>;
}

function normalizeExerciseName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function roundToStep(value: number, step = 2.5): number {
  return Math.max(0, Math.round(value / step) * step);
}

function getTargetRepRange(targetReps?: number | { min?: number; max?: number } | null): TargetRepRange {
  if (typeof targetReps === 'number' && Number.isFinite(targetReps)) {
    return { min: Math.max(1, targetReps - 2), max: Math.max(1, targetReps) };
  }
  if (targetReps && typeof targetReps === 'object') {
    const min = Number.isFinite(targetReps.min) ? Number(targetReps.min) : 8;
    const max = Number.isFinite(targetReps.max) ? Number(targetReps.max) : 12;
    return { min: Math.max(1, min), max: Math.max(min, max) };
  }
  return { min: 8, max: 12 };
}

function isLowerBody(muscleGroup?: string | null): boolean {
  if (!muscleGroup) return false;
  const key = muscleGroup.toLowerCase();
  return ['leg', 'quad', 'hamstring', 'glute', 'mollet', 'calf', 'lower'].some((k) => key.includes(k));
}

function sanitizeSets(rawSets: HistoryInput['sets']): ExerciseSetHistory[] {
  const sets = rawSets
    .map((set, index) => ({
      setNumber: Number.isFinite(set.setNumber) ? Number(set.setNumber) : index + 1,
      weight: Number(set.weight),
      reps: Number(set.reps),
    }))
    .filter((set) => Number.isFinite(set.weight) && set.weight > 0 && Number.isFinite(set.reps) && set.reps > 0)
    .sort((a, b) => a.setNumber - b.setNumber);
  return sets;
}

function filterWorkingSets(sets: ExerciseSetHistory[]): ExerciseSetHistory[] {
  if (sets.length <= 2) return sets;
  const maxWeight = Math.max(...sets.map((s) => s.weight));
  // Conservative warm-up filter: very light sets (<65% of top load) are excluded
  // only when we still keep enough data points to make a safe decision.
  const warmupCutoff = maxWeight * 0.65;
  const withoutWarmups = sets.filter((s) => s.weight >= warmupCutoff);
  return withoutWarmups.length >= 2 ? withoutWarmups : sets;
}

function pickLastWorkingSet(sets: ExerciseSetHistory[]): ExerciseSetHistory {
  const preferred = sets.find((s) => s.setNumber === 4) || sets.find((s) => s.setNumber === 3);
  return preferred || sets[sets.length - 1];
}

function computeDecision(
  lastWorkingSet: ExerciseSetHistory,
  previousWorkingSet: ExerciseSetHistory | null,
  targetRange: TargetRepRange,
  isLowerBodyCategory: boolean
): { decision: RecommendationDecision; recommendedWeight: number; reason: string } {
  // Keep progression conservative by default: +/- one standard plate step.
  const step = isLowerBodyCategory ? 5 : 2.5;
  const strongDrop = previousWorkingSet ? previousWorkingSet.reps - lastWorkingSet.reps >= 4 : false;
  const previousCloseToTarget = previousWorkingSet ? previousWorkingSet.reps >= targetRange.min : true;

  if (lastWorkingSet.reps >= targetRange.max && previousCloseToTarget) {
    const next = roundToStep(lastWorkingSet.weight + step);
    return {
      decision: 'ADVANCE',
      recommendedWeight: next,
      reason: `Tu as validé ${lastWorkingSet.weight} kg x ${lastWorkingSet.reps} reps sur la dernière série lourde, augmente légèrement à ${next} kg.`,
    };
  }

  if (lastWorkingSet.reps < targetRange.min || strongDrop) {
    const next = roundToStep(lastWorkingSet.weight - step);
    return {
      decision: 'DOWN',
      recommendedWeight: next,
      reason: `La dernière série lourde (${lastWorkingSet.weight} kg x ${lastWorkingSet.reps} reps) est sous la cible, réduis légèrement pour rester propre.`,
    };
  }

  return {
    decision: 'KEEP',
    recommendedWeight: roundToStep(lastWorkingSet.weight),
    reason: `Tu as fait ${lastWorkingSet.weight} kg x ${lastWorkingSet.reps} reps la dernière fois, donc garde ${roundToStep(lastWorkingSet.weight)} kg aujourd'hui.`,
  };
}

function buildSuggestedSets(recommendedWeight: number, targetRange: TargetRepRange, totalWorkingSets: number): SuggestedSet[] {
  const warmup = roundToStep(recommendedWeight * 0.75);
  const sets: SuggestedSet[] = [
    { setNumber: 1, weight: warmup, repsTarget: '10-12', type: 'warmup' },
    { setNumber: 2, weight: recommendedWeight, repsTarget: `${targetRange.min}-${targetRange.max}`, type: 'working' },
    { setNumber: 3, weight: recommendedWeight, repsTarget: `${targetRange.min}-${targetRange.max}`, type: 'working' },
  ];
  if (totalWorkingSets >= 4) {
    sets.push({ setNumber: 4, weight: recommendedWeight, repsTarget: `${targetRange.min}-${targetRange.max}`, type: 'working' });
  }
  return sets;
}

export function calculateExerciseRecommendation(history: HistoryInput | null, config: ExerciseConfigInput): ExerciseRecommendation {
  const targetRepRange = getTargetRepRange(config.targetReps);
  const exerciseId = history?.exerciseId || '';
  const exerciseName = history?.exerciseName || '';

  if (!history || !history.sets || history.sets.length === 0) {
    return {
      hasHistory: false,
      exerciseId,
      exerciseName,
      lastSets: [],
      targetRepRange,
      decision: 'NO_HISTORY',
      reason: "Aucun historique pour cet exercice. Commence avec une charge confortable.",
      suggestedSets: [],
    };
  }

  const sanitized = sanitizeSets(history.sets);
  if (!sanitized.length) {
    return {
      hasHistory: false,
      exerciseId,
      exerciseName,
      lastSets: [],
      targetRepRange,
      decision: 'NO_HISTORY',
      reason: "Historique incomplet pour cet exercice. Commence avec une charge confortable.",
      suggestedSets: [],
    };
  }

  const workingSets = filterWorkingSets(sanitized);
  const lastWorkingSet = pickLastWorkingSet(workingSets);
  const lastIndex = workingSets.findIndex((s) => s.setNumber === lastWorkingSet.setNumber);
  const previousWorkingSet = lastIndex > 0 ? workingSets[lastIndex - 1] : null;
  const decisionResult = computeDecision(lastWorkingSet, previousWorkingSet, targetRepRange, isLowerBody(config.muscleGroup));
  const suggestedSets = buildSuggestedSets(decisionResult.recommendedWeight, targetRepRange, sanitized.length);

  const lastSessionDate =
    history.sessionDate != null
      ? new Date(history.sessionDate).toISOString().slice(0, 10)
      : undefined;

  return {
    hasHistory: true,
    exerciseId,
    exerciseName,
    lastSessionDate,
    lastSets: sanitized,
    targetRepRange,
    decision: decisionResult.decision,
    recommendedWeight: decisionResult.recommendedWeight,
    reason: decisionResult.reason,
    suggestedSets,
  };
}

export { normalizeExerciseName };

