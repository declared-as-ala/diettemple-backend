import { calculateMetabolic, validateMetabolicInputs, ACTIVITY_LEVEL_OPTIONS, ACTIVITY_COEFFICIENTS } from './metabolicCalculator';

describe('Metabolic Calculator (Mifflin-St Jeor & TDEE)', () => {
  test('Male client example from specification: 28 years, 175 cm, 78 kg', () => {
    // BMR = (10 * 78) + (6.25 * 175) - (5 * 28) + 5
    // = 780 + 1093.75 - 140 + 5 = 1738.75
    // TDEE = 1738.75 * 1.550 = 2695.0625
    const result = calculateMetabolic({
      weightKg: 78,
      heightCm: 175,
      age: 28,
      sex: 'M',
      activityLevel: 'moderement_actif',
    });

    expect(result.bmr).toBeCloseTo(1738.75, 4);
    expect(result.tdee).toBeCloseTo(2695.0625, 4);
    expect(Math.round(result.tdee!)).toBe(2695);
    expect(result.isBmrAvailable).toBe(true);
    expect(result.isTdeeAvailable).toBe(true);
  });

  test('Female client example from specification: same measurements', () => {
    // BMR = 780 + 1093.75 - 140 - 161 = 1572.75
    const result = calculateMetabolic({
      weightKg: '78',
      heightCm: '175',
      age: '28',
      sex: 'F',
      activityLevel: 'sedentaire',
    });

    expect(result.bmr).toBeCloseTo(1572.75, 4);
    expect(result.tdee).toBeCloseTo(1572.75 * 1.2, 4);
    expect(result.isBmrAvailable).toBe(true);
    expect(result.isTdeeAvailable).toBe(true);
  });

  test('Missing sex should result in unavailable calculation', () => {
    const result = calculateMetabolic({
      weightKg: 78,
      heightCm: 175,
      age: 28,
      sex: null,
      activityLevel: 'moderement_actif',
    });

    expect(result.bmr).toBeNull();
    expect(result.tdee).toBeNull();
    expect(result.isBmrAvailable).toBe(false);
    expect(result.missingFields).toContain('Sexe');
  });

  test('Missing activity level allows BMR but marks TDEE unavailable', () => {
    const result = calculateMetabolic({
      weightKg: 78,
      heightCm: 175,
      age: 28,
      sex: 'M',
      activityLevel: null,
    });

    expect(result.bmr).toBeCloseTo(1738.75, 4);
    expect(result.tdee).toBeNull();
    expect(result.isBmrAvailable).toBe(true);
    expect(result.isTdeeAvailable).toBe(false);
    expect(result.missingFields).toContain("Niveau d'activité");
  });

  test('Validates realistic numeric ranges', () => {
    const invalidWeight = validateMetabolicInputs({ weightKg: 10, heightCm: 175, age: 25, sex: 'M' });
    expect(invalidWeight.valid).toBe(false);
    expect(invalidWeight.error).toContain('30 kg et 300 kg');

    const invalidHeight = validateMetabolicInputs({ weightKg: 70, heightCm: 80, age: 25, sex: 'M' });
    expect(invalidHeight.valid).toBe(false);
    expect(invalidHeight.error).toContain('100 cm et 250 cm');

    const invalidAge = validateMetabolicInputs({ weightKg: 70, heightCm: 175, age: 12, sex: 'M' });
    expect(invalidAge.valid).toBe(false);
    expect(invalidAge.error).toContain('15 et 100 ans');
  });

  test('Verifies all 5 physical activity coefficients', () => {
    expect(ACTIVITY_COEFFICIENTS.sedentaire).toBe(1.2);
    expect(ACTIVITY_COEFFICIENTS.legerement_actif).toBe(1.375);
    expect(ACTIVITY_COEFFICIENTS.moderement_actif).toBe(1.55);
    expect(ACTIVITY_COEFFICIENTS.tres_actif).toBe(1.725);
    expect(ACTIVITY_COEFFICIENTS.extremement_actif).toBe(1.9);
  });
});
