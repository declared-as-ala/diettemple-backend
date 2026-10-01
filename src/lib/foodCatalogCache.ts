import Food from '../models/Food.model';

let cache: { at: number; names: string[] } | null = null;
const TTL_MS = 10 * 60 * 1000;

/** Tunisian dish names currently in the database; fed to the vision prompt so it can grow with the data. */
export async function getKnownTunisianDishes(): Promise<string[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.names;
  try {
    const rows = await Food.find({ cuisine: 'tunisian', isDish: true }).select('nameFr nameLocal').limit(120).lean();
    const names = rows.flatMap((r: any) => [r.nameFr, r.nameLocal].filter(Boolean));
    cache = { at: Date.now(), names: [...new Set(names as string[])] };
    return cache.names;
  } catch {
    return [];
  }
}
