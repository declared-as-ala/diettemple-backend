/**
 * Server-only nutrition provider adapters. Provider credentials never reach mobile clients.
 * Open Food Facts is used only for packaged barcode products; generic/Tunisian foods stay in
 * the curated DietTemple catalog so their origin and confidence remain explicit.
 */

export type BarcodeProduct = {
  barcode: string;
  name: string;
  brand?: string;
  imageUrl?: string;
  servingSize?: string;
  basis: '100g' | '100ml';
  macrosPer100: { kcal: number; protein: number; carbs: number; fat: number; fiber?: number };
  source: 'open_food_facts';
};

const TIMEOUT_MS = Math.min(Math.max(Number(process.env.OPEN_FOOD_FACTS_TIMEOUT_MS) || 6500, 1000), 15000);
const USER_AGENT = process.env.OPEN_FOOD_FACTS_USER_AGENT || 'DietTemple/1.0 (support@diettemple.app)';
const inflight = new Map<string, Promise<BarcodeProduct | null>>();

const num = (value: unknown): number | undefined => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

/** EAN-8/EAN-13/UPC-A/GTIN-14 only. The provider normalizes leading zeroes itself. */
export function normalizeBarcode(value: string): string | null {
  const code = String(value || '').replace(/\D/g, '');
  return code.length >= 8 && code.length <= 14 ? code : null;
}

async function requestOpenFoodFacts(barcode: string): Promise<BarcodeProduct | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const fields = 'code,product_name,product_name_fr,brands,image_front_url,serving_size,nutrition_data_per,nutriments';
    const response = await fetch(
      `https://world.openfoodfacts.org/api/v3/product/${encodeURIComponent(barcode)}?fields=${encodeURIComponent(fields)}`,
      { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: controller.signal }
    );
    if (!response.ok) return null;
    const data: any = await response.json();
    if (data?.status !== 1 || !data.product) return null;
    const product = data.product;
    const nutriments = product.nutriments || {};
    const kcal = num(nutriments['energy-kcal_100g'] ?? nutriments['energy-kcal_value'] ?? nutriments.energy_kcal_100g);
    const protein = num(nutriments.proteins_100g);
    const carbs = num(nutriments.carbohydrates_100g);
    const fat = num(nutriments.fat_100g);
    const fiber = num(nutriments.fiber_100g);
    if (kcal == null || protein == null || carbs == null || fat == null) return null;
    const name = String(product.product_name_fr || product.product_name || '').trim();
    if (!name) return null;
    return {
      barcode: String(product.code || barcode),
      name,
      ...(String(product.brands || '').trim() ? { brand: String(product.brands).trim() } : {}),
      ...(String(product.image_front_url || '').trim() ? { imageUrl: String(product.image_front_url).trim() } : {}),
      ...(String(product.serving_size || '').trim() ? { servingSize: String(product.serving_size).trim() } : {}),
      basis: product.nutrition_data_per === '100ml' ? '100ml' : '100g',
      macrosPer100: { kcal, protein, carbs, fat, ...(fiber != null ? { fiber } : {}) },
      source: 'open_food_facts',
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export function lookupBarcode(barcodeInput: string): Promise<BarcodeProduct | null> {
  const barcode = normalizeBarcode(barcodeInput);
  if (!barcode) return Promise.resolve(null);
  const existing = inflight.get(barcode);
  if (existing) return existing;
  const request = requestOpenFoodFacts(barcode).finally(() => inflight.delete(barcode));
  inflight.set(barcode, request);
  return request;
}
