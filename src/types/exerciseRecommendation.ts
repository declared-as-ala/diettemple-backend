export type RecommendationDecision = 'ADVANCE' | 'KEEP' | 'DOWN' | 'NO_HISTORY';

export interface ExerciseSetHistory {
  setNumber: number;
  weight: number;
  reps: number;
}

export interface TargetRepRange {
  min: number;
  max: number;
}

export interface SuggestedSet {
  setNumber: number;
  weight: number;
  repsTarget: string;
  type: 'warmup' | 'working';
}

export interface ExerciseRecommendation {
  hasHistory: boolean;
  exerciseId: string;
  exerciseName: string;
  lastSessionDate?: string;
  lastSets: ExerciseSetHistory[];
  targetRepRange: TargetRepRange;
  decision: RecommendationDecision;
  recommendedWeight?: number;
  reason: string;
  suggestedSets: SuggestedSet[];
}

