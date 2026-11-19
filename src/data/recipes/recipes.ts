/**
 * DietTemple official recipes — source: "nutrition projet.pptx" (26 slides).
 *
 *  - 23 recipes are published (slides 1–23, incl. the cheese sauce on slide 3 and the pizza on slide 7).
 *  - Slide 26 (pancake breakfast) is stored as `review`: its ingredient list looks inconsistent with its macros.
 *  - Slides 24 and 25 are photos without any recipe data: listed in REVIEW_CANDIDATES, never published.
 *
 * Rules followed while transcribing: no invented ingredients or macros; "~"/"≈" and ranges are flagged as approximate
 * (a range is stored as its middle value and the original text is kept in `nutritionOriginal`); anything missing or
 * inconsistent in the slide is written in `reviewFlags` instead of being silently corrected. Only obvious spelling
 * mistakes (e.g. "cuir" → "cuire") were fixed.
 */
import type { ReviewCandidate, SeedIngredient, SeedRecipe } from './recipeTypes';

const ing = (name: string, quantity?: number, unit?: string): SeedIngredient => ({
  name,
  ...(quantity !== undefined ? { quantity } : {}),
  ...(unit ? { unit } : {}),
});

export const RECIPES: SeedRecipe[] = [
  // ───────────────────────────── Slide 1 ─────────────────────────────
  {
    slug: 'riz-poisson-haricots-verts',
    title: 'Riz – poisson – haricots verts',
    sourceRef: 'Diapositive 1',
    status: 'published',
    calories: 720, protein: 62, carbs: 58, fat: 24,
    macrosApproximate: true,
    nutritionOriginal: 'Macros : 720 kcal – Protéines : ~62 g – Glucides : ~58 g – Lipides : ~24 g',
    servings: 1, servingLabel: '1 portion',
    ingredients: [
      ing('Dorade', 200, 'g'), ing('Riz', 100, 'g'), ing('Maïs', 20, 'g'), ing('Thon en conserve', 50, 'g'),
      ing('Ail', 1, 'gousse'), ing('Oignon', 100, 'g'), ing('Beurre', 10, 'g'),
      ing('Piment doux ou fort (au choix)', 1, 'pièce'), ing('Haricots verts', 200, 'g'),
      ing("Huile d'olive", 5, 'ml'), ing('Citron'),
    ],
    instructions: [
      "Préparation du riz : sauter l'oignon et le piment dans le beurre.",
      "Cuire le riz dans 200 ml d'eau avec du sel, du curcuma, une feuille de laurier et un clou de girofle.",
      "Une fois le riz cuit, ajouter l'oignon, le piment, le maïs et le thon.",
      'Griller le poisson.',
      "Faire cuire les haricots verts et les assaisonner d'une vinaigrette composée de 5 ml d'huile d'olive, citron, sel, poivre et ail.",
    ],
    notes: [
      'Ce déjeuner est globalement très adapté à une prise de masse musculaire, surtout grâce à sa richesse en protéines et à la qualité des aliments.',
      "C'est un repas riche en protéines, avec une quantité modérée de glucides et de bonnes sources de fibres grâce aux haricots verts et aux oignons.",
    ],
    tags: ['DietTemple', 'poisson', 'prise de masse'],
    image: 'riz-poisson-haricots-verts',
  },

  // ───────────────────────────── Slide 2 ─────────────────────────────
  {
    slug: 'harissa-mechouia-pomme-de-terre-haricots-verts-dinde',
    title: 'Harissa mechouia – pomme de terre – haricots verts – dinde hachée grillée',
    sourceRef: 'Diapositive 2',
    status: 'published',
    calories: 822, protein: 58, carbs: 93, fat: 27,
    macrosApproximate: true,
    nutritionOriginal: 'Macros : ~822 kcal – Protéines : ~58 g – Glucides : ~93 g – Lipides : ~27 g',
    servings: 1, servingLabel: '1 portion',
    preparationTimeMinutes: 35, preparationTimeLabel: '35 min',
    ingredients: [
      ing('Dinde hachée', 150, 'g'), ing('Pomme de terre moyenne', 150, 'g'),
      ing('Harissa mechouia', 5, 'cuillères à soupe'), ing('Haricots verts', 150, 'g'),
      ing('Pain', 3, 'tranches (90 g)'), ing("Huile d'olive", 15, 'ml'), ing('Sauce fromage', 1, 'cuillère'),
    ],
    instructions: [
      "Cuire la pomme de terre à l'eau.",
      "Cuire les haricots verts à l'eau, puis les assaisonner avec une vinaigrette.",
      'Griller la dinde.',
      "Dresser l'assiette (ajouter la harissa mechouia, l'huile d'olive et le pain) et la sauce fromage.",
    ],
    notes: ['La sauce fromage est une recette de la même collection (voir « Sauce fromage »).'],
    tags: ['DietTemple', 'dinde', 'sauce fromage'],
    image: 'harissa-mechouia-pomme-de-terre-haricots-verts-dinde',
  },

  // ───────────────────────────── Slide 3 ─────────────────────────────
  {
    slug: 'sauce-fromage',
    title: 'Sauce fromage',
    sourceRef: 'Diapositive 3',
    status: 'published',
    calories: 430, protein: 20, carbs: 14, fat: 34, fiber: 0.3,
    macrosApproximate: true,
    nutritionOriginal:
      'Recette complète ≈ 430 kcal – Protéines ≈ 20 g – Glucides ≈ 14 g – Lipides ≈ 34 g – Fibres ≈ 0,3 g. Pour 1 cuillère à soupe (≈ 15 g) : ~22 kcal, protéines ≈ 1,0 g, glucides ≈ 0,7 g, lipides ≈ 1,7 g.',
    servings: 1, servingLabel: 'Recette complète',
    preparationTimeMinutes: 8, preparationTimeLabel: '5 à 8 min',
    ingredients: [
      ing('Yaourt nature', 1, 'pièce'), ing('Ail', 2, 'gousses'), ing('Fromage fondu Président', 3, 'portions'),
      ing('Fromage blanc', 2, 'cuillères à soupe'), ing('Moutarde', 1, 'petite cuillère'),
      ing("Huile d'olive", 15, 'ml'), ing('Lait', 50, 'ml'),
    ],
    instructions: [
      'Mélanger les ingrédients avec un blender.',
      "Préparer cette sauce à l'avance et la garder au frais.",
    ],
    notes: [
      'Valeurs pour 1 cuillère à soupe de sauce (≈ 15 g) : environ 22 kcal, protéines ≈ 1,0 g, glucides ≈ 0,7 g, lipides ≈ 1,7 g.',
      'La recette complète apporte environ 430 kcal au total.',
    ],
    tags: ['DietTemple', 'sauce'],
    image: null,
    reviewFlags: [
      'Aucune photo dans la source (diapositive 3).',
      'Titre non fourni : « Sauce fromage » est le nom utilisé par les autres diapositives (« voir la recette »).',
      'Nombre de portions non précisé : valeurs données pour la recette complète et pour 1 cuillère à soupe.',
    ],
  },

  // ───────────────────────────── Slide 4 ─────────────────────────────
  {
    slug: 'kafteji-blanc-de-poulet-grille',
    title: 'Kafteji – blanc de poulet grillé',
    sourceRef: 'Diapositive 4',
    status: 'published',
    calories: 790, protein: 70, carbs: 52.5, fat: 25.5, fiber: 16.5,
    macrosApproximate: true,
    nutritionOriginal: 'Macros : ~790 kcal – Glucides : ~50–55 g – Protéines : ~68–72 g – Lipides : ~24–27 g – Fibres : ~15–18 g',
    servings: 1, servingLabel: '1 portion',
    preparationTimeMinutes: 45, preparationTimeLabel: '45 min',
    ingredients: [
      ing('Piments', 4, 'pièces'), ing('Courgette', 1, 'pièce'), ing('Aubergine', 1, 'pièce'), ing('Pomme de terre', 1, 'pièce'),
      ing('Tomates', 2, 'pièces'), ing('Œufs', 2, 'pièces'), ing('Blanc de poulet', 150, 'g'), ing("Huile d'olive", 20, 'ml'),
      ing('Ail'), ing('Oignon'), ing('Persil'), ing('Moutarde'),
    ],
    instructions: [
      "Laver, couper et assaisonner les légumes, les mettre au four sur du papier cuisson et vaporiser d'huile (5 ml).",
      "Porter les œufs à ébullition et ne garder que les blancs d'œufs.",
      "Après cuisson, mélanger tous les ingrédients et ajouter 10 ml d'huile d'olive.",
      "Griller le blanc de poulet et l'assaisonner d'une vinaigrette à base d'oignon, persil, moutarde, jus de citron, sel et 5 ml d'huile d'olive.",
    ],
    tags: ['DietTemple', 'poulet', 'tunisien'],
    image: 'kafteji-blanc-de-poulet-grille',
    reviewFlags: ['Macros données en fourchettes : valeur centrale utilisée (voir nutritionOriginal).'],
  },

  // ───────────────────────────── Slide 5 ─────────────────────────────
  {
    slug: 'salade-de-riz-crevettes-sautees',
    title: 'Salade de riz – crevettes sautées',
    sourceRef: 'Diapositive 5',
    status: 'published',
    calories: 865, protein: 79, carbs: 84, fat: 22,
    macrosApproximate: true,
    nutritionOriginal: 'Macros : ≈ 865 kcal – Protéines : ~79 g – Glucides : ~84 g – Lipides : ~22 g',
    servings: 1, servingLabel: '1 portion',
    ingredients: [
      ing('Crevettes', 250, 'g'), ing('Riz', 100, 'g'), ing('Thon en conserve', 50, 'g'), ing('Oignon', 70, 'g'),
      ing('Olives dénoyautées', 30, 'g'), ing('Ail', 1, 'gousse'), ing("Huile d'olive", 15, 'ml'),
      ing('Curcuma'), ing('Sel'), ing('Poivre'),
    ],
    instructions: [
      "Assaisonner les crevettes (sel, poivre, ail, cumin, harissa, jus d'un demi-citron), puis les griller ou les sauter dans 5 ml d'huile.",
      "Salade de riz : cuire le riz dans de l'eau avec une feuille de laurier, un clou de girofle, du curcuma et du sel.",
      "Mélanger le riz cuit avec l'oignon frais, les olives et le thon.",
      'Vous pouvez ajouter des tranches de tomate fraîche, du concombre…',
      "Assaisonner d'une vinaigrette composée de sel, poivre et 10 ml d'huile.",
    ],
    notes: [
      "Ce repas est particulièrement bien équilibré après une séance intense : protéines élevées (crevettes + thon) pour la récupération musculaire, glucides suffisants (riz) pour reconstituer les réserves d'énergie, lipides modérés, ce qui facilite la digestion après l'entraînement.",
    ],
    tags: ['DietTemple', 'crevettes', 'post-entraînement'],
    image: 'salade-de-riz-crevettes-sautees',
  },

  // ───────────────────────────── Slide 6 ─────────────────────────────
  {
    slug: 'escalope-de-dinde-macaronis-tomates-cerises',
    title: 'Escalope de dinde grillée – macaronis – tomates cerises',
    sourceRef: 'Diapositive 6',
    status: 'published',
    calories: 700, protein: 54, carbs: 62, fat: 24, fiber: 7,
    macrosApproximate: true,
    nutritionOriginal: 'Macros : 700 kcal – Protéines : ≈ 54 g – Glucides : ≈ 62 g – Lipides : ≈ 24 g – Fibres : ≈ 6 à 8 g',
    servings: 1, servingLabel: '1 portion',
    ingredients: [
      ing('Escalope de dinde', 200, 'g'), ing('Macaronis', 70, 'g'), ing('Tomates cerises', 150, 'g'),
      ing('Ail', 2, 'gousses'), ing("Huile d'olive", 20, 'ml'), ing('Concombre', 1, 'pièce'),
    ],
    instructions: [
      "Dans une poêle, mettre 15 ml d'huile d'olive.",
      "Écraser 2 gousses d'ail, ajouter 150 g de tomates cerises et laisser mijoter 15 min (ajouter un peu d'eau si nécessaire), puis ajouter les macaronis cuits et assaisonner avec du basilic.",
      "Griller l'escalope (sel, poivre, paprika, 5 ml d'huile).",
      'Trancher le concombre.',
    ],
    notes: [
      'Si votre objectif est une perte de graisse tout en conservant la masse musculaire, ce repas est adapté, avec un apport élevé en protéines et une bonne satiété.',
    ],
    tags: ['DietTemple', 'dinde', 'perte de graisse'],
    image: 'escalope-de-dinde-macaronis-tomates-cerises',
    reviewFlags: [
      "Titre non fourni dans la source : titre déduit des ingrédients.",
      'Fibres données en fourchette (6 à 8 g) : valeur centrale utilisée.',
      'Poids des macaronis (70 g) : cru ou cuit non précisé.',
    ],
  },

  // ───────────────────────────── Slide 7 ─────────────────────────────
  {
    slug: 'pizza-ble-dur-complet',
    title: 'Pizza au blé dur complet',
    sourceRef: 'Diapositive 7',
    status: 'published',
    calories: 800, protein: 65,
    macrosApproximate: true,
    partialMacros: true,
    nutritionOriginal: 'Total pour les 2 pizzas ≈ 1 596 kcal (arrondi à 1 600 kcal). ≈ 800 kcal par pizza avec environ 60 à 70 g de protéines.',
    servings: 2, servingLabel: '1 pizza',
    ingredients: [
      ing('Farine de blé dur complet', 200, 'g'), ing('Levure boulangère', 5, 'g'), ing('Huile', 5, 'ml'), ing('Sel'), ing('Eau tiède'),
      ing('Tomate fraîche (sauce)', 300, 'g'), ing("Huile d'olive (sauce)", 10, 'ml'), ing('Oignon', 1, 'pièce'),
      ing('Ail', 2, 'gousses'), ing('Origan'), ing('Eau (sauce)', 1, 'verre'),
      ing('Mozzarella (par pizza)', 50, 'g'), ing('Champignons (par pizza)', 100, 'g'),
      ing('Thon (par pizza)', 50, 'g'), ing('Pepperoni (par pizza)', 50, 'g'), ing('Piment vert'),
    ],
    instructions: [
      "La pâte : mettre dans un bol 200 g de farine de blé dur complet, 5 g de levure boulangère, 5 ml d'huile et du sel ; mélanger avec de l'eau tiède pour obtenir une pâte collante ; laisser reposer 30 min.",
      "La sauce : 300 g de tomate fraîche épluchée et coupée en dés, 10 ml d'huile d'olive, 1 oignon, 2 gousses d'ail, de l'origan et 1 verre d'eau ; laisser cuire.",
      'Partager la pâte en deux et étaler chaque portion à part sur du papier sulfurisé.',
      'Mettre la sauce sur la pâte et enfourner à 180 °C.',
      'Garniture, pour chaque pizza : 50 g de mozzarella, 100 g de champignons, 50 g de thon, 50 g de pepperoni, piment vert.',
    ],
    notes: [
      'Faites-vous plaisir.',
      'Total pour les 2 pizzas : ≈ 1 596 kcal (arrondi à 1 600 kcal). Environ 800 kcal par pizza avec environ 60 à 70 g de protéines, ce qui en fait un repas très rassasiant.',
      'Pour la santé : la farine de blé dur complète apporte davantage de fibres, ce qui favorise la satiété ; avec un index glycémique bas, elle contient plus de vitamines du groupe B et est riche en minéraux (magnésium et fer).',
    ],
    tags: ['DietTemple', 'pizza', 'plaisir'],
    image: 'pizza-ble-dur-complet',
    reviewFlags: [
      'Glucides et lipides non fournis dans la source : non renseignés (aucune valeur inventée).',
      'Protéines données en fourchette (60 à 70 g par pizza) : valeur centrale utilisée.',
      'Titre non fourni (la diapositive porte « Faites-vous plaisir »).',
      'Garniture exprimée « pour chaque pizza » ; les autres quantités sont pour la recette (2 pizzas).',
    ],
  },

  // ───────────────────────────── Slide 8 ─────────────────────────────
  {
    slug: 'poisson-blanc-chakchouka-salade-de-betterave',
    title: 'Poisson blanc – chakchouka – salade de betterave',
    sourceRef: 'Diapositive 8',
    status: 'published',
    calories: 870, protein: 74, carbs: 30, fat: 47,
    macrosApproximate: true,
    nutritionOriginal: 'Macros : 870 kcal – Protéines : ~74 g – Glucides : ~30 g – Lipides : ~47 g',
    servings: 1, servingLabel: '1 portion',
    preparationTimeMinutes: 35, preparationTimeLabel: '30 à 35 min',
    ingredients: [
      ing('Oignon', 1, 'pièce'), ing('Tomates fraîches', 2, 'pièces'), ing('Concentré de tomate', 1, 'petite cuillère'),
      ing("Huile d'olive", 15, 'ml'), ing('Ail', 3, 'gousses'), ing('Œuf', 1, 'pièce'), ing('Merguez', 120, 'g (3 pièces)'),
      ing('Poisson blanc (ex. kalb bhar, saulé, merlan)', 200, 'g'), ing('Betterave', 1, 'pièce (100–120 g)'),
    ],
    instructions: [
      "Chakchouka : couper l'oignon, le mettre dans la casserole avec 10 ml d'huile et les merguez, ajouter les tomates fraîches coupées et le concentré de tomate, assaisonner de sel, ail et carvi ; couvrir et laisser mijoter 10 min à feu doux, ajouter le piment coupé et laisser cuire 5 min ; ajouter enfin 1 œuf.",
      "Assaisonner la tranche de poisson (jus de citron, sel, poivre, cumin, oignon, ail), la couvrir de papier aluminium et la faire cuire dans une poêle.",
      "Cuire la betterave dans de l'eau bouillante ; assaisonner de 5 ml d'huile, sel, jus de citron et persil.",
    ],
    tags: ['DietTemple', 'poisson', 'chakchouka', 'tunisien'],
    image: 'poisson-blanc-chakchouka-salade-de-betterave',
    reviewFlags: ['Le piment est cité dans la préparation mais absent de la liste des ingrédients.'],
  },

  // ───────────────────────────── Slide 9 ─────────────────────────────
  {
    slug: 'salade-legumes-varies-poulet-grille-sauce-champignon',
    title: 'Salade de légumes variés – blanc de poulet grillé – sauce champignon',
    sourceRef: 'Diapositive 9',
    status: 'published',
    calories: 1070, protein: 91, carbs: 37, fat: 61,
    nutritionOriginal: 'Macros : 1070 kcal – Protéines : ~91 g – Glucides : ~37 g – Lipides : ~61 g',
    macrosApproximate: true,
    servings: 1, servingLabel: '1 portion',
    ingredients: [
      ing('Blanc de poulet', 250, 'g'), ing('Carotte', 200, 'g'), ing('Brocoli', 100, 'g'), ing('Pomme de terre', 100, 'g'),
      ing('Champignons', 100, 'g'), ing('Crème fraîche', 50, 'ml'), ing('Ricotta', 100, 'g'),
      ing('Huile (grillade du poulet)', 5, 'ml'), ing('Huile (champignons)', 5, 'ml'), ing('Huile (vinaigrette)', 5, 'ml'),
    ],
    instructions: [
      'Griller le blanc de poulet avec 5 ml d’huile.',
      'Cuire les légumes (carotte, brocoli, pomme de terre) à la vapeur.',
      'Sauter les champignons dans 5 ml d’huile, puis ajouter 50 ml de crème fraîche.',
      'Assaisonner la salade de légumes d’une vinaigrette (sel, poivre, 5 ml d’huile) et servir avec la ricotta.',
    ],
    notes: [
      "C'est un bon repas post-entraînement, à ajuster selon votre objectif.",
      "Prise de muscle ou performance : après un entraînement très long ou très intense (musculation lourde, HIIT, endurance), vous pouvez augmenter un peu les glucides (davantage de pommes de terre, de riz ou de pain complet).",
      "Perte de graisse : vous pouvez réduire légèrement les matières grasses en diminuant la crème fraîche, la ricotta ou l'huile d'olive pour abaisser les calories.",
    ],
    tags: ['DietTemple', 'poulet', 'post-entraînement'],
    image: 'salade-legumes-varies-poulet-grille-sauce-champignon',
    reviewFlags: [
      "Rôle de la ricotte (100 g) non précisé dans la source : listée avec la sauce champignon.",
      'Temps de préparation non fourni.',
      "Les étapes sont reconstituées à partir de la liste « ingrédients et préparation » de la diapositive.",
    ],
  },

  // ───────────────────────────── Slide 10 ─────────────────────────────
  {
    slug: 'houria-poisson-brocoli-riz',
    title: 'Houria – poisson – brocoli – riz',
    sourceRef: 'Diapositive 10',
    status: 'published',
    calories: 617, protein: 48, carbs: 50, fat: 27,
    macrosApproximate: true,
    nutritionOriginal: 'Macros : ~617 kcal – Protéines ~48 g – Glucides ~50 g – Lipides ~27 g',
    servings: 1, servingLabel: '1 portion',
    preparationTimeMinutes: 30, preparationTimeLabel: '30 min',
    ingredients: [
      ing('Dorade (tranche)', 150, 'g'), ing('Carottes', 200, 'g'), ing('Brocolis', 200, 'g'), ing('Riz', 70, 'g'),
      ing("Huile d'olive", 10, 'ml'), ing('Beurre', 10, 'g'), ing('Harissa'), ing('Ail'), ing('Carvi'), ing('Citron'),
    ],
    instructions: [
      "Cuire le riz dans de l'eau, puis l'assaisonner de beurre et de sel.",
      "Omk houria : cuire les carottes dans de l'eau, puis les écraser et ajouter la harissa, le sel, l'huile, l'ail, le carvi et le jus de citron.",
      'Cuire les brocolis et griller le poisson.',
    ],
    notes: [
      'Ce repas est bien équilibré pour la perte de graisse ou le maintien du poids. Pour prendre de la masse musculaire, vous pouvez simplement augmenter la portion de riz (par exemple 120–150 g cuits).',
    ],
    tags: ['DietTemple', 'poisson', 'houria', 'tunisien'],
    image: 'houria-poisson-brocoli-riz',
  },

  // ───────────────────────────── Slide 11 ─────────────────────────────
  {
    slug: 'pomme-au-four-oeufs-poches-merguez-harissa-mechouia',
    title: 'Pomme de terre au four – œufs pochés – merguez – harissa mechouia',
    sourceRef: 'Diapositive 11',
    status: 'published',
    calories: 747, protein: 46, carbs: 74, fat: 31,
    macrosApproximate: true,
    nutritionOriginal: 'Macros : ~747 kcal – Protéines : ~46 g – Glucides : ~74 g – Lipides : ~31 g',
    servings: 1, servingLabel: '1 portion',
    preparationTimeMinutes: 40, preparationTimeLabel: '35 à 40 min',
    ingredients: [
      ing('Œufs', 2, 'pièces'), ing('Merguez', 120, 'g'), ing('Pommes de terre', 300, 'g'),
      ing('Harissa mechouia', 5, 'cuillères à soupe'),
    ],
    instructions: [
      'Couper les pommes de terre.',
      "Les précuire dans de l'eau pendant 15 min, les retirer de l'eau bouillante et bien les égoutter ; les assaisonner à votre goût et les enfourner à 180 °C (20 min).",
      "Préparer les œufs pochés : casser les œufs dans de l'eau frémissante, les tourner en tourbillon, laisser cuire 3 à 4 min, puis les retirer de l'eau et les laisser égoutter.",
      'Griller les merguez.',
      "Dresser l'assiette.",
    ],
    notes: [
      "Si vous ajoutez de l'huile à la harissa mechouia et aux pommes de terre, la valeur calorique change : environ 90 kcal pour 10 ml d'huile.",
    ],
    tags: ['DietTemple', 'œufs', 'merguez', 'tunisien'],
    image: 'pomme-au-four-oeufs-poches-merguez-harissa-mechouia',
    reviewFlags: [
      "Titre de la source : « Pomme au four » alors que les ingrédients sont des pommes de terre (titre ajusté en « Pomme de terre au four »).",
    ],
  },

  // ───────────────────────────── Slide 12 ─────────────────────────────
  {
    slug: 'salade-cesar',
    title: 'Salade César',
    sourceRef: 'Diapositive 12',
    status: 'published',
    calories: 865, protein: 74, carbs: 56, fat: 40, fiber: 17.5,
    macrosApproximate: true,
    nutritionOriginal: 'Macros : 865 kcal – Protéines : 74 g – Glucides : 56 g – Lipides : 40 g – Fibres : 16 à 19 g',
    servings: 1, servingLabel: '1 portion',
    preparationTimeMinutes: 20, preparationTimeLabel: '20 min',
    ingredients: [
      ing('Laitue', 500, 'g (1 pièce)'), ing('Tomates', 3, 'pièces'), ing('Concombres', 450, 'g (3 pièces)'),
      ing('Fromage blanc', 150, 'g'), ing('Noix', 50, 'g'), ing('Escalope de dinde', 150, 'g'),
      ing('Sauce fromage', 2, 'cuillères'),
    ],
    instructions: [
      'Laver et couper les légumes (10 à 12 minutes).',
      "Ajouter le fromage blanc coupé en dés et les noix ; mélanger la salade avec la sauce fromage préparée à l'avance.",
      "Griller l'escalope de dinde (8 à 10 minutes).",
    ],
    notes: ['La sauce fromage est une recette de la même collection (voir « Sauce fromage »).'],
    tags: ['DietTemple', 'salade', 'dinde'],
    image: 'salade-cesar',
    reviewFlags: ['Fibres données en fourchette (16 à 19 g) : valeur centrale utilisée.'],
  },

  // ───────────────────────────── Slide 13 ─────────────────────────────
  {
    slug: 'saumon-grille-pomme-de-terre-champignons-epinards',
    title: 'Saumon grillé – pomme de terre – champignons – épinards – oignon – fromage fondu',
    sourceRef: 'Diapositive 13',
    status: 'published',
    calories: 860, protein: 67, carbs: 49, fat: 48, fiber: 11.8,
    macrosApproximate: true,
    nutritionOriginal: 'Macros : ≈ 860 kcal – Protéines : ≈ 67 g – Glucides : ≈ 49 g – Lipides : ≈ 48 g – Fibres : ≈ 11,8 g',
    servings: 1, servingLabel: '1 portion',
    preparationTimeMinutes: 30, preparationTimeLabel: '30 min',
    ingredients: [
      ing('Saumon', 200, 'g'), ing('Pomme de terre', 1, 'pièce'), ing('Champignons', 200, 'g'), ing('Oignon', 1, 'pièce'),
      ing('Épinards', 200, 'g'), ing('Gruyère', 20, 'g'), ing('Fromage blanc', 1, 'cuillère'), ing('Beurre', 15, 'g'),
    ],
    instructions: [
      'Griller la tranche de saumon.',
      "Sauter l'oignon et les champignons dans le beurre.",
      "Cuire la pomme de terre dans l'eau.",
      "Dresser l'assiette.",
    ],
    tags: ['DietTemple', 'saumon'],
    image: 'saumon-grille-pomme-de-terre-champignons-epinards',
    reviewFlags: [
      'Le titre cite du « fromage fondu » mais la liste d’ingrédients contient du gruyère (20 g).',
      'Les épinards (200 g) ne figurent dans aucune étape de préparation.',
    ],
  },

  // ───────────────────────────── Slide 14 ─────────────────────────────
  {
    slug: 'foie-grille-salade-chaude-variee',
    title: 'Foie grillé – salade chaude variée',
    sourceRef: 'Diapositive 14',
    status: 'published',
    calories: 752, protein: 64, carbs: 66, fat: 25, fiber: 15.6,
    nutritionOriginal: 'Macros : 752 kcal – Protéines : 64 g – Glucides : 66 g – Lipides : 25 g – Fibres : 15.6 g',
    servings: 1, servingLabel: '1 portion',
    preparationTimeMinutes: 25, preparationTimeLabel: '25 min',
    ingredients: [
      ing('Foie de veau', 200, 'g'), ing('Carotte', 100, 'g'), ing('Pomme de terre', 100, 'g'), ing('Haricots verts', 100, 'g'),
      ing('Petits pois', 100, 'g'), ing('Oignon', 100, 'g'), ing('Épinards', 100, 'g'),
      ing('Sauce fromage', 2, 'cuillères'), ing('Beurre', 15, 'g'), ing('Ail', 1, 'gousse'),
    ],
    instructions: [
      'Griller le foie.',
      "Cuire à la vapeur la pomme de terre, la carotte, les haricots verts et les petits pois ; sauter l'oignon et les épinards avec 15 g de beurre et 1 gousse d'ail.",
      'Mélanger tous les légumes avec 2 cuillères de sauce fromage (voir la recette).',
    ],
    tags: ['DietTemple', 'foie', 'salade chaude'],
    image: 'foie-grille-salade-chaude-variee',
  },

  // ───────────────────────────── Slide 15 ─────────────────────────────
  {
    slug: 'salade-carottes-roquette-boulgour-cuisse-de-poulet',
    title: 'Salade de carottes râpées – roquette – boulgour – cuisse de poulet',
    sourceRef: 'Diapositive 15',
    status: 'published',
    calories: 748, protein: 50, carbs: 67.5, fat: 31.4,
    macrosApproximate: true,
    nutritionOriginal: 'Macros : ~748 kcal – Protéines : ~50 g – Glucides : ~67,5 g – Lipides : ~31,4 g',
    servings: 1, servingLabel: '1 portion',
    preparationTimeMinutes: 45, preparationTimeLabel: '45 min',
    ingredients: [
      ing('Boulgour', 50, 'g'), ing('Oignon', 1, 'pièce'), ing('Concentré de tomate', 10, 'g'),
      ing('Cuisse de poulet', 150, 'g (1 pièce)'), ing('Carottes', 3, 'pièces'), ing('Jarjir (roquette)', undefined, 'quelques feuilles'),
      ing("Huile d'olive", 15, 'ml'), ing('Fromage blanc', 1, 'cuillère'), ing('Citron', 0.5, 'pièce'),
    ],
    instructions: [
      'Cuire le poulet dans de l’eau avec une feuille de laurier, du sel, du curcuma et du poivre.',
      "Laver le boulgour et le faire revenir avec l'oignon et la tomate dans 10 ml d'huile et du sel pendant 7 min à feu doux ; ajouter ensuite l'eau de cuisson du poulet (environ deux fois la quantité de boulgour), couvrir et laisser cuire à feu doux.",
      "Râper les carottes et les assaisonner d'une vinaigrette composée de 1 cuillère de fromage blanc, citron, sel et 5 ml d'huile.",
      "Dresser l'assiette.",
    ],
    tags: ['DietTemple', 'poulet', 'boulgour'],
    image: 'salade-carottes-roquette-boulgour-cuisse-de-poulet',
  },

  // ───────────────────────────── Slide 16 ─────────────────────────────
  {
    slug: 'riz-omelette-carottes-brocoli',
    title: 'Riz – omelette – carottes et brocoli',
    sourceRef: 'Diapositive 16',
    status: 'published',
    calories: 610, protein: 31, carbs: 78, fat: 20.5,
    macrosApproximate: true,
    nutritionOriginal: 'Macros : ~610 kcal – Protéines : ~31 g – Glucides : ~78 g – Lipides : ~20.5 g',
    servings: 1, servingLabel: '1 portion',
    preparationTimeMinutes: 25, preparationTimeLabel: '25 min',
    ingredients: [
      ing('Riz blanc cru', 50, 'g'), ing('Maïs', 2, 'cuillères'), ing('Œufs', 3, 'pièces'), ing('Carottes', 3, 'pièces'),
      ing('Brocoli', 100, 'g'), ing('Tomate (petite)', 1, 'pièce'), ing('Oignon', 1, 'pièce'),
      ing('Persil', undefined, 'quelques feuilles'), ing("Huile d'olive", 10, 'ml'),
    ],
    instructions: [
      'Rincer le riz.',
      'Mettre le riz dans une casserole, ajouter de l’eau et du sel et laisser cuire ; après cuisson, le mélanger avec 2 cuillères de maïs.',
      "Cuire les carottes et les brocolis à la vapeur, puis les assaisonner d'une vinaigrette (5 ml d'huile, sel, jus d'un demi-citron).",
      "Préparer l'omelette (3 œufs, persil, oignon, tomate).",
    ],
    tags: ['DietTemple', 'œufs', 'végétarien'],
    image: 'riz-omelette-carottes-brocoli',
    reviewFlags: ['Titre non fourni dans la source : titre déduit des ingrédients.'],
  },

  // ───────────────────────────── Slide 17 ─────────────────────────────
  {
    slug: 'plat-tunisien-poisson-grille',
    title: 'Plat tunisien – poisson grillé',
    sourceRef: 'Diapositive 17',
    status: 'published',
    calories: 690, protein: 53, carbs: 73, fat: 27, fiber: 15,
    macrosApproximate: true,
    nutritionOriginal: 'Macros : 690 kcal – Protéines : 53 g – Glucides : 73 g – Lipides : 27 g – Fibres : 14–16 g',
    servings: 1, servingLabel: '1 portion',
    preparationTimeMinutes: 50, preparationTimeLabel: '50 min',
    ingredients: [
      ing('Pomme de terre', 1, 'pièce'), ing('Concombre', 1, 'pièce'), ing('Oignons', 2, 'pièces'), ing('Tomate', 1, 'pièce'),
      ing('Piments', 5, 'pièces'), ing('Ail', 3, 'gousses'), ing('Piment salé', 3, 'pièces'), ing('Citron salé', 0.25, 'pièce'),
      ing("Filets d'anchois", 4, 'pièces'), ing('Câpres', 10, 'g'), ing('Fromage blanc', 1, 'cuillère'),
      ing('Huile', 20, 'ml'), ing('Poisson grillé « ser » (serran)', 150, 'g'),
    ],
    instructions: [
      "Cuire la pomme de terre dans l'eau avec du sel, du curcuma et du poivre.",
      "Égoutter la pomme de terre et l'assaisonner d'une vinaigrette composée de 1 cuillère de fromage blanc, jus de citron, 5 ml d'huile d'olive et quelques feuilles de persil.",
      "Couper la salade de concombre avec ½ oignon.",
      "Couper une tomate et ½ oignon, ajouter le piment salé et le citron salé ; mélanger avec les câpres et les filets d'anchois et 5 ml d'huile.",
      'Harissa à la vapeur : cuire à la vapeur 5 piments, 1 tomate et une gousse d’ail.',
      'Griller le poisson.',
    ],
    tags: ['DietTemple', 'poisson', 'tunisien'],
    image: 'plat-tunisien-poisson-grille',
    reviewFlags: [
      'Fibres données en fourchette (14–16 g) : valeur centrale utilisée.',
      "Poisson « ser (serran) » : espèce à confirmer.",
    ],
  },

  // ───────────────────────────── Slide 18 ─────────────────────────────
  {
    slug: 'tajine-riche-en-proteines',
    title: 'Tajine riche en protéines, faible en calories',
    sourceRef: 'Diapositive 18',
    status: 'published',
    calories: 520, protein: 63, carbs: 37, fat: 16,
    nutritionOriginal: 'Macros : 520 kcal – Protéines : 63 g – Glucides : 37 g – Lipides : 16 g',
    servings: 1, servingLabel: '1 portion',
    preparationTimeMinutes: 30, preparationTimeLabel: '30 min',
    ingredients: [
      ing('Skyr', 200, 'g'), ing('Tarti frais', 20, 'g'), ing('Œufs entiers', 2, 'pièces'), ing("Blancs d'œufs", 4, 'pièces'),
      ing('Courgette râpée', 200, 'g'), ing('Épinards', 300, 'g'), ing('Carotte râpée', 100, 'g'),
    ],
    instructions: [
      'Râper les légumes.',
      'Couper les épinards.',
      'Mélanger les légumes avec le skyr, le tarti frais et les œufs.',
      'Enfourner à 180 °C.',
    ],
    tags: ['DietTemple', 'tajine', 'riche en protéines', 'faible en calories'],
    image: 'tajine-riche-en-proteines',
  },

  // ───────────────────────────── Slide 19 ─────────────────────────────
  {
    slug: 'harissa-mechouia-houria-pomme-de-terre-baba-ghanouj',
    title: "Harissa mechouia – houria – pomme de terre frite à l'air fryer – baba ghanouj",
    sourceRef: 'Diapositive 19',
    status: 'published',
    calories: 620, protein: 45, carbs: 47, fat: 29.2,
    nutritionOriginal: 'Macros : 620 kcal – Protéines : 45 g – Glucides : 47 g – Lipides : 29.2 g',
    servings: 1, servingLabel: '1 portion',
    preparationTimeMinutes: 60, preparationTimeLabel: '60 min',
    ingredients: [
      ing('Piments'), ing('Tomates'), ing('Ail'), ing('Carottes'), ing('Aubergines'),
      ing('Pomme de terre moyenne', 150, 'g'), ing('Citron', 1, 'pièce'), ing('Pâte de sésame (tahina)'), ing('Harissa'),
      ing('Poisson loup', 170, 'g'), ing("Huile d'olive", 20, 'ml'),
    ],
    instructions: [
      'Préparer la harissa mechouia (5 cuillères à soupe).',
      "Préparer la houria : cuire les carottes à l'eau puis les écraser, ajouter la harissa, l'ail, le carvi et le jus d'un demi-citron ; laisser mijoter quelques minutes pour assécher le surplus d'eau (5 cuillères à soupe).",
      "Préparer le baba ghanouj : cuire les aubergines (grillées, à l'eau ou à la vapeur), enlever les pépins, les écraser et ajouter l'ail, la tahina, l'huile d'olive et le jus d'un demi-citron (2 cuillères à soupe).",
      'Couper la pomme de terre en lamelles et enfourner.',
      'Griller le poisson.',
      "Partager les 20 ml d'huile entre les différents composants de l'assiette.",
    ],
    tags: ['DietTemple', 'poisson', 'tunisien', 'houria'],
    image: 'harissa-mechouia-houria-pomme-de-terre-baba-ghanouj',
    reviewFlags: ['Quantités des piments, tomates, ail, carottes, aubergines et de la tahina non précisées dans la source.'],
  },

  // ───────────────────────────── Slide 20 ─────────────────────────────
  {
    slug: 'tajine-de-poulet',
    title: 'Tajine de poulet',
    sourceRef: 'Diapositive 20',
    status: 'published',
    calories: 655, protein: 42, carbs: 40, fat: 39,
    macrosApproximate: true,
    nutritionOriginal: 'Macros : ~655 kcal – Protéines : ~42 g – Glucides : ~40 g – Lipides : ~39 g',
    servings: 1, servingLabel: '1 portion',
    preparationTimeMinutes: 45, preparationTimeLabel: '45 min',
    ingredients: [
      ing('Cuisse de poulet'), ing('Pomme de terre', 150, 'g'), ing('Oignon', 70, 'g'), ing('Ail', 3, 'gousses'),
      ing('Concentré de tomate', 1, 'petite cuillère'), ing("Huile d'olive", 15, 'ml'), ing('Sel'), ing('Poivre'),
      ing('Curcuma'), ing('Feuille de laurier'), ing('Piment', 1, 'pièce'),
    ],
    instructions: [
      'Mélanger tous les ingrédients.',
      'Enfourner ou mettre à l’air fryer.',
      'Frire le piment.',
      "Dresser l'assiette.",
    ],
    tags: ['DietTemple', 'poulet', 'tajine'],
    image: 'tajine-de-poulet',
    reviewFlags: ['Poids de la cuisse de poulet non précisé dans la source.'],
  },

  // ───────────────────────────── Slide 21 ─────────────────────────────
  {
    slug: 'chapatis-riches-en-proteines',
    title: 'Chapatis riches en protéines',
    sourceRef: 'Diapositive 21',
    status: 'published',
    calories: 260, protein: 27, carbs: 26, fat: 3.5,
    macrosApproximate: true,
    nutritionOriginal: 'Macros total par chapati garni : 260 kcal – Protéines : ≈ 27 g – Glucides : ≈ 26 g – Lipides : ≈ 3,5 g',
    servings: 8, servingLabel: '1 chapati garni',
    ingredients: [
      ing('Farine de blé (pâte)', 200, 'g'), ing('Semoule fine (pâte)', 50, 'g'), ing('Levure boulangère (pâte)', 0.5, 'sachet'),
      ing('Sel (pâte)', 1, 'cuillère à café'), ing('Eau tiède (pâte)', 160, 'ml'),
      ing('Thon bien égoutté (farce, par chapati)', 60, 'g'), ing("Blancs d'œufs cuits (farce, par chapati)", 2, 'pièces'),
      ing('Mozzarella râpée (farce, par chapati)', 10, 'g'), ing('Harissa (farce, par chapati)', 1, 'cuillère à café'),
    ],
    instructions: [
      'Mélanger la farine, la semoule, le sel et la levure.',
      "Verser l'eau progressivement en pétrissant pendant 8 à 10 minutes.",
      'Laisser reposer 45 à 60 minutes.',
      'Diviser la pâte en 8 boules d’environ 40 à 42 g chacune.',
      'Les étaler finement.',
      'Garnir chaque chapati et le faire cuire sur une poêle bien chaude 1 à 2 min de chaque côté.',
    ],
    notes: ['La pâte donne 8 portions de 42 g chacune. Valeurs nutritionnelles : par chapati garni.'],
    tags: ['DietTemple', 'chapati', 'riche en protéines', 'peu calorique'],
    image: 'chapatis-riches-en-proteines',
    reviewFlags: ["Eau tiède donnée en fourchette (150 à 170 ml, à ajuster) : valeur centrale utilisée."],
  },

  // ───────────────────────────── Slide 22 ─────────────────────────────
  {
    slug: 'cotelette-de-veau-sauce-champignons-salades',
    title: 'Côtelette de veau grillée – sauce aux champignons – salade de boulgour, lentilles, carottes – salade de « variante » et maquereau',
    sourceRef: 'Diapositive 22',
    status: 'published',
    calories: 1120, protein: 87, carbs: 48, fat: 65,
    macrosApproximate: true,
    nutritionOriginal: 'Macros : ≈ 1 120 kcal – Protéines : ≈ 87 g – Glucides : ≈ 48 g – Lipides : ≈ 65 g',
    servings: 1, servingLabel: '1 portion',
    preparationTimeMinutes: 60, preparationTimeLabel: '60 min',
    ingredients: [
      ing('Côtelette de veau (taille moyenne)', 1, 'pièce'), ing('Champignons', 50, 'g'), ing('Crème liquide 15 %', 20, 'ml'),
      ing('Boulgour', 50, 'g'), ing('Lentilles', 50, 'g'), ing('Carottes', 2, 'pièces'), ing('Oignon', 1, 'pièce'), ing('Piment', 1, 'pièce'),
      ing('Menthe', undefined, 'quelques feuilles'), ing('Citron (salade)', 0.5, 'pièce'), ing("Huile d'olive (salade)", 10, 'ml'),
      ing('« Variante »', 30, 'g'), ing('Maquereau (taille moyenne)', 1, 'pièce'), ing('Harissa', 1, 'cuillère'),
      ing("Huile d'olive (maquereau)", 10, 'ml'), ing('Citron (maquereau)', 0.5, 'pièce'),
    ],
    instructions: [
      'Griller la viande.',
      'Préparer la sauce : sauter les champignons, ajouter la crème liquide et assaisonner avec du sel, du poivre et de la noix de muscade.',
      "Préparer la salade : cuire le boulgour et les lentilles dans de l'eau puis les égoutter ; râper les carottes, l'oignon, le piment et les feuilles de menthe ; mélanger tous les ingrédients et assaisonner d'huile, jus d'un demi-citron et sel.",
      "Cuire le maquereau à la vapeur, enlever les arêtes, puis le mélanger avec la harissa, la « variante », l'huile d'olive et le jus d'un demi-citron.",
    ],
    tags: ['DietTemple', 'veau', 'maquereau'],
    image: 'cotelette-de-veau-sauce-champignons-salades',
    reviewFlags: [
      "Ingrédient « variante » (30 g) : terme non défini dans la source, à clarifier.",
      'Poids de la côtelette de veau et du maquereau non précisés.',
    ],
  },

  // ───────────────────────────── Slide 23 ─────────────────────────────
  {
    slug: 'escalope-de-poulet-grillee-salade-chaude-variee',
    title: 'Escalope de poulet grillée – salade chaude variée',
    sourceRef: 'Diapositive 23',
    status: 'published',
    calories: 830, protein: 75, carbs: 72.5, fat: 22,
    macrosApproximate: true,
    nutritionOriginal: 'Macros : 830 kcal – Protéines : 75 g – Glucides : 70 – 75 g – Lipides : ~22 g',
    servings: 1, servingLabel: '1 portion',
    preparationTimeMinutes: 30, preparationTimeLabel: '30 min',
    ingredients: [
      ing("Escalope de poulet", 150, 'g'), ing('Pomme de terre', 1, 'pièce'), ing('Carottes', 2, 'pièces'), ing('Brocolis', 200, 'g'),
      ing('Maïs', 50, 'g'), ing("Huile d'olive", 10, 'ml'), ing('Sauce fromage', 2, 'cuillères'),
      ing('Skyr (dessert)', 180, 'g (2 pots)'), ing('Melon (dessert)', 200, 'g'),
    ],
    instructions: [
      'Salade chaude : cuire à la vapeur la pomme de terre, les carottes et les brocolis, puis ajouter le maïs et assaisonner avec la sauce au fromage.',
      "Griller l'escalope et ajouter 10 ml d'huile d'olive.",
      "Dresser l'assiette.",
      'Dessert : 2 skyr (180 g) + 200 g de melon.',
    ],
    notes: ['La sauce fromage est une recette de la même collection (voir « Sauce fromage »).'],
    tags: ['DietTemple', 'poulet', 'salade chaude'],
    image: 'escalope-de-poulet-grillee-salade-chaude-variee',
    reviewFlags: [
      'Glucides donnés en fourchette (70 – 75 g) : valeur centrale utilisée.',
      'La source ne précise pas si le dessert (2 skyr + melon) est inclus dans les macros.',
    ],
  },

  // ───────────────────────────── Slide 26 (REVIEW — not published) ─────────────────────────────
  {
    slug: 'petit-dejeuner-pancake',
    title: 'Petit déjeuner : pancake, 2 pommes, noix, ricotta',
    sourceRef: 'Diapositive 26',
    status: 'review',
    calories: 579, protein: 39.2, carbs: 52.2, fat: 25.3,
    nutritionOriginal:
      'Macros pancake : 295 kcal – Protéines : 32 g – Glucides : 27 g – Lipides : 6 g. Macros petit déjeuner complet : 579 kcal – Protéines : 39,2 g – Glucides : 52,2 g – Lipides : 25,3 g',
    servings: 1, servingLabel: '1 petit déjeuner complet',
    ingredients: [
      ing('Œuf', 1, 'pièce'), ing('Skyr', 100, 'g'), ing('Farine', 30, 'g'), ing('Whey', 150, 'g'),
      ing('Levure chimique', 0.5, 'cuillère'), ing('Pommes', 2, 'pièces'), ing('Noix', 50, 'g'), ing('Ricotta', 50, 'g'),
    ],
    instructions: [
      'Mélanger tous les ingrédients du pancake.',
      'Déposer des petites louches de pâte dans une poêle légèrement beurrée et chauffer.',
      'Cuire à feu moyen.',
      'Dresser votre petit déjeuner.',
    ],
    notes: ['Le pancake seul : 295 kcal, 32 g de protéines, 27 g de glucides, 6 g de lipides.'],
    tags: ['DietTemple', 'petit déjeuner', 'pancake'],
    image: 'petit-dejeuner-pancake',
    reviewFlags: [
      "Quantité de whey (150 g) incohérente avec les macros du pancake (32 g de protéines) : probablement une erreur de saisie, à confirmer avant publication.",
      'Titre non fourni : titre déduit du contenu de la diapositive.',
    ],
  },
];

/** Slides that contain only a photo (no ingredients, no macros): never published, never invented. */
export const REVIEW_CANDIDATES: ReviewCandidate[] = [
  {
    sourceRef: 'Diapositive 24',
    image: 'photo-a-verifier-diapositive-24',
    reason: 'Photo seule : aucune recette, aucun ingrédient, aucune valeur nutritionnelle dans la source.',
  },
  {
    sourceRef: 'Diapositive 25',
    image: 'photo-a-verifier-diapositive-25',
    reason: 'Photo seule : aucune recette, aucun ingrédient, aucune valeur nutritionnelle dans la source.',
  },
];
