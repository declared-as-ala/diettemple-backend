/**
 * Maps an AI food label ("Couscous tunisien au poulet", "oeufs", "كسكسي") to a Food record.
 * Pure scoring (testable without a database) + a thin DB candidate loader.
 */
import Food from '../models/Food.model';

export function normalizeText(input: string): string {
  return (input || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // accents (Latin)
    .replace(/œ/g, 'oe')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ') // keep letters (incl. Arabic) and digits
    .replace(/\s+/g, ' ')
    .trim();
}

const STOP = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'au', 'aux', 'a', 'et', 'en', 'un', 'une', 'd', 'l', 'avec', 'the', 'of', 'with']);

function tokens(norm: string): string[] {
  return norm.split(' ').filter((t) => t && !STOP.has(t));
}

/** Basic plural folding so "oeufs" matches "oeuf", "dattes" -> "datte". */
function stem(t: string): string {
  return t.length > 3 && t.endsWith('s') ? t.slice(0, -1) : t;
}

export interface MatchableFood {
  _id?: unknown;
  nameFr: string;
  nameAr?: string;
  nameEn?: string;
  nameLocal?: string;
  synonyms?: string[];
  searchKeys?: string[];
  [k: string]: unknown;
}

export function foodKeys(food: MatchableFood): string[] {
  const raw = [food.nameFr, food.nameAr, food.nameEn, food.nameLocal, ...(food.synonyms || []), ...(food.searchKeys || [])];
  return [...new Set(raw.filter(Boolean).map((k) => normalizeText(String(k))).filter(Boolean))];
}

/** 0..1. 1 = same name/alias; lower = partial overlap. */
export function scoreMatch(query: string, food: MatchableFood): number {
  const q = normalizeText(query);
  if (!q) return 0;
  const qTokens = tokens(q).map(stem);
  const qSet = new Set(qTokens);
  let best = 0;
  for (const key of foodKeys(food)) {
    if (key === q) return 1;
    const kTokens = tokens(key).map(stem);
    if (kTokens.length === 0 || qTokens.length === 0) continue;
    if (kTokens.join(' ') === qTokens.join(' ')) {
      best = Math.max(best, 0.98);
      continue;
    }
    const kSet = new Set(kTokens);
    const inter = [...qSet].filter((t) => kSet.has(t)).length;
    if (inter === 0) continue;
    const qCover = inter / qSet.size; // how much of the query the key explains
    const kCover = inter / kSet.size; // how much of the key appears in the query
    let score: number;
    if (qCover === 1) score = 0.8 + 0.15 * kCover; // query ⊂ key ("oeuf" -> "oeuf entier")
    else if (kCover === 1) score = 0.55 + 0.3 * qCover; // key ⊂ query ("couscous tunisien" ⊃ "couscous")
    else score = 0.7 * (inter / (qSet.size + kSet.size - inter));
    best = Math.max(best, score);
  }
  return Math.round(best * 100) / 100;
}

export interface RankedFood<T> {
  food: T;
  score: number;
}

export function rankFoods<T extends MatchableFood>(query: string, foods: T[], limit = 4): RankedFood<T>[] {
  return foods
    .map((food) => ({ food, score: scoreMatch(query, food) }))
    .filter((r) => r.score >= 0.35)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** Minimum score to treat a match as a trustworthy database match (otherwise nutrition is flagged as estimated). */
export const MATCH_THRESHOLD = 0.6;

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Loads a small candidate set from MongoDB for one label; scoring is done in memory. */
export async function loadCandidates(label: string): Promise<any[]> {
  const norm = normalizeText(label);
  const toks = tokens(norm).filter((t) => t.length >= 3 || /[؀-ۿ]/.test(t));
  if (!norm) return [];
  const regexes = toks.slice(0, 6).map((t) => new RegExp(escapeRegex(stem(t)), 'i'));
  const or: any[] = [{ searchKeys: norm }];
  for (const re of regexes) {
    or.push({ searchKeys: re }, { nameFr: re }, { synonyms: re });
  }
  return Food.find({ $or: or }).limit(60).lean();
}

export async function matchFood(label: string): Promise<RankedFood<any>[]> {
  return rankFoods(label, await loadCandidates(label), 4);
}
