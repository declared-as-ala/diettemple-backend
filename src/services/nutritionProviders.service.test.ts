import { describe, expect, it } from '@jest/globals';
import { normalizeBarcode } from './nutritionProviders.service';

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
