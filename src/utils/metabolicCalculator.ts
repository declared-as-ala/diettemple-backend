export type ActivityLevel =
  | 'sedentaire'
  | 'legerement_actif'
  | 'moderement_actif'
  | 'tres_actif'
  | 'extremement_actif';

export interface ActivityLevelOption {
  value: ActivityLevel;
  label: string;
  description: string;
  coefficient: number;
}

export const ACTIVITY_LEVEL_OPTIONS: ActivityLevelOption[] = [
  {
    value: 'sedentaire',
    label: 'Sédentaire',
    description: 'Travail de bureau, très peu d\'exercice',
    coefficient: 1.2,
  },
  {
    value: 'legerement_actif',
    label: 'Légèrement actif',
    description: 'Activité légère ou sport 1 à 3 fois/semaine',
    coefficient: 1.375,
  },
  {
    value: 'moderement_actif',
    label: 'Modérément actif',
    description: 'Activité modérée, sport 3 à 5 fois/semaine',
    coefficient: 1.55,
  },
  {
    value: 'tres_actif',
    label: 'Très actif',
    description: 'Entraînement intense 6 à 7 fois/semaine ou métier physique',
    coefficient: 1.725,
  },
  {
    value: 'extremement_actif',
    label: 'Extrêmement actif',
    description: 'Athlète de haut niveau, entraînement intensif ou double séance',
    coefficient: 1.9,
  },
];

export const ACTIVITY_COEFFICIENTS: Record<ActivityLevel, number> = {
  sedentaire: 1.2,
  legerement_actif: 1.375,
  moderement_actif: 1.55,
  tres_actif: 1.725,
  extremement_actif: 1.9,
};

export interface MetabolicCalculationInput {
  weightKg?: number | string | null;
  heightCm?: number | string | null;
  age?: number | string | null;
  sex?: 'M' | 'F' | string | null;
  activityLevel?: ActivityLevel | string | null;
}

export interface MetabolicCalculationResult {
  bmr: number | null;
  tdee: number | null;
  activityLevel: ActivityLevel | null;
  activityFactor: number | null;
  isBmrAvailable: boolean;
  isTdeeAvailable: boolean;
  missingFields: string[];
  validationError?: string;
}

/**
 * Validates numeric ranges for adult metabolic calculations (Mifflin-St Jeor)
 */
export function validateMetabolicInputs(input: MetabolicCalculationInput): {
  valid: boolean;
  weight: number | null;
  height: number | null;
  age: number | null;
  sex: 'M' | 'F' | null;
  activityLevel: ActivityLevel | null;
  missingFields: string[];
  error?: string;
} {
  const missingFields: string[] = [];

  // Parse weight
  let weight: number | null = null;
  if (input.weightKg != null && input.weightKg !== '') {
    const parsed = typeof input.weightKg === 'number' ? input.weightKg : parseFloat(String(input.weightKg).replace(',', '.'));
    if (!isNaN(parsed) && parsed >= 30 && parsed <= 300) {
      weight = parsed;
    } else if (!isNaN(parsed)) {
      return {
        valid: false,
        weight: null,
        height: null,
        age: null,
        sex: null,
        activityLevel: null,
        missingFields: [],
        error: 'Le poids doit être compris entre 30 kg et 300 kg.',
      };
    }
  } else {
    missingFields.push('Poids');
  }

  // Parse height
  let height: number | null = null;
  if (input.heightCm != null && input.heightCm !== '') {
    const parsed = typeof input.heightCm === 'number' ? input.heightCm : parseFloat(String(input.heightCm).replace(',', '.'));
    if (!isNaN(parsed) && parsed >= 100 && parsed <= 250) {
      height = parsed;
    } else if (!isNaN(parsed)) {
      return {
        valid: false,
        weight: null,
        height: null,
        age: null,
        sex: null,
        activityLevel: null,
        missingFields: [],
        error: 'La taille doit être comprise entre 100 cm et 250 cm.',
      };
    }
  } else {
    missingFields.push('Taille');
  }

  // Parse age
  let age: number | null = null;
  if (input.age != null && input.age !== '') {
    const parsed = typeof input.age === 'number' ? input.age : parseInt(String(input.age), 10);
    if (!isNaN(parsed) && parsed >= 15 && parsed <= 100) {
      age = parsed;
    } else if (!isNaN(parsed)) {
      return {
        valid: false,
        weight: null,
        height: null,
        age: null,
        sex: null,
        activityLevel: null,
        missingFields: [],
        error: "L'âge doit être compris entre 15 et 100 ans.",
      };
    }
  } else {
    missingFields.push('Âge');
  }

  // Parse sex
  let sex: 'M' | 'F' | null = null;
  if (input.sex === 'M' || input.sex === 'F') {
    sex = input.sex;
  } else {
    missingFields.push('Sexe');
  }

  // Parse activity level
  let activityLevel: ActivityLevel | null = null;
  if (input.activityLevel && input.activityLevel in ACTIVITY_COEFFICIENTS) {
    activityLevel = input.activityLevel as ActivityLevel;
  } else if (input.activityLevel) {
    // Unknown enum value provided
    return {
      valid: false,
      weight: null,
      height: null,
      age: null,
      sex: null,
      activityLevel: null,
      missingFields: [],
      error: "Niveau d'activité invalide.",
    };
  } else {
    missingFields.push("Niveau d'activité");
  }

  return {
    valid: true,
    weight,
    height,
    age,
    sex,
    activityLevel,
    missingFields,
  };
}

/**
 * Calculates BMR (Mifflin-St Jeor) and TDEE (BMR * Activity Factor)
 * Full precision is maintained internally.
 */
export function calculateMetabolic(input: MetabolicCalculationInput): MetabolicCalculationResult {
  const validated = validateMetabolicInputs(input);

  if (!validated.valid) {
    return {
      bmr: null,
      tdee: null,
      activityLevel: null,
      activityFactor: null,
      isBmrAvailable: false,
      isTdeeAvailable: false,
      missingFields: validated.missingFields,
      validationError: validated.error,
    };
  }

  const { weight, height, age, sex, activityLevel, missingFields } = validated;

  let bmr: number | null = null;
  if (weight !== null && height !== null && age !== null && sex !== null) {
    // Mifflin-St Jeor Formula:
    // Homme: 10 * poids + 6.25 * taille - 5 * age + 5
    // Femme: 10 * poids + 6.25 * taille - 5 * age - 161
    const base = 10 * weight + 6.25 * height - 5 * age;
    bmr = sex === 'M' ? base + 5 : base - 161;
  }

  let tdee: number | null = null;
  let activityFactor: number | null = null;
  if (activityLevel) {
    activityFactor = ACTIVITY_COEFFICIENTS[activityLevel] ?? null;
  }

  if (bmr !== null && activityFactor !== null) {
    tdee = bmr * activityFactor;
  }

  return {
    bmr,
    tdee,
    activityLevel,
    activityFactor,
    isBmrAvailable: bmr !== null,
    isTdeeAvailable: tdee !== null,
    missingFields,
  };
}
