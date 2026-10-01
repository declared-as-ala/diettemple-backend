/**
 * Food catalog = the data layer of the meal scanner (names in several languages, aliases,
 * natural serving units and gram equivalents, nutrition).
 *
 * - Applied to MongoDB by `npm run seed:food-catalog` (idempotent upserts; never deletes anything).
 * - Existing foods are matched by `nameFr` and only receive extra metadata (names, units, aliases);
 *   their macros are NOT overwritten. New foods get these values.
 * - `basis: 'estimated'` = typical home-cooked average for composed dishes. These are NOT verified
 *   composition-table values and are shown to the user as estimates. Edit/extend here (or in the DB);
 *   nothing about foods is hardcoded in the mobile app.
 */
import type { IServingUnit } from '../models/Food.model';

export interface CatalogFood {
  nameFr: string;
  nameAr?: string;
  nameEn?: string;
  nameLocal?: string;
  aliases: string[];
  cuisine?: 'tunisian' | 'international';
  tags: string[];
  /** per 100 g (or 100 ml) */
  per100: { kcal: number; protein: number; carbs: number; fat: number; fiber?: number };
  defaultUnit?: string;
  units?: IServingUnit[];
  presets?: { small: number; medium: number; large: number };
  isDish?: boolean;
  components?: string[];
  basis: 'reference' | 'estimated';
}

const u = (unit: string, label: string, labelPlural: string, grams: number, step?: number): IServingUnit => ({
  unit,
  label,
  labelPlural,
  grams,
  ...(step ? { step } : {}),
});

export const CATALOG: CatalogFood[] = [
  // ───────────── Everyday foods (metadata overlay on existing records) ─────────────
  {
    nameFr: 'Œuf entier', nameAr: 'بيضة', nameEn: 'Egg', nameLocal: 'Bidh',
    aliases: ['oeuf', 'oeufs', 'œufs', 'egg', 'eggs', 'بيض', 'بيضة', 'bidha', 'bidh', 'oeuf dur', 'oeuf au plat', 'oeuf cuit'],
    cuisine: 'international', tags: ['protein'], per100: { kcal: 155, protein: 13, carbs: 1, fat: 11 },
    defaultUnit: 'piece', units: [u('piece', 'œuf', 'œufs', 55, 1)], basis: 'reference',
  },
  {
    nameFr: 'Banane', nameAr: 'موز', nameEn: 'Banana', aliases: ['banane', 'bananes', 'banana', 'موز', 'mouz'],
    cuisine: 'international', tags: ['fruit', 'carb'], per100: { kcal: 89, protein: 1, carbs: 23, fat: 0, fiber: 2.6 },
    defaultUnit: 'piece', units: [u('piece', 'banane', 'bananes', 120, 0.5)], basis: 'reference',
  },
  {
    nameFr: 'Pomme', nameAr: 'تفاح', nameEn: 'Apple', aliases: ['pomme', 'pommes', 'apple', 'تفاح', 'tfeh', 'tefah'],
    cuisine: 'international', tags: ['fruit'], per100: { kcal: 52, protein: 0, carbs: 14, fat: 0, fiber: 2.4 },
    defaultUnit: 'piece', units: [u('piece', 'pomme', 'pommes', 180, 0.5)], basis: 'reference',
  },
  {
    nameFr: 'Orange', nameAr: 'برتقال', nameEn: 'Orange', aliases: ['orange', 'oranges', 'برتقال', 'bortokal'],
    cuisine: 'international', tags: ['fruit'], per100: { kcal: 47, protein: 1, carbs: 12, fat: 0, fiber: 2.4 },
    defaultUnit: 'piece', units: [u('piece', 'orange', 'oranges', 150, 0.5)], basis: 'reference',
  },
  {
    nameFr: 'Dattes', nameAr: 'تمر', nameEn: 'Dates', nameLocal: 'Tmar', aliases: ['datte', 'dattes', 'date', 'dates', 'تمر', 'tmar', 'deglet nour', 'deglet', 'تمرة'],
    cuisine: 'tunisian', tags: ['fruit', 'carb'], per100: { kcal: 282, protein: 2, carbs: 75, fat: 0, fiber: 8 },
    defaultUnit: 'piece', units: [u('piece', 'datte', 'dattes', 8, 1)], basis: 'reference',
  },
  {
    nameFr: 'Olives', nameAr: 'زيتون', nameEn: 'Olives', nameLocal: 'Zitoun', aliases: ['olive', 'olives', 'zitoun', 'زيتون', 'olive noire', 'olive verte'],
    cuisine: 'tunisian', tags: ['fat', 'vegetable'], per100: { kcal: 115, protein: 1, carbs: 6, fat: 11, fiber: 3 },
    defaultUnit: 'piece', units: [u('piece', 'olive', 'olives', 4, 1)], basis: 'reference',
  },
  {
    nameFr: 'Pain complet', nameAr: 'خبز كامل', nameEn: 'Wholemeal bread', aliases: ['pain', 'tranche de pain', 'pain de mie', 'toast', 'bread', 'خبز'],
    cuisine: 'international', tags: ['carb', 'grain'], per100: { kcal: 247, protein: 13, carbs: 41, fat: 3 },
    defaultUnit: 'slice', units: [u('slice', 'tranche', 'tranches', 30, 1)], basis: 'reference',
  },
  {
    nameFr: 'Thon au naturel', nameAr: 'تن', nameEn: 'Tuna', nameLocal: 'Tun', aliases: ['thon', 'tuna', 'تن', 'thon en boite', 'thon en boîte', 'boite de thon'],
    cuisine: 'international', tags: ['protein', 'fish'], per100: { kcal: 116, protein: 26, carbs: 0, fat: 1 },
    defaultUnit: 'can', units: [u('can', 'boîte', 'boîtes', 110, 0.5)], basis: 'reference',
  },
  {
    nameFr: 'Riz blanc cuit', nameAr: 'أرز', nameEn: 'White rice', nameLocal: 'Rouz', aliases: ['riz', 'rice', 'rouz', 'روز', 'أرز', 'riz cuit', 'riz blanc'],
    cuisine: 'international', tags: ['carb', 'grain'], per100: { kcal: 130, protein: 2, carbs: 28, fat: 0 },
    defaultUnit: 'bowl', units: [u('bowl', 'bol', 'bols', 200, 0.5), u('serving', 'portion', 'portions', 150, 0.5)], basis: 'reference',
  },
  {
    nameFr: 'Pâtes cuites', nameAr: 'معكرونة', nameEn: 'Cooked pasta', nameLocal: 'Makarouna', aliases: ['pates', 'pâtes', 'pasta', 'spaghetti', 'macaroni', 'makarouna', 'مقرونة', 'معكرونة'],
    cuisine: 'international', tags: ['carb', 'grain'], per100: { kcal: 131, protein: 5, carbs: 25, fat: 1 },
    defaultUnit: 'plate', units: [u('plate', 'assiette', 'assiettes', 250, 0.5), u('serving', 'portion', 'portions', 180, 0.5)],
    presets: { small: 150, medium: 250, large: 350 }, basis: 'reference',
  },
  {
    nameFr: 'Semoule cuite', nameAr: 'سميد', nameEn: 'Cooked semolina', aliases: ['semoule', 'semoule cuite', 'سميد'],
    cuisine: 'international', tags: ['carb', 'grain'], per100: { kcal: 112, protein: 4, carbs: 23, fat: 0 },
    defaultUnit: 'serving', units: [u('serving', 'portion', 'portions', 150, 0.5)], basis: 'reference',
  },
  {
    nameFr: 'Boulgour cuit', nameAr: 'برغل', nameEn: 'Cooked bulgur', nameLocal: 'Borghol', aliases: ['boulgour', 'borghol', 'bourghol', 'bulgur', 'برغل'],
    cuisine: 'tunisian', tags: ['carb', 'grain'], per100: { kcal: 83, protein: 3, carbs: 19, fat: 0, fiber: 4.5 },
    defaultUnit: 'serving', units: [u('serving', 'portion', 'portions', 150, 0.5), u('bowl', 'bol', 'bols', 200, 0.5)], basis: 'reference',
  },
  {
    nameFr: 'Poulet, blanc, grillé', nameAr: 'دجاج', nameEn: 'Grilled chicken breast', nameLocal: 'Djej', aliases: ['poulet', 'blanc de poulet', 'poulet grillé', 'chicken', 'djej', 'دجاج', 'escalope grillée'],
    cuisine: 'international', tags: ['protein', 'meat'], per100: { kcal: 165, protein: 31, carbs: 0, fat: 4 },
    defaultUnit: 'g', units: [u('piece', 'blanc', 'blancs', 130, 1)], basis: 'reference',
  },
  {
    nameFr: 'Steak de bœuf', nameAr: 'لحم بقري', nameEn: 'Beef steak', nameLocal: 'Lahm', aliases: ['steak', 'boeuf', 'bœuf', 'viande', 'viande rouge', 'beef', 'لحم'],
    cuisine: 'international', tags: ['protein', 'meat'], per100: { kcal: 271, protein: 26, carbs: 0, fat: 18 },
    defaultUnit: 'g', units: [u('piece', 'steak', 'steaks', 150, 1)], basis: 'reference',
  },
  {
    nameFr: 'Yaourt nature 0%', nameAr: 'ياوورت', nameEn: 'Plain yogurt', aliases: ['yaourt', 'yogourt', 'yogurt', 'yaourt nature', 'ياوورت', 'yaourt blanc'],
    cuisine: 'international', tags: ['protein', 'dairy'], per100: { kcal: 56, protein: 10, carbs: 4, fat: 0 },
    defaultUnit: 'container', units: [u('container', 'pot', 'pots', 125, 1)], basis: 'reference',
  },
  {
    nameFr: 'Lait demi-écrémé', nameAr: 'حليب', nameEn: 'Milk', nameLocal: 'Halib', aliases: ['lait', 'milk', 'halib', 'حليب', 'verre de lait'],
    cuisine: 'international', tags: ['dairy', 'beverage'], per100: { kcal: 47, protein: 3, carbs: 5, fat: 2 },
    defaultUnit: 'glass', units: [u('glass', 'verre', 'verres', 250, 1), u('cup', 'tasse', 'tasses', 200, 1)], basis: 'reference',
  },
  {
    nameFr: 'Whey protéine', nameAr: 'واي بروتين', nameEn: 'Whey protein', aliases: ['whey', 'protéine en poudre', 'proteine en poudre', 'protein powder', 'shaker whey'],
    cuisine: 'international', tags: ['protein', 'supplement'], per100: { kcal: 400, protein: 80, carbs: 8, fat: 6 },
    defaultUnit: 'scoop', units: [u('scoop', 'dosette', 'dosettes', 30, 1)], basis: 'reference',
  },
  {
    nameFr: 'Soupe de légumes', nameAr: 'شوربة خضر', nameEn: 'Vegetable soup', aliases: ['soupe', 'soupe de legumes', 'soup', 'شوربة'],
    cuisine: 'international', tags: ['vegetable'], per100: { kcal: 34, protein: 2, carbs: 6, fat: 0 },
    defaultUnit: 'bowl', units: [u('bowl', 'bol', 'bols', 300, 0.5)], basis: 'reference',
  },
  {
    nameFr: 'Pois chiches cuits', nameAr: 'حمص', nameEn: 'Chickpeas', nameLocal: 'Hamsa', aliases: ['pois chiches', 'chickpeas', 'hamsa', 'حمص', 'hummus'],
    cuisine: 'tunisian', tags: ['carb', 'protein', 'legume'], per100: { kcal: 164, protein: 9, carbs: 27, fat: 3, fiber: 7.6 },
    defaultUnit: 'g', units: [u('serving', 'portion', 'portions', 60, 0.5)], basis: 'reference',
  },
  {
    nameFr: 'Pomme de terre', nameAr: 'بطاطا', nameEn: 'Potato', nameLocal: 'Batata', aliases: ['patate', 'pommes de terre', 'potato', 'batata', 'بطاطا', 'pomme de terre cuite'],
    cuisine: 'international', tags: ['carb', 'vegetable'], per100: { kcal: 87, protein: 2, carbs: 20, fat: 0, fiber: 1.8 },
    defaultUnit: 'g', units: [u('piece', 'pomme de terre', 'pommes de terre', 150, 0.5)], basis: 'reference',
  },
  {
    nameFr: 'Carotte', nameAr: 'جزر', nameEn: 'Carrot', nameLocal: 'Zrodiya', aliases: ['carottes', 'carrot', 'جزر', 'zrodia'],
    cuisine: 'international', tags: ['vegetable'], per100: { kcal: 41, protein: 1, carbs: 10, fat: 0, fiber: 2.8 },
    defaultUnit: 'g', units: [u('piece', 'carotte', 'carottes', 70, 0.5)], basis: 'reference',
  },
  {
    nameFr: 'Tomate', nameAr: 'طماطم', nameEn: 'Tomato', nameLocal: 'Tmatem', aliases: ['tomates', 'tomato', 'tmatem', 'طماطم'],
    cuisine: 'international', tags: ['vegetable'], per100: { kcal: 18, protein: 1, carbs: 4, fat: 0, fiber: 1.2 },
    defaultUnit: 'g', units: [u('piece', 'tomate', 'tomates', 120, 0.5)], basis: 'reference',
  },

  // ───────────── Tunisian staples & ingredients ─────────────
  {
    nameFr: 'Couscous cuit', nameAr: 'كسكسي', nameEn: 'Cooked couscous', nameLocal: 'Kosksi',
    aliases: ['couscous', 'kosksi', 'koskssi', 'كسكسي', 'semoule de couscous', 'grain de couscous'],
    cuisine: 'tunisian', tags: ['carb', 'grain'], per100: { kcal: 112, protein: 4, carbs: 23, fat: 0.2, fiber: 1.4 },
    defaultUnit: 'plate', units: [u('plate', 'assiette', 'assiettes', 300, 0.5), u('bowl', 'bol', 'bols', 200, 0.5), u('serving', 'portion', 'portions', 150, 0.5)],
    presets: { small: 200, medium: 300, large: 450 }, basis: 'reference',
  },
  {
    nameFr: 'Harissa', nameAr: 'هريسة', nameEn: 'Harissa', nameLocal: 'Harissa', aliases: ['harissa tunisienne', 'harissa arbi', 'هريسة', 'piment harissa', 'sauce harissa'],
    cuisine: 'tunisian', tags: ['sauce'], per100: { kcal: 60, protein: 3, carbs: 8, fat: 2.5, fiber: 4 },
    defaultUnit: 'spoon', units: [u('spoon', 'cuillère à café', 'cuillères à café', 10, 1), u('spoon_soup', 'cuillère à soupe', 'cuillères à soupe', 18, 1)], basis: 'estimated',
  },
  {
    nameFr: 'Sauce tomate piquante', nameAr: 'صلصة', nameEn: 'Spicy tomato sauce', nameLocal: 'Marqa hamra', aliases: ['sauce tomate', 'sauce rouge', 'sauce couscous', 'sauce', 'bouillon', 'مرقة', 'salsa', 'sauce du couscous', 'sauce du plat'],
    cuisine: 'tunisian', tags: ['sauce'], per100: { kcal: 45, protein: 1.5, carbs: 6, fat: 1.8, fiber: 1.2 },
    defaultUnit: 'g', units: [u('serving', 'louche', 'louches', 80, 0.5)], basis: 'estimated',
  },
  {
    nameFr: 'Kesra', nameAr: 'كسرة', nameEn: 'Kesra bread', nameLocal: 'Kesra', aliases: ['kesra', 'khobz kesra', 'pain kesra', 'كسرة', 'pain tunisien', 'khobz arbi'],
    cuisine: 'tunisian', tags: ['carb', 'grain'], per100: { kcal: 260, protein: 8, carbs: 52, fat: 2 },
    defaultUnit: 'piece', units: [u('piece', 'galette', 'galettes', 100, 0.5), u('slice', 'part', 'parts', 40, 1)], basis: 'estimated',
  },
  {
    nameFr: 'Pain tabouna', nameAr: 'طابونة', nameEn: 'Tabouna bread', nameLocal: 'Tabouna', aliases: ['tabouna', 'pain tabouna', 'khobz tabouna', 'طابونة', 'pain au four traditionnel'],
    cuisine: 'tunisian', tags: ['carb', 'grain'], per100: { kcal: 270, protein: 8, carbs: 53, fat: 2.5 },
    defaultUnit: 'piece', units: [u('piece', 'pain', 'pains', 100, 0.5), u('slice', 'part', 'parts', 40, 1)], basis: 'estimated',
  },
  {
    nameFr: 'Baguette', nameAr: 'باقيت', nameEn: 'Baguette', nameLocal: 'Baguette', aliases: ['baguette', 'pain baguette', 'باقيت', 'khobz baguette', 'pain blanc'],
    cuisine: 'tunisian', tags: ['carb', 'grain'], per100: { kcal: 270, protein: 9, carbs: 55, fat: 1.2, fiber: 2.5 },
    defaultUnit: 'slice', units: [u('slice', 'tranche', 'tranches', 30, 1), u('piece', 'baguette', 'baguettes', 250, 0.25)], basis: 'reference',
  },
  {
    nameFr: 'Salade mechouia', nameAr: 'سلاطة مشوية', nameEn: 'Mechouia salad (grilled pepper salad)', nameLocal: 'Slata mechouia',
    aliases: ['mechouia', 'salade mechouia', 'slata mechouia', 'felfel mechoui', 'felfel mechouia', 'poivrons grillés', 'salade de poivrons grillés', 'سلاطة مشوية', 'مشوية'],
    cuisine: 'tunisian', tags: ['vegetable', 'salad'], per100: { kcal: 70, protein: 1.5, carbs: 6, fat: 4.5, fiber: 2 },
    isDish: true, defaultUnit: 'serving', units: [u('serving', 'portion', 'portions', 120, 0.5), u('bowl', 'bol', 'bols', 150, 0.5)], basis: 'estimated',
  },
  {
    nameFr: 'Salade tunisienne', nameAr: 'سلاطة تونسية', nameEn: 'Tunisian salad', nameLocal: 'Slata tounsia',
    aliases: ['slata tounsia', 'slata tunisienne', 'salade tunisienne', 'salade de tomates concombres', 'salade tomate oignon', 'salade', 'سلاطة'],
    cuisine: 'tunisian', tags: ['vegetable', 'salad'], per100: { kcal: 55, protein: 1, carbs: 5, fat: 3.5, fiber: 1.5 },
    isDish: true, defaultUnit: 'bowl', units: [u('bowl', 'bol', 'bols', 150, 0.5), u('serving', 'portion', 'portions', 120, 0.5)], basis: 'estimated',
  },

  // ───────────── Tunisian dishes ─────────────
  {
    nameFr: 'Couscous tunisien au poulet', nameAr: 'كسكسي بالدجاج', nameEn: 'Tunisian couscous with chicken', nameLocal: 'Kosksi bel djej',
    aliases: ['couscous tunisien', 'couscous poulet', 'couscous au poulet', 'couscous aux légumes', 'couscous legumes', 'couscous tunisien aux légumes', 'kosksi', 'كسكسي بالدجاج', 'couscous complet'],
    cuisine: 'tunisian', tags: ['dish', 'carb', 'protein'], per100: { kcal: 150, protein: 8.5, carbs: 20, fat: 4 },
    isDish: true, defaultUnit: 'plate', units: [u('plate', 'assiette', 'assiettes', 350, 0.5), u('serving', 'portion', 'portions', 300, 0.5)],
    presets: { small: 250, medium: 350, large: 500 }, components: ['Couscous cuit', 'Poulet', 'Pois chiches cuits', 'Carotte', 'Pomme de terre', 'Sauce tomate piquante'], basis: 'estimated',
  },
  {
    nameFr: 'Couscous tunisien à la viande', nameAr: 'كسكسي باللحم', nameEn: 'Tunisian couscous with lamb/beef', nameLocal: 'Kosksi bel lahm',
    aliases: ['couscous viande', 'couscous à la viande', 'couscous agneau', 'couscous au mouton', 'couscous aux boulettes', 'kosksi bel lahm', 'كسكسي باللحم', 'couscous au bœuf'],
    cuisine: 'tunisian', tags: ['dish', 'carb', 'protein'], per100: { kcal: 165, protein: 9, carbs: 19, fat: 6 },
    isDish: true, defaultUnit: 'plate', units: [u('plate', 'assiette', 'assiettes', 350, 0.5), u('serving', 'portion', 'portions', 300, 0.5)],
    presets: { small: 250, medium: 350, large: 500 }, components: ['Couscous cuit', 'Steak de bœuf', 'Pois chiches cuits', 'Carotte', 'Pomme de terre', 'Sauce tomate piquante'], basis: 'estimated',
  },
  {
    nameFr: 'Couscous tunisien au poisson', nameAr: 'كسكسي بالحوت', nameEn: 'Tunisian fish couscous', nameLocal: 'Kosksi bel hout',
    aliases: ['couscous poisson', 'couscous au poisson', 'couscous aux fruits de mer', 'kosksi bel hout', 'كسكسي بالحوت', 'couscous au mérou'],
    cuisine: 'tunisian', tags: ['dish', 'carb', 'protein', 'fish'], per100: { kcal: 140, protein: 9, carbs: 18, fat: 4 },
    isDish: true, defaultUnit: 'plate', units: [u('plate', 'assiette', 'assiettes', 380, 0.5), u('serving', 'portion', 'portions', 300, 0.5)],
    presets: { small: 270, medium: 380, large: 520 }, components: ['Couscous cuit', 'Poisson', 'Pois chiches cuits', 'Pomme de terre', 'Sauce tomate piquante'], basis: 'estimated',
  },
  {
    nameFr: 'Ojja merguez', nameAr: 'عجة مرقاز', nameEn: 'Ojja with merguez', nameLocal: 'Ojja merguez',
    aliases: ['ojja', 'ojja oeufs', 'ojja œufs', 'ojja aux oeufs', 'ojja merguez', 'عجة', 'عجة مرقاز', 'ojja saucisse', 'chakchouka merguez'],
    cuisine: 'tunisian', tags: ['dish', 'protein'], per100: { kcal: 190, protein: 10, carbs: 5, fat: 14 },
    isDish: true, defaultUnit: 'serving', units: [u('serving', 'portion', 'portions', 250, 0.5), u('plate', 'assiette', 'assiettes', 300, 0.5)],
    presets: { small: 180, medium: 250, large: 350 }, components: ['Œuf entier', 'Merguez', 'Sauce tomate piquante'], basis: 'estimated',
  },
  {
    nameFr: 'Ojja fruits de mer', nameAr: 'عجة فواكه البحر', nameEn: 'Ojja with seafood', nameLocal: 'Ojja fruits de mer',
    aliases: ['ojja crevettes', 'ojja fruits de mer', 'ojja poisson', 'عجة بالقمبري', 'ojja aux crevettes'],
    cuisine: 'tunisian', tags: ['dish', 'protein', 'fish'], per100: { kcal: 150, protein: 12, carbs: 5, fat: 9 },
    isDish: true, defaultUnit: 'serving', units: [u('serving', 'portion', 'portions', 250, 0.5)],
    presets: { small: 180, medium: 250, large: 350 }, basis: 'estimated',
  },
  {
    nameFr: 'Shakshouka', nameAr: 'شكشوكة', nameEn: 'Shakshouka', nameLocal: 'Chakchouka',
    aliases: ['chakchouka', 'chakchouka tunisienne', 'shakshuka', 'شكشوكة', 'chakchouka aux oeufs', 'oeufs à la tomate'],
    cuisine: 'tunisian', tags: ['dish', 'protein', 'vegetable'], per100: { kcal: 105, protein: 6, carbs: 6, fat: 6 },
    isDish: true, defaultUnit: 'serving', units: [u('serving', 'portion', 'portions', 250, 0.5)],
    presets: { small: 180, medium: 250, large: 350 }, basis: 'estimated',
  },
  {
    nameFr: 'Lablabi', nameAr: 'لبلابي', nameEn: 'Lablabi (chickpea soup)', nameLocal: 'Lablabi',
    aliases: ['lablabi', 'lablebi', 'لبلابي', 'soupe de pois chiches', 'lablabi tunisien'],
    cuisine: 'tunisian', tags: ['dish', 'legume', 'carb'], per100: { kcal: 110, protein: 5, carbs: 15, fat: 3.5, fiber: 4 },
    isDish: true, defaultUnit: 'bowl', units: [u('bowl', 'bol', 'bols', 400, 0.5), u('serving', 'portion', 'portions', 350, 0.5)],
    presets: { small: 300, medium: 400, large: 550 }, components: ['Pois chiches cuits', 'Pain', 'Œuf entier', 'Harissa'], basis: 'estimated',
  },
  {
    nameFr: 'Brik à l\'œuf', nameAr: 'بريك بالبيض', nameEn: 'Egg brik', nameLocal: 'Brik bel bidh',
    aliases: ['brik', 'brik oeuf', 'brik à l\'oeuf', 'brik a l\'oeuf', 'brik à l\'œuf', 'brik tunisien', 'بريك', 'بريك بالبيض', 'brick', 'brik viande', 'brik au thon et oeuf'],
    cuisine: 'tunisian', tags: ['dish', 'protein', 'fried'], per100: { kcal: 250, protein: 10, carbs: 20, fat: 14 },
    isDish: true, defaultUnit: 'piece', units: [u('piece', 'brik', 'briks', 110, 1)], components: ['Œuf entier', 'Thon au naturel'], basis: 'estimated',
  },
  {
    nameFr: 'Brik au thon', nameAr: 'بريك بالتن', nameEn: 'Tuna brik', nameLocal: 'Brik bel tun',
    aliases: ['brik thon', 'brik au thon', 'بريك بالتن', 'brik thon oeuf', 'brik au thon et fromage'],
    cuisine: 'tunisian', tags: ['dish', 'protein', 'fried'], per100: { kcal: 260, protein: 12, carbs: 20, fat: 14 },
    isDish: true, defaultUnit: 'piece', units: [u('piece', 'brik', 'briks', 120, 1)], basis: 'estimated',
  },
  {
    nameFr: 'Brik au fromage', nameAr: 'بريك بالجبن', nameEn: 'Cheese brik', nameLocal: 'Brik bel jben',
    aliases: ['brik fromage', 'brik au fromage', 'بريك بالجبن', 'brik jben'],
    cuisine: 'tunisian', tags: ['dish', 'fried'], per100: { kcal: 280, protein: 10, carbs: 22, fat: 16 },
    isDish: true, defaultUnit: 'piece', units: [u('piece', 'brik', 'briks', 100, 1)], basis: 'estimated',
  },
  {
    nameFr: 'Mlawi', nameAr: 'ملاوي', nameEn: 'Mlawi (Tunisian flatbread)', nameLocal: 'Mlewi',
    aliases: ['mlewi', 'mlawi', 'mlaoui', 'mlawi tunisien', 'ملاوي', 'mlawi garni', 'mlawi thon', 'mlawi fromage'],
    cuisine: 'tunisian', tags: ['dish', 'carb'], per100: { kcal: 280, protein: 7, carbs: 42, fat: 9 },
    isDish: true, defaultUnit: 'piece', units: [u('piece', 'mlawi', 'mlawis', 120, 0.5)], basis: 'estimated',
  },
  {
    nameFr: 'Chapati tunisien', nameAr: 'شاباتي', nameEn: 'Tunisian chapati (sandwich)', nameLocal: 'Chapati',
    aliases: ['chapati', 'chapati tunisien', 'chapati poulet', 'chapati thon', 'شاباتي', 'sandwich chapati', 'chapati garni'],
    cuisine: 'tunisian', tags: ['dish', 'carb'], per100: { kcal: 240, protein: 9, carbs: 28, fat: 10 },
    isDish: true, defaultUnit: 'piece', units: [u('piece', 'chapati', 'chapatis', 250, 0.5)], basis: 'estimated',
  },
  {
    nameFr: 'Fricassé tunisien', nameAr: 'فريكاسي', nameEn: 'Fricassé (fried sandwich)', nameLocal: 'Fricassé',
    aliases: ['fricasse', 'fricassé', 'fricassé tunisien', 'فريكاسي', 'fricassés', 'petit pain frit'],
    cuisine: 'tunisian', tags: ['dish', 'carb', 'fried'], per100: { kcal: 290, protein: 9, carbs: 33, fat: 13 },
    isDish: true, defaultUnit: 'piece', units: [u('piece', 'fricassé', 'fricassés', 130, 1)], basis: 'estimated',
  },
  {
    nameFr: 'Kafteji', nameAr: 'كفتاجي', nameEn: 'Kafteji', nameLocal: 'Kafteji',
    aliases: ['kafteji', 'kaftaji', 'كفتاجي', 'kafteji tunisien', 'legumes frits aux oeufs'],
    cuisine: 'tunisian', tags: ['dish', 'vegetable', 'fried'], per100: { kcal: 140, protein: 4, carbs: 10, fat: 9 },
    isDish: true, defaultUnit: 'serving', units: [u('serving', 'portion', 'portions', 250, 0.5)],
    presets: { small: 180, medium: 250, large: 350 }, basis: 'estimated',
  },
  {
    nameFr: 'Chorba frik', nameAr: 'شربة فريك', nameEn: 'Chorba frik (green wheat soup)', nameLocal: 'Chorba frik',
    aliases: ['chorba', 'chorba frik', 'chorba tunisienne', 'شربة فريك', 'شربة', 'chorba orge', 'chorba lssan', 'soupe tunisienne', 'chorba viande'],
    cuisine: 'tunisian', tags: ['dish', 'soup'], per100: { kcal: 60, protein: 4, carbs: 7, fat: 2 },
    isDish: true, defaultUnit: 'bowl', units: [u('bowl', 'bol', 'bols', 300, 0.5), u('serving', 'portion', 'portions', 300, 0.5)],
    presets: { small: 200, medium: 300, large: 400 }, basis: 'estimated',
  },
  {
    nameFr: 'Tajine tunisien', nameAr: 'طاجين', nameEn: 'Tunisian tajine (baked egg & meat)', nameLocal: 'Tajine',
    aliases: ['tajine', 'tajine tunisien', 'tajine poulet', 'tajine viande', 'طاجين', 'tajine au fromage', 'tajine malsouka', 'tajine jben'],
    cuisine: 'tunisian', tags: ['dish', 'protein'], per100: { kcal: 190, protein: 13, carbs: 6, fat: 13 },
    isDish: true, defaultUnit: 'piece', units: [u('piece', 'part', 'parts', 150, 1), u('serving', 'portion', 'portions', 150, 0.5)],
    presets: { small: 100, medium: 150, large: 220 }, basis: 'estimated',
  },
  {
    nameFr: 'Marqa tunisienne', nameAr: 'مرقة', nameEn: 'Marqa (Tunisian stew)', nameLocal: 'Marqa',
    aliases: ['marqa', 'marka', 'مرقة', 'marqa tunisienne', 'marqa poulet', 'marqa viande', 'ragoût tunisien', 'ragout tunisien'],
    cuisine: 'tunisian', tags: ['dish', 'protein'], per100: { kcal: 95, protein: 7, carbs: 7, fat: 4 },
    isDish: true, defaultUnit: 'serving', units: [u('serving', 'portion', 'portions', 300, 0.5), u('bowl', 'bol', 'bols', 300, 0.5)],
    presets: { small: 200, medium: 300, large: 420 }, basis: 'estimated',
  },
  {
    nameFr: 'Kamounia', nameAr: 'كمونية', nameEn: 'Kamounia (cumin stew)', nameLocal: 'Kamounia',
    aliases: ['kamounia', 'kamouniya', 'كمونية', 'kamounia viande', 'kamounia foie'],
    cuisine: 'tunisian', tags: ['dish', 'protein'], per100: { kcal: 140, protein: 11, carbs: 4, fat: 9 },
    isDish: true, defaultUnit: 'serving', units: [u('serving', 'portion', 'portions', 250, 0.5)],
    presets: { small: 180, medium: 250, large: 350 }, basis: 'estimated',
  },
  {
    nameFr: 'Spaghetti tunisien', nameAr: 'سباغيتي', nameEn: 'Tunisian spaghetti (tomato & meat sauce)', nameLocal: 'Makarouna bel salsa',
    aliases: ['makarouna salsa', 'makarouna bel salsa', 'spaghetti tunisien', 'spaghetti sauce tomate', 'macaroni sauce', 'spaghetti salsa', 'مقرونة بالصلصة', 'pâtes à la sauce tomate', 'pates sauce tomate', 'makrouna'],
    cuisine: 'tunisian', tags: ['dish', 'carb'], per100: { kcal: 150, protein: 6, carbs: 22, fat: 4 },
    isDish: true, defaultUnit: 'plate', units: [u('plate', 'assiette', 'assiettes', 300, 0.5), u('serving', 'portion', 'portions', 250, 0.5)],
    presets: { small: 200, medium: 300, large: 420 }, basis: 'estimated',
  },
  {
    nameFr: 'Bambalouni', nameAr: 'بمبلوني', nameEn: 'Bambalouni (Tunisian doughnut)', nameLocal: 'Bambalouni',
    aliases: ['bambalouni', 'bambaloni', 'bambalouni tunisien', 'بمبلوني', 'beignet tunisien', 'yoyo'],
    cuisine: 'tunisian', tags: ['dish', 'dessert', 'fried'], per100: { kcal: 380, protein: 6, carbs: 48, fat: 18 },
    isDish: true, defaultUnit: 'piece', units: [u('piece', 'bambalouni', 'bambalounis', 60, 1)], basis: 'estimated',
  },
  {
    nameFr: 'Makroudh', nameAr: 'مقروض', nameEn: 'Makroudh (date semolina pastry)', nameLocal: 'Makroudh',
    aliases: ['makroud', 'makroudh', 'makrout', 'مقروض', 'makroudh tunisien', 'gateau de semoule aux dattes'],
    cuisine: 'tunisian', tags: ['dish', 'dessert', 'fried'], per100: { kcal: 400, protein: 5, carbs: 60, fat: 16 },
    isDish: true, defaultUnit: 'piece', units: [u('piece', 'makroudh', 'makroudhs', 40, 1)], basis: 'estimated',
  },
  {
    nameFr: 'Merguez', nameAr: 'مرقاز', nameEn: 'Merguez sausage', nameLocal: 'Merguez',
    aliases: ['merguez', 'mergez', 'مرقاز', 'saucisse merguez', 'saucisse'],
    cuisine: 'tunisian', tags: ['protein', 'meat'], per100: { kcal: 285, protein: 14, carbs: 2, fat: 25 },
    defaultUnit: 'piece', units: [u('piece', 'merguez', 'merguez', 50, 1)], basis: 'estimated',
  },
  {
    nameFr: 'Poisson grillé', nameAr: 'حوت مشوي', nameEn: 'Grilled fish', nameLocal: 'Hout mechoui',
    aliases: ['poisson', 'poisson grille', 'poisson grillé', 'daurade', 'loup', 'dorade', 'mérou', 'merou', 'حوت', 'hout', 'fish', 'poisson frit'],
    cuisine: 'tunisian', tags: ['protein', 'fish'], per100: { kcal: 135, protein: 22, carbs: 0, fat: 5 },
    defaultUnit: 'g', units: [u('piece', 'filet', 'filets', 150, 1)], basis: 'estimated',
  },
];
