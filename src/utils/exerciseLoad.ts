export const LOAD_MODES = ['external_weight', 'bodyweight', 'bodyweight_plus_weight'] as const;

export type ExerciseLoadMode = (typeof LOAD_MODES)[number];

export type ExerciseLoadConfig = {
  supportedLoadModes?: ExerciseLoadMode[];
  defaultLoadMode?: ExerciseLoadMode;
  supportsAdditionalWeight?: boolean;
};

export type WorkoutSetLoad = {
  loadMode?: ExerciseLoadMode;
  externalWeightKg?: number;
  additionalWeightKg?: number;
  weight?: number;
};

export function resolveSupportedLoadModes(exercise?: ExerciseLoadConfig | null): ExerciseLoadMode[] {
  const configured = exercise?.supportedLoadModes?.filter((mode): mode is ExerciseLoadMode =>
    LOAD_MODES.includes(mode as ExerciseLoadMode)
  );
  return configured?.length ? Array.from(new Set(configured)) : ['external_weight'];
}

export function resolveDefaultLoadMode(exercise?: ExerciseLoadConfig | null): ExerciseLoadMode {
  const supported = resolveSupportedLoadModes(exercise);
  return exercise?.defaultLoadMode && supported.includes(exercise.defaultLoadMode)
    ? exercise.defaultLoadMode
    : supported[0];
}

export function normalizeSetLoad(
  input: WorkoutSetLoad,
  exercise?: ExerciseLoadConfig | null
): Required<Pick<WorkoutSetLoad, 'loadMode' | 'externalWeightKg' | 'additionalWeightKg' | 'weight'>> {
  const supported = resolveSupportedLoadModes(exercise);
  const loadMode = input.loadMode ?? resolveDefaultLoadMode(exercise);
  if (!supported.includes(loadMode)) {
    throw new Error(`Load mode ${loadMode} is not supported by this exercise`);
  }

  const asNonNegative = (value: unknown, label: string): number => {
    const numeric = Number(value ?? 0);
    if (!Number.isFinite(numeric) || numeric < 0 || numeric > 1000) {
      throw new Error(`${label} must be a number between 0 and 1000`);
    }
    return Math.round(numeric * 100) / 100;
  };

  if (loadMode === 'external_weight') {
    const externalWeightKg = asNonNegative(input.externalWeightKg ?? input.weight, 'externalWeightKg');
    return { loadMode, externalWeightKg, additionalWeightKg: 0, weight: externalWeightKg };
  }
  if (loadMode === 'bodyweight_plus_weight') {
    const additionalWeightKg = asNonNegative(input.additionalWeightKg ?? input.weight, 'additionalWeightKg');
    if (additionalWeightKg <= 0) throw new Error('additionalWeightKg must be greater than 0');
    return { loadMode, externalWeightKg: 0, additionalWeightKg, weight: additionalWeightKg };
  }
  return { loadMode, externalWeightKg: 0, additionalWeightKg: 0, weight: 0 };
}

export function loadVolumeKg(load: Pick<WorkoutSetLoad, 'loadMode' | 'externalWeightKg' | 'additionalWeightKg' | 'weight'>): number {
  if (load.loadMode === 'bodyweight') return 0;
  if (load.loadMode === 'bodyweight_plus_weight') return Number(load.additionalWeightKg ?? load.weight ?? 0);
  return Number(load.externalWeightKg ?? load.weight ?? 0);
}
