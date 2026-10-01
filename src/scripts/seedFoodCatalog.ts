/**
 * Applies data/foodCatalog.ts to the Foods collection.
 * Run: npm run seed:food-catalog            (dry run: npm run seed:food-catalog -- --dry)
 *
 * Safe on production: upserts by nameFr, never deletes. Existing foods keep their macros and only gain
 * names / aliases / serving units / search keys; new foods (Tunisian dishes…) are inserted with catalog values.
 */
import Food from '../models/Food.model';
import { CATALOG } from '../data/foodCatalog';
import { foodKeys } from '../lib/foodMatcher';
import { runSeed } from './runSeed';

export async function seedFoodCatalog(): Promise<void> {
  const dry = process.argv.includes('--dry');
  let inserted = 0;
  let updated = 0;
  for (const c of CATALOG) {
    const searchKeys = foodKeys({ nameFr: c.nameFr, nameAr: c.nameAr, nameEn: c.nameEn, nameLocal: c.nameLocal, synonyms: c.aliases });
    const exists = await Food.exists({ nameFr: c.nameFr });
    if (dry) {
      console.log(`${exists ? 'update' : 'insert'}  ${c.nameFr}  (${searchKeys.length} keys)`);
      exists ? updated++ : inserted++;
      continue;
    }
    const set: Record<string, unknown> = {
      nameAr: c.nameAr,
      nameEn: c.nameEn,
      nameLocal: c.nameLocal,
      searchKeys,
      cuisine: c.cuisine,
      defaultUnit: c.defaultUnit,
      servingUnits: c.units,
      portionPresets: c.presets,
      isDish: c.isDish,
      components: c.components,
    };
    Object.keys(set).forEach((k) => set[k] === undefined && delete set[k]);
    const res = await Food.updateOne(
      { nameFr: c.nameFr },
      {
        $set: set,
        $addToSet: { synonyms: { $each: c.aliases }, tags: { $each: c.tags } },
        // Nutrition only for NEW records: existing verified values are never overwritten.
        $setOnInsert: { nameFr: c.nameFr, macrosPer100g: c.per100, nutritionBasis: c.basis },
      },
      { upsert: true }
    );
    res.upsertedCount ? inserted++ : updated++;
  }
  console.log(`✅ Food catalog applied${dry ? ' (dry run)' : ''}: ${inserted} inserted, ${updated} updated.`);
}

if (require.main === module) {
  runSeed('food-catalog', seedFoodCatalog)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
