/**
 * Seed Foods collection for meal scan (nameFr, macrosPer100g, tags).
 * Run: npm run seed:foods
 */
import Food from '../models/Food.model';
import { runSeed } from './runSeed';

const FOODS: Array<{
  nameFr: string;
  synonyms: string[];
  macrosPer100g: { kcal: number; protein: number; carbs: number; fat: number };
  tags: string[];
}> = [
  { nameFr: 'Poulet, blanc, grillé', synonyms: ['poulet grillé', 'blanc de poulet', 'poulet'], macrosPer100g: { kcal: 165, protein: 31, carbs: 0, fat: 4 }, tags: ['protein', 'meat'] },
  { nameFr: 'Escalope de poulet', synonyms: ['escalope', 'poulet'], macrosPer100g: { kcal: 110, protein: 23, carbs: 0, fat: 2 }, tags: ['protein', 'meat'] },
  { nameFr: 'Dinde, blanc', synonyms: ['dinde', 'blanc de dinde'], macrosPer100g: { kcal: 104, protein: 24, carbs: 0, fat: 1 }, tags: ['protein', 'meat'] },
  { nameFr: 'Thon au naturel', synonyms: ['thon', 'thon en boîte'], macrosPer100g: { kcal: 116, protein: 26, carbs: 0, fat: 1 }, tags: ['protein', 'fish'] },
  { nameFr: 'Saumon', synonyms: ['saumon', 'saumon frais'], macrosPer100g: { kcal: 208, protein: 20, carbs: 0, fat: 13 }, tags: ['protein', 'fish'] },
  { nameFr: 'Œuf entier', synonyms: ['œuf', 'oeuf', 'œufs'], macrosPer100g: { kcal: 155, protein: 13, carbs: 1, fat: 11 }, tags: ['protein'] },
  { nameFr: 'Blanc d\'œuf', synonyms: ['blanc d\'oeuf'], macrosPer100g: { kcal: 52, protein: 11, carbs: 1, fat: 0 }, tags: ['protein'] },
  { nameFr: 'Steak de bœuf', synonyms: ['steak', 'boeuf', 'viande'], macrosPer100g: { kcal: 271, protein: 26, carbs: 0, fat: 18 }, tags: ['protein', 'meat'] },
  { nameFr: 'Viande hachée 5%', synonyms: ['steak haché', 'viande hachée'], macrosPer100g: { kcal: 131, protein: 21, carbs: 0, fat: 5 }, tags: ['protein', 'meat'] },
  { nameFr: 'Riz blanc cuit', synonyms: ['riz', 'riz cuit'], macrosPer100g: { kcal: 130, protein: 2, carbs: 28, fat: 0 }, tags: ['carb', 'grain'] },
  { nameFr: 'Riz complet cuit', synonyms: ['riz complet', 'riz brun'], macrosPer100g: { kcal: 112, protein: 3, carbs: 24, fat: 1 }, tags: ['carb', 'grain'] },
  { nameFr: 'Pâtes cuites', synonyms: ['pâtes', 'pates', 'spaghetti'], macrosPer100g: { kcal: 131, protein: 5, carbs: 25, fat: 1 }, tags: ['carb', 'grain'] },
  { nameFr: 'Quinoa cuit', synonyms: ['quinoa'], macrosPer100g: { kcal: 120, protein: 4, carbs: 21, fat: 2 }, tags: ['carb', 'grain'] },
  { nameFr: 'Pomme de terre', synonyms: ['patate', 'pomme de terre cuite'], macrosPer100g: { kcal: 87, protein: 2, carbs: 20, fat: 0 }, tags: ['carb', 'vegetable'] },
  { nameFr: 'Patate douce', synonyms: ['patate douce'], macrosPer100g: { kcal: 86, protein: 1, carbs: 20, fat: 0 }, tags: ['carb', 'vegetable'] },
  { nameFr: 'Pain complet', synonyms: ['pain', 'pain de mie'], macrosPer100g: { kcal: 247, protein: 13, carbs: 41, fat: 3 }, tags: ['carb', 'grain'] },
  { nameFr: 'Salade verte', synonyms: ['salade', 'laitue'], macrosPer100g: { kcal: 15, protein: 1, carbs: 3, fat: 0 }, tags: ['vegetable'] },
  { nameFr: 'Tomate', synonyms: ['tomates'], macrosPer100g: { kcal: 18, protein: 1, carbs: 4, fat: 0 }, tags: ['vegetable'] },
  { nameFr: 'Concombre', synonyms: ['concombres'], macrosPer100g: { kcal: 15, protein: 1, carbs: 4, fat: 0 }, tags: ['vegetable'] },
  { nameFr: 'Brocoli', synonyms: ['brocolis'], macrosPer100g: { kcal: 34, protein: 3, carbs: 7, fat: 0 }, tags: ['vegetable'] },
  { nameFr: 'Haricots verts', synonyms: ['haricot vert'], macrosPer100g: { kcal: 31, protein: 2, carbs: 7, fat: 0 }, tags: ['vegetable'] },
  { nameFr: 'Carotte', synonyms: ['carottes'], macrosPer100g: { kcal: 41, protein: 1, carbs: 10, fat: 0 }, tags: ['vegetable'] },
  { nameFr: 'Courgette', synonyms: ['courgettes'], macrosPer100g: { kcal: 17, protein: 1, carbs: 3, fat: 0 }, tags: ['vegetable'] },
  { nameFr: 'Épinards', synonyms: ['épinard', 'epinards'], macrosPer100g: { kcal: 23, protein: 3, carbs: 4, fat: 0 }, tags: ['vegetable'] },
  { nameFr: 'Avocat', synonyms: ['avocats'], macrosPer100g: { kcal: 160, protein: 2, carbs: 9, fat: 15 }, tags: ['fat', 'fruit'] },
  { nameFr: 'Banane', synonyms: ['bananes'], macrosPer100g: { kcal: 89, protein: 1, carbs: 23, fat: 0 }, tags: ['fruit', 'carb'] },
  { nameFr: 'Pomme', synonyms: ['pommes'], macrosPer100g: { kcal: 52, protein: 0, carbs: 14, fat: 0 }, tags: ['fruit'] },
  { nameFr: 'Fromage blanc 0%', synonyms: ['fromage blanc', 'faisselle'], macrosPer100g: { kcal: 45, protein: 8, carbs: 4, fat: 0 }, tags: ['protein', 'dairy'] },
  { nameFr: 'Yaourt nature 0%', synonyms: ['yaourt', 'yogourt'], macrosPer100g: { kcal: 56, protein: 10, carbs: 6, fat: 0 }, tags: ['protein', 'dairy'] },
  { nameFr: 'Lait demi-écrémé', synonyms: ['lait'], macrosPer100g: { kcal: 47, protein: 3, carbs: 5, fat: 2 }, tags: ['dairy'] },
  { nameFr: 'Huile d\'olive', synonyms: ['olive', 'huile'], macrosPer100g: { kcal: 884, protein: 0, carbs: 0, fat: 100 }, tags: ['fat'] },
  { nameFr: 'Beurre', synonyms: [], macrosPer100g: { kcal: 717, protein: 0, carbs: 0, fat: 81 }, tags: ['fat'] },
  { nameFr: 'Amandes', synonyms: ['amande'], macrosPer100g: { kcal: 579, protein: 21, carbs: 22, fat: 50 }, tags: ['protein', 'fat', 'nuts'] },
  { nameFr: 'Noix', synonyms: [], macrosPer100g: { kcal: 654, protein: 15, carbs: 14, fat: 65 }, tags: ['fat', 'nuts'] },
  { nameFr: 'Cottage cheese', synonyms: ['cottage', 'fromage cottage'], macrosPer100g: { kcal: 98, protein: 11, carbs: 4, fat: 4 }, tags: ['protein', 'dairy'] },
  { nameFr: 'Tofu nature', synonyms: ['tofu'], macrosPer100g: { kcal: 76, protein: 8, carbs: 2, fat: 5 }, tags: ['protein', 'vegan'] },
  { nameFr: 'Pois chiches cuits', synonyms: ['pois chiches', 'houmous'], macrosPer100g: { kcal: 164, protein: 9, carbs: 27, fat: 3 }, tags: ['protein', 'carb', 'vegan'] },
  { nameFr: 'Lentilles cuites', synonyms: ['lentilles'], macrosPer100g: { kcal: 116, protein: 9, carbs: 20, fat: 0 }, tags: ['protein', 'carb', 'vegan'] },
  { nameFr: 'Cabillaud', synonyms: ['cabillaud', 'morue'], macrosPer100g: { kcal: 82, protein: 18, carbs: 0, fat: 1 }, tags: ['protein', 'fish'] },
  { nameFr: 'Crevettes', synonyms: ['crevette'], macrosPer100g: { kcal: 99, protein: 24, carbs: 0, fat: 1 }, tags: ['protein', 'fish'] },
  { nameFr: 'Jambon blanc', synonyms: ['jambon', 'jambon découenné'], macrosPer100g: { kcal: 113, protein: 21, carbs: 1, fat: 3 }, tags: ['protein', 'meat'] },
  { nameFr: 'Bacon', synonyms: ['lard'], macrosPer100g: { kcal: 541, protein: 37, carbs: 1, fat: 42 }, tags: ['protein', 'fat', 'meat'] },
  { nameFr: 'Miel', synonyms: [], macrosPer100g: { kcal: 304, protein: 0, carbs: 82, fat: 0 }, tags: ['carb', 'sweetener'] },
  { nameFr: 'Confiture', synonyms: [], macrosPer100g: { kcal: 278, protein: 0, carbs: 69, fat: 0 }, tags: ['carb'] },
  { nameFr: 'Chocolat noir 70%', synonyms: ['chocolat'], macrosPer100g: { kcal: 546, protein: 8, carbs: 44, fat: 42 }, tags: ['fat', 'carb'] },
  { nameFr: 'Café', synonyms: [], macrosPer100g: { kcal: 2, protein: 0, carbs: 0, fat: 0 }, tags: ['beverage'] },
  { nameFr: 'Thé', synonyms: [], macrosPer100g: { kcal: 1, protein: 0, carbs: 0, fat: 0 }, tags: ['beverage'] },
  { nameFr: 'Eau', synonyms: [], macrosPer100g: { kcal: 0, protein: 0, carbs: 0, fat: 0 }, tags: ['beverage'] },
  { nameFr: 'Smoothie protéiné', synonyms: ['smoothie', 'shaker'], macrosPer100g: { kcal: 88, protein: 12, carbs: 7, fat: 2 }, tags: ['protein', 'beverage'] },
  { nameFr: 'Whey protéine', synonyms: ['whey', 'protéine en poudre'], macrosPer100g: { kcal: 400, protein: 80, carbs: 8, fat: 6 }, tags: ['protein'] },
  { nameFr: 'Flocons d\'avoine', synonyms: ['avoine', 'porridge'], macrosPer100g: { kcal: 389, protein: 17, carbs: 66, fat: 7 }, tags: ['carb', 'grain'] },
  { nameFr: 'Muesli', synonyms: [], macrosPer100g: { kcal: 352, protein: 10, carbs: 66, fat: 6 }, tags: ['carb', 'grain'] },
  { nameFr: 'Croissant', synonyms: [], macrosPer100g: { kcal: 406, protein: 8, carbs: 46, fat: 21 }, tags: ['carb', 'fat'] },
  { nameFr: 'Bagel', synonyms: [], macrosPer100g: { kcal: 257, protein: 10, carbs: 50, fat: 2 }, tags: ['carb'] },
  { nameFr: 'Pizza margherita', synonyms: ['pizza'], macrosPer100g: { kcal: 266, protein: 11, carbs: 33, fat: 10 }, tags: ['carb', 'fat'] },
  { nameFr: 'Burger', synonyms: ['hamburger'], macrosPer100g: { kcal: 295, protein: 17, carbs: 25, fat: 15 }, tags: ['protein', 'carb', 'fat'] },
  { nameFr: 'Frites', synonyms: ['frites', 'pommes frites'], macrosPer100g: { kcal: 312, protein: 3, carbs: 41, fat: 15 }, tags: ['carb', 'fat'] },
  { nameFr: 'Omelette', synonyms: ['omelette nature'], macrosPer100g: { kcal: 154, protein: 11, carbs: 1, fat: 12 }, tags: ['protein'] },
  { nameFr: 'Soupe de légumes', synonyms: ['soupe'], macrosPer100g: { kcal: 34, protein: 2, carbs: 6, fat: 0 }, tags: ['vegetable'] },
  { nameFr: 'Coleslaw', synonyms: ['salade de chou'], macrosPer100g: { kcal: 119, protein: 1, carbs: 11, fat: 8 }, tags: ['vegetable', 'fat'] },
  { nameFr: 'Maïs', synonyms: ['épis de maïs'], macrosPer100g: { kcal: 86, protein: 3, carbs: 19, fat: 1 }, tags: ['carb', 'vegetable'] },
  { nameFr: 'Petits pois', synonyms: ['pois'], macrosPer100g: { kcal: 81, protein: 5, carbs: 14, fat: 0 }, tags: ['vegetable', 'carb'] },
  { nameFr: 'Champignons', synonyms: ['champignon'], macrosPer100g: { kcal: 22, protein: 3, carbs: 3, fat: 0 }, tags: ['vegetable'] },
  { nameFr: 'Oignon', synonyms: ['oignons'], macrosPer100g: { kcal: 40, protein: 1, carbs: 9, fat: 0 }, tags: ['vegetable'] },
  { nameFr: 'Ail', synonyms: [], macrosPer100g: { kcal: 149, protein: 6, carbs: 33, fat: 1 }, tags: ['vegetable'] },
  { nameFr: 'Orange', synonyms: ['oranges'], macrosPer100g: { kcal: 47, protein: 1, carbs: 12, fat: 0 }, tags: ['fruit'] },
  { nameFr: 'Raisin', synonyms: ['raisins'], macrosPer100g: { kcal: 69, protein: 1, carbs: 18, fat: 0 }, tags: ['fruit'] },
  { nameFr: 'Fraise', synonyms: ['fraises'], macrosPer100g: { kcal: 32, protein: 1, carbs: 8, fat: 0 }, tags: ['fruit'] },
  { nameFr: 'Myrtille', synonyms: ['myrtilles'], macrosPer100g: { kcal: 57, protein: 1, carbs: 14, fat: 0 }, tags: ['fruit'] },
  { nameFr: 'Pêche', synonyms: ['pêches'], macrosPer100g: { kcal: 39, protein: 1, carbs: 10, fat: 0 }, tags: ['fruit'] },
  { nameFr: 'Poire', synonyms: ['poires'], macrosPer100g: { kcal: 57, protein: 0, carbs: 15, fat: 0 }, tags: ['fruit'] },
  { nameFr: 'Pastèque', synonyms: ['pastèques'], macrosPer100g: { kcal: 30, protein: 1, carbs: 8, fat: 0 }, tags: ['fruit'] },
  { nameFr: 'Mangue', synonyms: ['mangues'], macrosPer100g: { kcal: 60, protein: 1, carbs: 15, fat: 0 }, tags: ['fruit'] },
  { nameFr: 'Kiwi', synonyms: ['kiwis'], macrosPer100g: { kcal: 61, protein: 1, carbs: 15, fat: 0 }, tags: ['fruit'] },
  { nameFr: 'Ananas', synonyms: [], macrosPer100g: { kcal: 50, protein: 1, carbs: 13, fat: 0 }, tags: ['fruit'] },
  { nameFr: 'Noix de cajou', synonyms: ['cajou'], macrosPer100g: { kcal: 553, protein: 18, carbs: 30, fat: 44 }, tags: ['fat', 'nuts'] },
  { nameFr: 'Noisettes', synonyms: ['noisette'], macrosPer100g: { kcal: 628, protein: 15, carbs: 17, fat: 61 }, tags: ['fat', 'nuts'] },
  { nameFr: 'Beurre de cacahuète', synonyms: ['purée d\'arachide', 'beurre de cacahuète'], macrosPer100g: { kcal: 588, protein: 25, carbs: 20, fat: 50 }, tags: ['protein', 'fat'] },
  { nameFr: 'Mayonnaise', synonyms: ['mayo'], macrosPer100g: { kcal: 680, protein: 1, carbs: 0, fat: 75 }, tags: ['fat'] },
  { nameFr: 'Ketchup', synonyms: [], macrosPer100g: { kcal: 112, protein: 2, carbs: 26, fat: 0 }, tags: ['carb'] },
  { nameFr: 'Sauce soja', synonyms: ['soja'], macrosPer100g: { kcal: 53, protein: 6, carbs: 6, fat: 0 }, tags: [] },
  { nameFr: 'Vinaigrette', synonyms: ['vinaigrette allégée'], macrosPer100g: { kcal: 200, protein: 0, carbs: 4, fat: 20 }, tags: ['fat'] },
  { nameFr: 'Fromage râpé', synonyms: ['emmental', 'gruyère'], macrosPer100g: { kcal: 384, protein: 28, carbs: 1, fat: 29 }, tags: ['protein', 'dairy', 'fat'] },
  { nameFr: 'Mozzarella', synonyms: [], macrosPer100g: { kcal: 280, protein: 22, carbs: 3, fat: 22 }, tags: ['protein', 'dairy'] },
  { nameFr: 'Feta', synonyms: [], macrosPer100g: { kcal: 264, protein: 14, carbs: 4, fat: 21 }, tags: ['protein', 'dairy'] },
  { nameFr: 'Cheddar', synonyms: [], macrosPer100g: { kcal: 403, protein: 25, carbs: 1, fat: 33 }, tags: ['protein', 'dairy', 'fat'] },
  { nameFr: 'Chips', synonyms: ['chips', 'croustilles'], macrosPer100g: { kcal: 536, protein: 7, carbs: 50, fat: 34 }, tags: ['carb', 'fat'] },
  { nameFr: 'Barre chocolatée', synonyms: ['barre chocolat'], macrosPer100g: { kcal: 520, protein: 8, carbs: 60, fat: 28 }, tags: ['carb', 'fat'] },
  { nameFr: 'Glace', synonyms: ['crème glacée'], macrosPer100g: { kcal: 207, protein: 4, carbs: 24, fat: 11 }, tags: ['carb', 'fat'] },
  { nameFr: 'Gâteau', synonyms: ['gateau', 'pâtisserie'], macrosPer100g: { kcal: 389, protein: 5, carbs: 52, fat: 18 }, tags: ['carb', 'fat'] },
  { nameFr: 'Tartine beurre confiture', synonyms: ['tartine'], macrosPer100g: { kcal: 312, protein: 5, carbs: 45, fat: 13 }, tags: ['carb', 'fat'] },
  { nameFr: 'Céréales petit-déjeuner', synonyms: ['céréales'], macrosPer100g: { kcal: 379, protein: 8, carbs: 84, fat: 5 }, tags: ['carb'] },
  { nameFr: 'Pain de campagne', synonyms: ['pain campagne'], macrosPer100g: { kcal: 250, protein: 8, carbs: 49, fat: 1 }, tags: ['carb'] },
  { nameFr: 'Wrap / Tortilla', synonyms: ['wrap', 'tortilla'], macrosPer100g: { kcal: 304, protein: 9, carbs: 50, fat: 7 }, tags: ['carb'] },
  { nameFr: 'Taboulé', synonyms: ['taboule'], macrosPer100g: { kcal: 96, protein: 3, carbs: 18, fat: 1 }, tags: ['carb'] },
  { nameFr: 'Salade César', synonyms: ['cesar', 'césar'], macrosPer100g: { kcal: 184, protein: 9, carbs: 6, fat: 15 }, tags: ['protein', 'fat', 'vegetable'] },
  { nameFr: 'Sushi saumon', synonyms: ['sushi'], macrosPer100g: { kcal: 143, protein: 7, carbs: 20, fat: 4 }, tags: ['carb', 'fish'] },
  { nameFr: 'Nouilles', synonyms: ['nouilles sautées'], macrosPer100g: { kcal: 138, protein: 5, carbs: 25, fat: 2 }, tags: ['carb'] },
  { nameFr: 'Boulgour cuit', synonyms: ['boulgour'], macrosPer100g: { kcal: 83, protein: 3, carbs: 19, fat: 0 }, tags: ['carb', 'grain'] },
  { nameFr: 'Semoule cuite', synonyms: ['semoule'], macrosPer100g: { kcal: 112, protein: 4, carbs: 23, fat: 0 }, tags: ['carb', 'grain'] },
  { nameFr: 'Pois cassés', synonyms: [], macrosPer100g: { kcal: 118, protein: 8, carbs: 21, fat: 0 }, tags: ['protein', 'carb', 'vegan'] },
  { nameFr: 'Haricots rouges', synonyms: ['haricots rouges'], macrosPer100g: { kcal: 127, protein: 9, carbs: 22, fat: 0 }, tags: ['protein', 'carb', 'vegan'] },
  { nameFr: 'Édamame', synonyms: ['edamame'], macrosPer100g: { kcal: 122, protein: 11, carbs: 10, fat: 5 }, tags: ['protein', 'vegan'] },
  { nameFr: 'Tempeh', synonyms: [], macrosPer100g: { kcal: 193, protein: 20, carbs: 9, fat: 10 }, tags: ['protein', 'vegan'] },
  { nameFr: 'Seitan', synonyms: [], macrosPer100g: { kcal: 120, protein: 24, carbs: 4, fat: 1 }, tags: ['protein', 'vegan'] },
  { nameFr: 'Lait d\'amande', synonyms: ['lait amande'], macrosPer100g: { kcal: 17, protein: 0, carbs: 1, fat: 1 }, tags: ['beverage', 'vegan'] },
  { nameFr: 'Lait d\'avoine', synonyms: ['lait avoine'], macrosPer100g: { kcal: 47, protein: 1, carbs: 7, fat: 2 }, tags: ['beverage', 'vegan'] },
  { nameFr: 'Jus d\'orange', synonyms: ['jus orange'], macrosPer100g: { kcal: 45, protein: 1, carbs: 11, fat: 0 }, tags: ['beverage', 'fruit'] },
  { nameFr: 'Soda', synonyms: ['coca', 'sprite'], macrosPer100g: { kcal: 42, protein: 0, carbs: 11, fat: 0 }, tags: ['beverage'] },
  { nameFr: 'Bière', synonyms: [], macrosPer100g: { kcal: 43, protein: 0, carbs: 4, fat: 0 }, tags: ['beverage', 'alcohol'] },
  { nameFr: 'Vin rouge', synonyms: ['vin'], macrosPer100g: { kcal: 83, protein: 0, carbs: 4, fat: 0 }, tags: ['beverage', 'alcohol'] },
  { nameFr: 'Café au lait', synonyms: ['café latte'], macrosPer100g: { kcal: 43, protein: 2, carbs: 4, fat: 2 }, tags: ['beverage'] },
  { nameFr: 'Thé vert', synonyms: [], macrosPer100g: { kcal: 1, protein: 0, carbs: 0, fat: 0 }, tags: ['beverage'] },
  { nameFr: 'Eau gazeuse', synonyms: ['eau pétillante'], macrosPer100g: { kcal: 0, protein: 0, carbs: 0, fat: 0 }, tags: ['beverage'] },
  { nameFr: 'Compote', synonyms: ['compote de pommes'], macrosPer100g: { kcal: 68, protein: 0, carbs: 17, fat: 0 }, tags: ['fruit'] },
  { nameFr: 'Fruits secs mélange', synonyms: ['fruits secs'], macrosPer100g: { kcal: 359, protein: 5, carbs: 84, fat: 1 }, tags: ['fruit', 'carb'] },
  { nameFr: 'Dattes', synonyms: ['date'], macrosPer100g: { kcal: 282, protein: 2, carbs: 75, fat: 0 }, tags: ['fruit', 'carb'] },
  { nameFr: 'Abricots secs', synonyms: ['abricot sec'], macrosPer100g: { kcal: 241, protein: 3, carbs: 63, fat: 0 }, tags: ['fruit', 'carb'] },
  { nameFr: 'Cranberries séchées', synonyms: ['canneberge'], macrosPer100g: { kcal: 308, protein: 0, carbs: 82, fat: 1 }, tags: ['fruit'] },
  { nameFr: 'Olives', synonyms: ['olive noire', 'olive verte'], macrosPer100g: { kcal: 115, protein: 1, carbs: 6, fat: 11 }, tags: ['fat'] },
  { nameFr: 'Cornichons', synonyms: [], macrosPer100g: { kcal: 11, protein: 1, carbs: 2, fat: 0 }, tags: ['vegetable'] },
  { nameFr: 'Sauce pesto', synonyms: ['pesto'], macrosPer100g: { kcal: 303, protein: 5, carbs: 6, fat: 29 }, tags: ['fat'] },
  { nameFr: 'Crème fraîche', synonyms: ['creme fraiche'], macrosPer100g: { kcal: 340, protein: 2, carbs: 3, fat: 35 }, tags: ['dairy', 'fat'] },
  { nameFr: 'Lait entier', synonyms: ['lait entier'], macrosPer100g: { kcal: 61, protein: 3, carbs: 5, fat: 3 }, tags: ['dairy'] },
  { nameFr: 'Yaourt grec', synonyms: ['grec', 'yaourt grecque'], macrosPer100g: { kcal: 97, protein: 9, carbs: 4, fat: 5 }, tags: ['protein', 'dairy'] },
  { nameFr: 'Skyr', synonyms: [], macrosPer100g: { kcal: 63, protein: 11, carbs: 4, fat: 0 }, tags: ['protein', 'dairy'] },
  { nameFr: 'Mascarpone', synonyms: [], macrosPer100g: { kcal: 412, protein: 5, carbs: 4, fat: 41 }, tags: ['dairy', 'fat'] },
  { nameFr: 'Parmesan', synonyms: ['parmesan râpé'], macrosPer100g: { kcal: 431, protein: 38, carbs: 4, fat: 29 }, tags: ['protein', 'dairy'] },
  { nameFr: 'Brie', synonyms: [], macrosPer100g: { kcal: 334, protein: 21, carbs: 1, fat: 28 }, tags: ['protein', 'dairy'] },
  { nameFr: 'Camembert', synonyms: [], macrosPer100g: { kcal: 300, protein: 20, carbs: 0, fat: 24 }, tags: ['protein', 'dairy'] },
];

export async function seedFoods(): Promise<void> {
  const existing = await Food.countDocuments();
  if (existing >= FOODS.length) {
    console.log(`✅ Foods already seeded (${existing} docs).`);
    return;
  }
  await Food.deleteMany({});
  await Food.insertMany(FOODS);
  console.log(`✅ Seeded ${FOODS.length} foods.`);
}

if (require.main === module) {
  runSeed('foods', seedFoods)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
