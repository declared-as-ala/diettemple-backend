import assert from 'node:assert/strict';
import { calculateIngredientMatch, normalizeIngredientName } from './recipeFilter.service';

function testNormalize() {
  assert.equal(normalizeIngredientName('  Œufs  '), 'oeuf');
  assert.equal(normalizeIngredientName('RIZ'), 'riz');
  assert.equal(normalizeIngredientName('tomates'), 'tomate');
}

function testIngredientMatchAll() {
  const match = calculateIngredientMatch(
    [
      { name: 'Poulet', normalizedName: 'poulet' },
      { name: 'Riz', normalizedName: 'riz' },
    ],
    ['poulet', 'riz']
  );
  assert.equal(match.matchPercentage, 100);
  assert.equal(match.missingCount, 0);
}

function testIngredientMatchPartial() {
  const match = calculateIngredientMatch(
    [
      { name: 'Poulet', normalizedName: 'poulet' },
      { name: 'Riz', normalizedName: 'riz' },
      { name: 'Brocoli', normalizedName: 'brocoli' },
    ],
    ['poulet', 'riz']
  );
  assert.equal(match.availableCount, 2);
  assert.equal(match.missingCount, 1);
  assert.equal(match.missingIngredients[0], 'brocoli');
}

function run() {
  testNormalize();
  testIngredientMatchAll();
  testIngredientMatchPartial();
  console.log('recipeFilter.service tests passed');
}

run();

