import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import Product from '../models/Product.model';

const envPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: envPath });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/diettemple';

const products = [
  // WHEY PROTEINS
  {
    name: 'Optimum Nutrition Gold Standard 100% Whey',
    brand: 'Optimum Nutrition',
    category: 'Whey Protein',
    description: 'Industry-leading whey protein isolate. Fast-absorbing, low carb.',
    price: 89.99,
    uhPrice: 69.99,
    discount: 0,
    images: ['https://m.media-amazon.com/images/I/71f+UBXh2vL._AC_UL320_.jpg'],
    stock: 25,
    isFeatured: true,
    tags: ['whey', 'isolate', 'post-workout']
  },
  {
    name: 'Muscletech Nitro-Tech Performance Series',
    brand: 'Muscletech',
    category: 'Whey Protein',
    description: 'Premium whey protein with added creatine and performance boosters.',
    price: 79.99,
    uhPrice: 59.99,
    discount: 15,
    images: ['https://m.media-amazon.com/images/I/812ch9i46AL._AC_UL320_.jpg'],
    stock: 18,
    isFeatured: true,
    tags: ['whey', 'creatine', 'performance']
  },
  {
    name: 'Dymatize ISO-100 Hydrolyzed Whey Isolate',
    brand: 'Dymatize',
    category: 'Whey Isolate',
    description: 'Ultra-pure whey isolate. Ultra-fast absorption.',
    price: 99.99,
    uhPrice: 74.99,
    discount: 0,
    images: ['https://m.media-amazon.com/images/I/81gq678bzQL._AC_UL320_.jpg'],
    stock: 22,
    isFeatured: true,
    tags: ['isolate', 'hydrolyzed', 'fast-absorbing']
  },
  {
    name: 'Isopure Zero Carb Whey Protein Isolate',
    brand: 'Isopure',
    category: 'Whey Isolate',
    description: 'Zero carbs, zero sugar. Pure protein.',
    price: 65.99,
    uhPrice: 49.99,
    discount: 12,
    images: ['https://m.media-amazon.com/images/I/71yL2Z5ytwL._AC_UL320_.jpg'],
    stock: 30,
    isFeatured: false,
    tags: ['zero-carb', 'isolate', 'lean']
  },

  // MASS GAINERS
  {
    name: 'Mutant Mass Weight Gainer High-Calorie',
    brand: 'Mutant',
    category: 'Mass Gainer',
    description: 'Premium mass gainer. 1250 calories per serving.',
    price: 179.99,
    uhPrice: 129.99,
    discount: 10,
    images: ['https://m.media-amazon.com/images/I/71iZ0PT8znL._AC_UL320_.jpg'],
    stock: 12,
    isFeatured: true,
    tags: ['mass-gainer', 'high-calorie', 'bulking']
  },
  {
    name: 'Serious Mass by Optimum Nutrition',
    brand: 'Optimum Nutrition',
    category: 'Mass Gainer',
    description: 'Best-selling mass gainer. 1250 calories per serving.',
    price: 159.99,
    uhPrice: 119.99,
    discount: 0,
    images: ['https://m.media-amazon.com/images/I/71HjvVnPj5L._AC_UL320_.jpg'],
    stock: 28,
    isFeatured: true,
    tags: ['mass-gainer', 'high-calorie', 'bulking']
  },
  {
    name: 'Dymatize Super Mass Gainer',
    brand: 'Dymatize',
    category: 'Mass Gainer',
    description: 'Lean mass gainer. 1280 calories per serving.',
    price: 169.99,
    uhPrice: 124.99,
    discount: 15,
    images: ['https://m.media-amazon.com/images/I/81gq678bzQL._AC_UL320_.jpg'],
    stock: 20,
    isFeatured: true,
    tags: ['mass-gainer', 'bulking']
  },
  {
    name: 'GNC Pro Performance Bulk Mass Gainer',
    brand: 'GNC',
    category: 'Mass Gainer',
    description: 'High-protein mass gainer with added amino acids.',
    price: 149.99,
    uhPrice: 109.99,
    discount: 8,
    images: ['https://m.media-amazon.com/images/I/711lPoCfHtL._AC_UL320_.jpg'],
    stock: 16,
    isFeatured: false,
    tags: ['mass-gainer', 'amino-acids']
  },

  // CREATINE
  {
    name: 'Creatine Monohydrate Micronized Pure',
    brand: 'Generic',
    category: 'Creatine',
    description: 'Pure creatine monohydrate. Micronized for fast absorption.',
    price: 24.99,
    uhPrice: 17.99,
    discount: 0,
    images: ['https://m.media-amazon.com/images/I/61EcGMut+IL._AC_UL320_.jpg'],
    stock: 50,
    isFeatured: false,
    tags: ['creatine', 'strength', 'performance']
  },
  {
    name: 'Muscletech Creatine Nitrate NO-XPLODE',
    brand: 'Muscletech',
    category: 'Creatine',
    description: 'Creatine with nitrogen boost for endurance.',
    price: 39.99,
    uhPrice: 28.99,
    discount: 20,
    images: ['https://m.media-amazon.com/images/I/81oKw3jimSL._AC_UL320_.jpg'],
    stock: 15,
    isFeatured: false,
    tags: ['creatine', 'nitrogen', 'endurance']
  },

  // BCAA & AMINO ACIDS
  {
    name: 'Optimum Nutrition Essential Amino Energy',
    brand: 'Optimum Nutrition',
    category: 'BCAA',
    description: 'BCAA with energy for intra-workout fuel.',
    price: 49.99,
    uhPrice: 36.99,
    discount: 12,
    images: ['https://m.media-amazon.com/images/I/71xwbTGuHVL._AC_UL320_.jpg'],
    stock: 22,
    isFeatured: true,
    tags: ['bcaa', 'energy', 'intra-workout']
  },
  {
    name: 'Scivation Xtend BCAA Powder',
    brand: 'Scivation',
    category: 'BCAA',
    description: 'Pure BCAA complex with added ingredients for recovery.',
    price: 59.99,
    uhPrice: 43.99,
    discount: 10,
    images: ['https://m.media-amazon.com/images/I/71aBrpNU4lL._AC_UL320_.jpg'],
    stock: 18,
    isFeatured: false,
    tags: ['bcaa', 'recovery', 'intra-workout']
  },

  // PRE-WORKOUT
  {
    name: 'C4 Original Pre-Workout Explosive Energy',
    brand: 'Cellucor',
    category: 'Pre-Workout',
    description: 'Best-selling pre-workout. Intense energy and focus.',
    price: 44.99,
    uhPrice: 32.99,
    discount: 0,
    images: ['https://m.media-amazon.com/images/I/81XYlY8EpqL._AC_UL320_.jpg'],
    stock: 30,
    isFeatured: true,
    tags: ['pre-workout', 'energy', 'focus']
  },
  {
    name: 'Mr. Hyde Signature Pre-Workout',
    brand: 'ProSupps',
    category: 'Pre-Workout',
    description: 'Hardcore pre-workout with intense pump and strength.',
    price: 49.99,
    uhPrice: 36.99,
    discount: 15,
    images: ['https://m.media-amazon.com/images/I/61mJV2a-RxL._AC_UL320_.jpg'],
    stock: 14,
    isFeatured: true,
    tags: ['pre-workout', 'pump', 'strength']
  },
  {
    name: 'Optimum Nutrition Gold Standard Pre-Workout',
    brand: 'Optimum Nutrition',
    category: 'Pre-Workout',
    description: 'Premium pre-workout with citrulline and beta-alanine.',
    price: 54.99,
    uhPrice: 39.99,
    discount: 18,
    images: ['https://m.media-amazon.com/images/I/81TRlb34DmL._AC_UL320_.jpg'],
    stock: 20,
    isFeatured: false,
    tags: ['pre-workout', 'pump', 'endurance']
  },

  // FAT BURNERS
  {
    name: 'Leanbean Fat Burner for Women',
    brand: 'Leanbean',
    category: 'Fat Burner',
    description: 'Premium fat burner designed for women. Natural ingredients.',
    price: 69.99,
    uhPrice: 51.99,
    discount: 0,
    images: ['https://m.media-amazon.com/images/I/71duchiUWiL._AC_UL320_.jpg'],
    stock: 16,
    isFeatured: true,
    tags: ['fat-burner', 'women', 'natural']
  },
  {
    name: 'Hydroxycut Hardcore Next Gen',
    brand: 'Hydroxycut',
    category: 'Fat Burner',
    description: 'Powerful fat burner with metabolism boost.',
    price: 59.99,
    uhPrice: 43.99,
    discount: 12,
    images: ['https://m.media-amazon.com/images/I/713Q8Rls3mL._AC_UL320_.jpg'],
    stock: 19,
    isFeatured: false,
    tags: ['fat-burner', 'metabolism', 'energy']
  },

  // RECOVERY & JOINT
  {
    name: 'Optimum Nutrition Collagen Peptides',
    brand: 'Optimum Nutrition',
    category: 'Joint Health',
    description: 'Pure collagen for joint health and skin. Unflavored.',
    price: 34.99,
    uhPrice: 25.99,
    discount: 10,
    images: ['https://m.media-amazon.com/images/I/71HY8meqhpL._AC_UL320_.jpg'],
    stock: 24,
    isFeatured: false,
    tags: ['collagen', 'joint-health', 'recovery']
  },
  {
    name: 'MuscleTech Glycofuse Carbohydrate',
    brand: 'MuscleTech',
    category: 'Recovery',
    description: 'Post-workout carb source for recovery and glycogen replenishment.',
    price: 39.99,
    uhPrice: 28.99,
    discount: 0,
    images: ['https://m.media-amazon.com/images/I/51gQ4tRPYAL._AC_UL320_.jpg'],
    stock: 17,
    isFeatured: true,
    tags: ['carbs', 'recovery', 'post-workout']
  },

  // VITAMINS & MINERALS
  {
    name: 'Optimum Nutrition Opti-Men Multivitamin',
    brand: 'Optimum Nutrition',
    category: 'Vitamins',
    description: 'Complete multivitamin for men. 150 tablets.',
    price: 24.99,
    uhPrice: 17.99,
    discount: 20,
    images: ['https://m.media-amazon.com/images/I/71imSk7NXHL._AC_UL320_.jpg'],
    stock: 35,
    isFeatured: false,
    tags: ['vitamins', 'multivitamin', 'health']
  },
  {
    name: 'Nature Made Vitamin D3 5000 IU',
    brand: 'Nature Made',
    category: 'Vitamins',
    description: 'Essential vitamin D for bone and immune health.',
    price: 14.99,
    uhPrice: 10.99,
    discount: 0,
    images: ['https://m.media-amazon.com/images/I/71dZUVQvYkL._AC_UL320_.jpg'],
    stock: 40,
    isFeatured: false,
    tags: ['vitamin-d', 'health', 'bones']
  },

  // SNACKS & BARS
  {
    name: 'Quest Nutrition Protein Bar Box',
    brand: 'Quest',
    category: 'Protein Bar',
    description: 'High-protein, low-carb snack bars. 20g protein per bar.',
    price: 29.99,
    uhPrice: 21.99,
    discount: 8,
    images: ['https://m.media-amazon.com/images/I/81Z-NuSnQL._AC_UL320_.jpg'],
    stock: 50,
    isFeatured: true,
    tags: ['protein-bar', 'snack', 'low-carb']
  },
  {
    name: 'Optimum Nutrition Protein Crisp Bar',
    brand: 'Optimum Nutrition',
    category: 'Protein Bar',
    description: 'Crispy protein bar with 10g protein per bar.',
    price: 24.99,
    uhPrice: 17.99,
    discount: 15,
    images: ['https://m.media-amazon.com/images/I/811Z-NuSnQL._AC_UL320_.jpg'],
    stock: 45,
    isFeatured: false,
    tags: ['protein-bar', 'snack', 'crispy']
  }
];

async function seedProducts() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected');

    console.log('🗑️  Clearing existing products...');
    await Product.deleteMany({});
    console.log('✅ Cleared');

    console.log('📦 Inserting new products...');
    const inserted = await Product.insertMany(products);
    console.log(`✅ Inserted ${inserted.length} products\n`);

    // Summary
    const categories = await Product.distinct('category');
    console.log('📊 Summary:');
    for (const cat of categories) {
      const count = await Product.countDocuments({ category: cat });
      console.log(`   ${cat}: ${count}`);
    }

    const featured = await Product.countDocuments({ isFeatured: true });
    console.log(`\n⭐ Featured: ${featured}`);
    console.log(`💰 Total: ${inserted.length}`);
    console.log('✅ Done!');

    await mongoose.disconnect();
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

seedProducts();
