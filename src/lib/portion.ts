/**
 * Deterministic portion / nutrition engine for the meal scanner.
 *
 * The AI only provides a visual estimate (what, how many, rough grams). Everything after that —
 * unit conversion, suggestions, macros — is plain arithmetic on database values, so a quantity
 * change never needs another AI call and always gives the same answer.
 */
import type { IServingUnit } from '../models/Food.model';

export interface Per100 {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
}

export interface Macros {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

export interface PortionSuggestion {
  label: string;
  unit: string;
  quantity: number;
  /** Rounded on purpose: a visual estimate is never presented as an exact weight. */
  estimatedGrams: number;
}

export const GRAM_UNIT: IServingUnit = { unit: 'g', label: 'g', labelPlural: 'g', grams: 1, step: 10 };
export const ML_UNIT: IServingUnit = { unit: 'ml', label: 'ml', labelPlural: 'ml', grams: 1, step: 25 };

const LIQUID_TAGS = ['beverage', 'drink', 'liquid'];

/** Units a food can be measured in. Weight (or ml for drinks) is always available as a fallback. */
export function unitsForFood(food: { servingUnits?: IServingUnit[]; tags?: string[] }): IServingUnit[] {
  const natural = (food.servingUnits || []).filter((u) => u && u.unit && u.grams > 0 && u.unit !== 'g' && u.unit !== 'ml');
  const isLiquid = (food.tags || []).some((t) => LIQUID_TAGS.includes(t));
  return [...natural, isLiquid ? ML_UNIT : GRAM_UNIT];
}

/** Round an estimated weight to a "natural" granularity (never 347.82 g). */
export function roundEstimate(grams: number): number {
  if (!Number.isFinite(grams) || grams <= 0) return 0;
  if (grams < 20) return Math.round(grams);
  if (grams < 100) return Math.round(grams / 5) * 5;
  if (grams < 300) return Math.round(grams / 10) * 10;
  return Math.round(grams / 25) * 25;
}

export function gramsFor(quantity: number, unit: string, units: IServingUnit[]): number {
  const def = units.find((u) => u.unit === unit);
  if (!def) return 0;
  return Math.max(0, quantity) * def.grams;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export function macrosForGrams(grams: number, per100: Per100): Macros {
  const k = Math.max(0, grams) / 100;
  return {
    kcal: Math.round(per100.kcal * k),
    protein: r1(per100.protein * k),
    carbs: r1(per100.carbs * k),
    fat: r1(per100.fat * k),
    fiber: r1((per100.fiber ?? 0) * k),
  };
}

export function sumMacros(list: Macros[]): Macros {
  const t = list.reduce(
    (a, m) => ({ kcal: a.kcal + m.kcal, protein: a.protein + m.protein, carbs: a.carbs + m.carbs, fat: a.fat + m.fat, fiber: a.fiber + m.fiber }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
  );
  return { kcal: Math.round(t.kcal), protein: r1(t.protein), carbs: r1(t.carbs), fat: r1(t.fat), fiber: r1(t.fiber) };
}

function plural(def: IServingUnit, qty: number): string {
  return qty > 1 && def.labelPlural ? def.labelPlural : def.label;
}

function qtyText(qty: number): string {
  if (qty === 0.5) return '1/2';
  if (qty === 1.5) return '1,5';
  return String(qty).replace('.', ',');
}

export function portionLabel(qty: number, def: IServingUnit): string {
  if (def.unit === 'g' || def.unit === 'ml') return `${Math.round(qty)} ${def.unit}`;
  return `${qtyText(qty)} ${plural(def, qty)}`;
}

/**
 * Suggested portions. Countable units (egg, banana…) -> neighbours of the detected count.
 * Plate-like foods -> Petit / Moyen / Grand (catalog presets when present, else ±30-40% of the estimate).
 */
export function buildSuggestions(params: {
  units: IServingUnit[];
  unit: string;
  quantity: number;
  estimatedGrams: number;
  portionPresets?: { small: number; medium: number; large: number };
}): PortionSuggestion[] {
  const { units, unit, quantity, estimatedGrams, portionPresets } = params;
  const def = units.find((u) => u.unit === unit) || units[0];
  const out: PortionSuggestion[] = [];
  // `exact` = a catalog conversion (3 eggs x 55 g = 165 g); otherwise it is a visual estimate and gets rounded.
  const push = (label: string, u: IServingUnit, q: number, g: number, exact = false) => {
    if (!out.some((s) => s.unit === u.unit && s.quantity === q && s.label === label)) {
      out.push({ label, unit: u.unit, quantity: q, estimatedGrams: exact ? Math.round(g) : roundEstimate(g) });
    }
  };

  const isCount = def.unit === 'piece' || def.unit === 'slice' || def.unit === 'container' || def.unit === 'can' || def.unit === 'scoop';
  if (isCount) {
    const step = def.step && def.step < 1 ? def.step : 1;
    const around = new Set<number>();
    const base = Math.max(step, quantity);
    [base - 1, base, base + 1, 1, 2].forEach((q) => q >= step && around.add(q));
    if (step < 1) around.add(0.5);
    [...around]
      .sort((a, b) => a - b)
      .slice(0, 4)
      .forEach((q) => push(portionLabel(q, def), def, q, q * def.grams, true));
    return out;
  }

  if (portionPresets) {
    ([['Petit', portionPresets.small], ['Moyen', portionPresets.medium], ['Grand', portionPresets.large]] as const).forEach(([name, g]) =>
      push(`${name} ${roundEstimate(g)} ${def.unit === 'ml' ? 'ml' : 'g'}`, def.unit === 'ml' ? ML_UNIT : GRAM_UNIT, roundEstimate(g), g)
    );
    return out;
  }
  const g = estimatedGrams > 0 ? estimatedGrams : def.grams * Math.max(quantity, 1);
  ([['Petit', 0.7], ['Moyen', 1], ['Grand', 1.4]] as const).forEach(([name, f]) => {
    const rg = roundEstimate(g * f);
    push(`${name} ${rg} ${def.unit === 'ml' ? 'ml' : 'g'}`, def.unit === 'ml' ? ML_UNIT : GRAM_UNIT, rg, rg);
  });
  return out;
}

/**
 * Turns the AI's raw estimate into a consistent portion: countable units use the catalog gram weight
 * (2 eggs = 2 × 55 g), everything else keeps the AI's weight (clamped), always rounded as an estimate.
 */
export function resolvePortion(params: {
  units: IServingUnit[];
  aiUnit?: string;
  aiQuantity?: number;
  aiGrams?: number;
}): { unit: string; quantity: number; grams: number } {
  const { units, aiUnit, aiQuantity, aiGrams } = params;
  const def = aiUnit ? units.find((u) => u.unit === aiUnit) : undefined;
  const qty = Number.isFinite(aiQuantity) && (aiQuantity as number) > 0 ? (aiQuantity as number) : undefined;

  if (def && qty && def.unit !== 'g' && def.unit !== 'ml') {
    const countable = ['piece', 'slice', 'container', 'can', 'scoop'].includes(def.unit);
    const grams = countable || !aiGrams ? qty * def.grams : aiGrams;
    // Countable units are exact catalog arithmetic; a visual weight for a plate/bowl stays an estimate.
    return { unit: def.unit, quantity: qty, grams: countable || !aiGrams ? Math.round(grams) : roundEstimate(grams) };
  }
  const weightDef = units.find((u) => u.unit === 'g' || u.unit === 'ml') || GRAM_UNIT;
  const grams = aiGrams && aiGrams > 0 ? aiGrams : qty && def ? qty * def.grams : 100;
  return { unit: weightDef.unit, quantity: roundEstimate(grams), grams: roundEstimate(grams) };
}
