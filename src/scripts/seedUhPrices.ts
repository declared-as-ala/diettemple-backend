/**
 * seedUhPrices.ts
 * Adds uhPrice (and optionally isUhExclusive) to existing products.
 * Run: npx ts-node src/scripts/seedUhPrices.ts
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import Product from '../models/Product.model';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/diettemple';

// Discount percentages applied to the first N products we find.
// Keyed by product name substring (case-insensitive). Fallback is index-based.
const UH_DISCOUNTS: Array<{ match: string; pct: number; exclusive?: boolean }> = [
  { match: 'Whey',           pct: 12, exclusive: false },
  { match: 'Gold Standard',  pct: 14, exclusive: true  },
  { match: 'Creatine',       pct: 10, exclusive: false },
  { match: 'BCAA',           pct: 15, exclusive: false },
  { match: 'Pre-Workout',    pct: 18, exclusive: true  },
  { match: 'Mass',           pct: 10, exclusive: false },
  { match: 'Serious Mass',   pct: 12, exclusive: false },
  { match: 'GNC',            pct: 8,  exclusive: false },
  { match: 'Mutant',         pct: 15, exclusive: false },
  { match: 'Nutricost',      pct: 10, exclusive: false },
  { match: 'Vitamin',        pct: 20, exclusive: false },
  { match: 'Protein',        pct: 10, exclusive: false },
];

// Fallback: apply this pct to products not matched by name
const FALLBACK_PCT = 10;

async function run() {
  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected to MongoDB');

  const products = await Product.find({});
  console.log(`Found ${products.length} products`);

  let updated = 0;
  for (const product of products) {
    const name = (product.name || '').toLowerCase();
    const rule = UH_DISCOUNTS.find((r) => name.includes(r.match.toLowerCase()));
    const pct   = rule?.pct ?? FALLBACK_PCT;
    const excl  = rule?.exclusive ?? false;

    const basePrice = product.price ?? 0;
    if (!basePrice) continue;

    const uhPrice = Math.round(basePrice * (1 - pct / 100));

    await Product.updateOne(
      { _id: product._id },
      { $set: { uhPrice, isUhExclusive: excl } }
    );
    console.log(`  ✓ ${product.name}: ${basePrice} DT → UH ${uhPrice} DT (-${pct}%)${excl ? ' [EXCLUSIVE]' : ''}`);
    updated++;
  }

  console.log(`\n✅ Done — ${updated} products updated with uhPrice`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
