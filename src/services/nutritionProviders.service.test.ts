import { describe, expect, it } from '@jest/globals';
import { lookupBarcode, normalizeBarcode } from './nutritionProviders.service';

describe('barcode normalization', () => {
  it('accepts EAN/UPC/GTIN scans and strips scanner formatting', () => {
    expect(normalizeBarcode(' 3017-6240 10701 ')).toBe('3017624010701');
    expect(normalizeBarcode('01234567')).toBe('01234567');
    expect(normalizeBarcode('00012345678905')).toBe('00012345678905');
  });

  it('rejects codes that cannot be a packaged-food barcode', () => {
    expect(normalizeBarcode('1234')).toBeNull();
    expect(normalizeBarcode('')).toBeNull();
    expect(normalizeBarcode('123456789012345')).toBeNull();
  });
});

describe('Open Food Facts v3 responses', () => {
  it('accepts the current string success status', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'success',
        product: {
          code: '6194043001668',
          product_name_fr: 'Lait demi écrémé UHT',
          nutrition_data_per: '100g',
          nutriments: {
            'energy-kcal_100g': 43.5,
            proteins_100g: 3,
            carbohydrates_100g: 4.5,
            fat_100g: 1.5,
          },
        },
      }),
    } as Response);

    await expect(lookupBarcode('6194043001668')).resolves.toMatchObject({
      barcode: '6194043001668',
      name: 'Lait demi écrémé UHT',
      macrosPer100: { kcal: 43.5, protein: 3, carbs: 4.5, fat: 1.5 },
    });
    global.fetch = originalFetch;
  });
});
