/**
 * Meal scanner v2: AI JSON (simulated, one fixture per scenario) -> database match -> natural units,
 * suggestions and deterministic nutrition. The live Gemini call is not exercised here.
 */
jest.mock('../models/Food.model', () => ({ __esModule: true, default: { find: jest.fn() } }));

import { describe, it, expect } from '@jest/globals';
import { CATALOG } from '../data/foodCatalog';
import { normalizeText, rankFoods, scoreMatch, MATCH_THRESHOLD } from './foodMatcher';
import { buildScanResponse, parseMealV2, type Lookup, type ScanItemV2 } from './mealScanPipeline';
import { gramsFor, macrosForGrams, roundEstimate, unitsForFood } from './portion';

// In-memory "database" built from the catalog the same way the seed script stores it.
const DB = CATALOG.map((c) => ({
  _id: c.nameFr,
  nameFr: c.nameFr,
  nameAr: c.nameAr,
  nameEn: c.nameEn,
  nameLocal: c.nameLocal,
  synonyms: c.aliases,
  macrosPer100g: c.per100,
  servingUnits: c.units,
  defaultUnit: c.defaultUnit,
  portionPresets: c.presets,
  isDish: c.isDish,
  nutritionBasis: c.basis,
  tags: c.tags,
}));
const lookup: Lookup = async (label) => rankFoods(label, DB, 4);

const ai = (items: unknown[], extra: Record<string, unknown> = {}) =>
  JSON.stringify({ mealName: null, cuisine: 'Tunisian', isTunisian: true, imageQuality: 'good', notes: '', items, ...extra });

async function scan(items: unknown[], extra: Record<string, unknown> = {}) {
  const meal = parseMealV2(ai(items, extra));
  expect(meal).not.toBeNull();
  return buildScanResponse(meal!, lookup);
}
const item = (foodName: string, o: Record<string, unknown> = {}) => ({ foodName, category: 'other', confidence: 0.9, ...o });

/** What the app does when the user edits quantity/unit — no AI involved. */
function userSets(i: ScanItemV2, quantity: number, unit: string) {
  const grams = gramsFor(quantity, unit, i.units);
  return { grams, macros: macrosForGrams(grams, i.macrosPer100g!) };
}

describe('1-2. eggs: natural unit, estimated weight, user can change count or switch to grams', () => {
  it('2 eggs -> piece x2, ≈110 g, database nutrition, 1/2/3 egg suggestions', async () => {
    const r = await scan([item('Œufs', { category: 'protein', unit: 'piece', quantity: 2, estimatedGrams: 150 })]);
    const e = r.items[0];
    expect(e.label).toBe('Œuf entier');
    expect(e.portion).toMatchObject({ unit: 'piece', quantity: 2, estimatedGrams: 110, approximate: true });
    expect(e.units.map((u) => u.unit)).toEqual(['piece', 'g']);
    expect(e.suggestions.map((s) => s.label)).toEqual(expect.arrayContaining(['1 œuf', '2 œufs', '3 œufs']));
    expect(e.suggestions.find((s) => s.label === '2 œufs')!.estimatedGrams).toBe(110);
    expect(e.nutritionSource).toBe('database');
    expect(e.uncertain).toBe(false);
    // 2 -> 3 eggs recalculates deterministically
    const three = userSets(e, 3, 'piece');
    expect(three.grams).toBe(165);
    expect(three.macros.kcal).toBe(Math.round(155 * 1.65));
    expect(three.macros.protein).toBeCloseTo(21.5, 1);
    // switch to grams
    expect(userSets(e, 110, 'g').macros.kcal).toBe(Math.round(155 * 1.1));
  });
  it('3 eggs', async () => {
    const r = await scan([item('Oeufs', { unit: 'piece', quantity: 3, estimatedGrams: 160 })]);
    expect(r.items[0].portion).toMatchObject({ unit: 'piece', quantity: 3, estimatedGrams: 165 });
    expect(r.items[0].suggestions.map((s) => s.quantity)).toEqual(expect.arrayContaining([2, 3, 4]));
  });
});

describe('3-8. everyday foods use a sensible unit, never "347 g" as the only option', () => {
  it('banana: piece with half step; grams from catalog, not from the AI guess', async () => {
    const r = await scan([item('Banane', { category: 'fruit', unit: 'piece', quantity: 1, estimatedGrams: 347.82 })]);
    expect(r.items[0].portion).toMatchObject({ unit: 'piece', quantity: 1, estimatedGrams: 120 });
    expect(r.items[0].suggestions.some((s) => s.label === '1/2 banane')).toBe(true);
    expect(Number.isInteger(r.items[0].portion.estimatedGrams)).toBe(true);
  });
  it('apple: 1 medium apple ≈ 180 g', async () => {
    const r = await scan([item('Pomme', { category: 'fruit', unit: 'piece', quantity: 1 })]);
    expect(r.items[0].portion).toMatchObject({ unit: 'piece', quantity: 1, estimatedGrams: 180 });
  });
  it('chicken breast: grams (rounded), piece also offered', async () => {
    const r = await scan([item('Blanc de poulet grillé', { category: 'protein', unit: 'g', estimatedGrams: 147 })]);
    expect(r.items[0].label).toBe('Poulet, blanc, grillé');
    expect(r.items[0].portion).toMatchObject({ unit: 'g', estimatedGrams: 150 });
    expect(r.items[0].units.map((u) => u.unit)).toEqual(['piece', 'g']);
  });
  it('rice: bowl; pasta: plate with Petit/Moyen/Grand; tuna: can', async () => {
    const r = await scan([
      item('Riz blanc', { unit: 'bowl', quantity: 1, estimatedGrams: 190 }),
      item('Pâtes', { unit: 'plate', quantity: 1, estimatedGrams: 260 }),
      item('Thon', { category: 'protein', unit: 'can', quantity: 1 }),
    ]);
    expect(r.items[0].portion.unit).toBe('bowl');
    expect(r.items[1].suggestions.map((s) => s.label.split(' ')[0])).toEqual(['Petit', 'Moyen', 'Grand']);
    expect(r.items[2].portion).toMatchObject({ unit: 'can', quantity: 1 });
  });
  it('milk is measured in glasses / ml, not grams', async () => {
    const r = await scan([item('Lait', { category: 'drink', unit: 'glass', quantity: 1 })]);
    expect(r.items[0].units.map((u) => u.unit)).toEqual(['glass', 'cup', 'ml']);
    expect(r.items[0].portion).toMatchObject({ unit: 'glass', estimatedGrams: 250 });
  });
});

describe('9-18. Tunisian dishes are recognised from French / Tunisian / Arabic names', () => {
  const cases: Array<[string, string, string, string]> = [
    ['Couscous tunisien au poulet', 'Couscous tunisien au poulet', 'plate', 'assiette'],
    ['Ojja', 'Ojja merguez', 'serving', 'portion'],
    ['Brik', 'Brik à l\'œuf', 'piece', 'brik'],
    ['Lablabi', 'Lablabi', 'bowl', 'bol'],
    ['Mlewi', 'Mlawi', 'piece', 'mlawi'],
    ['Chapati tunisien', 'Chapati tunisien', 'piece', 'chapati'],
    ['Kafteji', 'Kafteji', 'serving', 'portion'],
    ['Salade mechouia', 'Salade mechouia', 'serving', 'portion'],
    ['Chorba frik', 'Chorba frik', 'bowl', 'bol'],
    ['Tajine tunisien', 'Tajine tunisien', 'piece', 'part'],
    ['كسكسي', 'Couscous cuit', 'plate', 'assiette'],
    ['Makarouna bel salsa', 'Spaghetti tunisien', 'plate', 'assiette'],
  ];
  it.each(cases)('%s -> %s (%s)', async (name, expected, unit) => {
    const r = await scan([item(name, { category: 'dish', unit, quantity: 1, estimatedGrams: 300, isMixedDish: false })]);
    const i = r.items[0];
    expect(i.label).toBe(expected);
    expect(i.nutritionSource).toBe('database');
    expect(i.units[0].unit).toBe(unit);
    expect(i.macrosPer100g!.kcal).toBeGreaterThan(0);
  });
  it('composed dishes are flagged as estimated (not verified composition-table values)', async () => {
    const r = await scan([item('Lablabi', { unit: 'bowl', quantity: 1 })]);
    expect(r.items[0].nutritionBasis).toBe('estimated');
  });
  it('couscous presets give Petit 250 / Moyen 350 / Grand 500', async () => {
    const r = await scan([item('Couscous tunisien au poulet', { unit: 'plate', quantity: 1, estimatedGrams: 350 })]);
    expect(r.items[0].suggestions.map((s) => s.label)).toEqual(['Petit 250 g', 'Moyen 350 g', 'Grand 500 g']);
  });
  it('1 egg brik vs brik au thon are different dishes', async () => {
    const a = (await scan([item('Brik à l\'œuf', { unit: 'piece', quantity: 1 })])).items[0];
    const b = (await scan([item('Brik au thon', { unit: 'piece', quantity: 1 })])).items[0];
    expect(a.label).not.toBe(b.label);
  });
});

describe('19. mixed Tunisian plate / dish with components', () => {
  const couscous = {
    foodName: 'Couscous tunisien au poulet', category: 'dish', confidence: 0.85, isMixedDish: true, unit: 'plate', quantity: 1, estimatedGrams: 600,
    components: [
      { foodName: 'Couscous', estimatedGrams: 250, confidence: 0.9 },
      { foodName: 'Poulet', estimatedGrams: 120, confidence: 0.85 },
      { foodName: 'Pois chiches', estimatedGrams: 50, confidence: 0.8 },
      { foodName: 'Carottes', estimatedGrams: 60, confidence: 0.8 },
      { foodName: 'Pomme de terre', estimatedGrams: 80, confidence: 0.8 },
    ],
  };
  it('reliable components -> each ingredient is its own editable item, grouped under the dish, totals computed', async () => {
    const r = await scan([couscous]);
    expect(r.meal.mode).toBe('components');
    expect(r.meal.dishName).toBe('Couscous tunisien au poulet');
    expect(r.items.map((i) => i.label)).toEqual(['Couscous cuit', 'Poulet, blanc, grillé', 'Pois chiches cuits', 'Carotte', 'Pomme de terre']);
    expect(r.items.every((i) => i.group === 'Couscous tunisien au poulet' && i.nutritionSource === 'database')).toBe(true);
    expect(r.items.map((i) => i.portion.estimatedGrams)).toEqual([250, 120, 50, 60, 80]);
    const kcal = r.items.reduce((s, i) => s + macrosForGrams(i.portion.estimatedGrams, i.macrosPer100g!).kcal, 0);
    expect(r.totals.kcal).toBe(kcal);
  });
  it('unreliable components (unknown ingredients) -> whole-dish estimate + informational breakdown', async () => {
    const r = await scan([{ ...couscous, components: [
      { foodName: 'Truc inconnu 1', estimatedGrams: 200, confidence: 0.5 },
      { foodName: 'Truc inconnu 2', estimatedGrams: 100, confidence: 0.5 },
    ] }]);
    expect(r.meal.mode).toBe('dish');
    expect(r.items).toHaveLength(1);
    expect(r.items[0].label).toBe('Couscous tunisien au poulet');
    expect(r.items[0].breakdown).toHaveLength(2);
  });
});

describe('20. several foods in one image are independent items', () => {
  it('breakfast: 2 eggs + 1 slice bread + banana + yogurt', async () => {
    const r = await scan([
      item('Œufs', { unit: 'piece', quantity: 2 }),
      item('Pain', { unit: 'slice', quantity: 1 }),
      item('Banane', { unit: 'piece', quantity: 1 }),
      item('Yaourt', { unit: 'container', quantity: 1 }),
    ]);
    expect(r.items.map((i) => i.portion.unit)).toEqual(['piece', 'slice', 'piece', 'container']);
    expect(r.items.map((i) => i.portion.estimatedGrams)).toEqual([110, 30, 120, 125]);
    expect(new Set(r.items.map((i) => i.id)).size).toBe(4);
    expect(r.totals.kcal).toBeGreaterThan(300);
  });
});

describe('uncertainty, corrections and edge cases', () => {
  it('unknown dish: flagged uncertain, nutrition marked ai_estimate (never presented as database)', async () => {
    const r = await scan([item('Plat inconnu', { confidence: 0.4, unit: 'serving', quantity: 1, estimatedGrams: 250,
      alternatives: ['Kafteji', 'Ojja'], nutritionEstimatePer100g: { kcal: 150, protein: 5, carbs: 15, fat: 7 } })]);
    const i = r.items[0];
    expect(i.uncertain).toBe(true);
    expect(i.nutritionSource).toBe('ai_estimate');
    expect(i.suggestedFoods.some((f) => f.name === 'Kafteji')).toBe(true); // possible matches offered
    expect(i.portion.unit).toBe('g');
  });
  it('no database match and no AI estimate -> nutrition source "none"', async () => {
    const r = await scan([item('Truc inconnu', { confidence: 0.3 })]);
    expect(r.items[0].nutritionSource).toBe('none');
    expect(r.items[0].macrosPer100g).toBeUndefined();
  });
  it('low confidence on a known food is still flagged', async () => {
    const r = await scan([item('Kafteji', { confidence: 0.35, unit: 'serving', quantity: 1 })]);
    expect(r.items[0].uncertain).toBe(true);
  });
  it('empty plate / not food', async () => {
    const r = await scan([], { imageQuality: 'not_food' });
    expect(r.items).toHaveLength(0);
    expect(r.notes).toMatch(/Aucun aliment/);
  });
  it('user correction: chicken -> turkey keeps grams and recalculates from the new food', async () => {
    const r = await scan([item('Poulet', { unit: 'g', estimatedGrams: 150 })]);
    const turkey = { kcal: 104, protein: 24, carbs: 0, fat: 1 };
    const chicken = macrosForGrams(150, r.items[0].macrosPer100g!);
    const corrected = macrosForGrams(150, turkey);
    expect(corrected.kcal).toBe(156);
    expect(corrected.kcal).not.toBe(chicken.kcal);
  });
  it('no false precision: estimates are rounded, only user-entered numbers are exact', () => {
    expect(roundEstimate(347.82)).toBe(350);
    expect(roundEstimate(112)).toBe(110);
    expect(roundEstimate(47)).toBe(45);
    expect(roundEstimate(0)).toBe(0);
  });
  it('quantity recalculation is deterministic and needs no new scan (1 -> 1.5 serving, 250 -> 350 g)', async () => {
    const i = (await scan([item('Kafteji', { unit: 'serving', quantity: 1 })])).items[0];
    expect(userSets(i, 1.5, 'serving').grams).toBe(375);
    const a = userSets(i, 1.5, 'serving').macros;
    const b = userSets(i, 1.5, 'serving').macros;
    expect(a).toEqual(b);
    expect(userSets(i, 350, 'g').macros.kcal).toBe(Math.round(i.macrosPer100g!.kcal * 3.5));
  });
  it('fiber is part of the recalculation when the food has it', () => {
    expect(macrosForGrams(200, { kcal: 100, protein: 1, carbs: 1, fat: 1, fiber: 4 }).fiber).toBe(8);
  });
});

describe('matcher', () => {
  it('normalises accents, œ, plural, Arabic', () => {
    expect(normalizeText('Œufs durs')).toBe('oeufs durs');
    expect(scoreMatch('oeufs', DB.find((f) => f.nameFr === 'Œuf entier')!)).toBeGreaterThanOrEqual(MATCH_THRESHOLD);
    expect(scoreMatch('بيض', DB.find((f) => f.nameFr === 'Œuf entier')!)).toBeGreaterThanOrEqual(MATCH_THRESHOLD);
    expect(scoreMatch('Brik', DB.find((f) => f.nameFr === 'Chorba frik')!)).toBeLessThan(MATCH_THRESHOLD);
  });
  it('a different dish never wins by sharing one generic word', () => {
    expect(rankFoods('Couscous tunisien au poisson', DB, 1)[0].food.nameFr).toBe('Couscous tunisien au poisson');
    expect(rankFoods('Couscous tunisien à la viande', DB, 1)[0].food.nameFr).toBe('Couscous tunisien à la viande');
  });
});

describe('catalog data quality', () => {
  it('no duplicate names; every unit has grams > 0; dishes have a unit', () => {
    const names = CATALOG.map((c) => c.nameFr);
    expect(new Set(names).size).toBe(names.length);
    for (const c of CATALOG) {
      (c.units || []).forEach((u) => expect(u.grams).toBeGreaterThan(0));
      if (c.isDish) expect(c.units && c.units.length).toBeGreaterThan(0);
      expect(unitsForFood({ servingUnits: c.units, tags: c.tags }).length).toBeGreaterThan(0);
    }
  });
  it('macros are energy-consistent (Atwater, ±35%) so a typo cannot slip in', () => {
    for (const c of CATALOG) {
      const calc = 4 * c.per100.protein + 4 * c.per100.carbs + 9 * c.per100.fat;
      if (c.per100.kcal < 40) continue;
      expect({ name: c.nameFr, ok: Math.abs(calc - c.per100.kcal) / c.per100.kcal <= 0.35 }).toEqual({ name: c.nameFr, ok: true });
    }
  });
});
