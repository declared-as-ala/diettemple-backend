import { calculateIngredientMatch, normalizeIngredientName } from './recipeFilter.service';

describe('recipeFilter.service', () => {
  it('should normalize ingredient names', () => {
    expect(normalizeIngredientName('  Œufs  ')).toBe('oeuf');
    expect(normalizeIngredientName('RIZ')).toBe('riz');
    expect(normalizeIngredientName('tomates')).toBe('tomate');
  });

  it('should match all ingredients', () => {
    const match = calculateIngredientMatch(
      [
        { name: 'Poulet', normalizedName: 'poulet' },
        { name: 'Riz', normalizedName: 'riz' },
      ],
      ['poulet', 'riz']
    );
    expect(match.matchPercentage).toBe(100);
    expect(match.missingCount).toBe(0);
  });

  it('should match partial ingredients', () => {
    const match = calculateIngredientMatch(
      [
        { name: 'Poulet', normalizedName: 'poulet' },
        { name: 'Riz', normalizedName: 'riz' },
        { name: 'Brocoli', normalizedName: 'brocoli' },
      ],
      ['poulet', 'riz']
    );
    expect(match.availableCount).toBe(2);
    expect(match.missingCount).toBe(1);
    expect(match.missingIngredients[0]).toBe('brocoli');
  });
});
