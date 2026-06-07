/**
 * Run meal detection on a local image file (no server needed).
 * Usage: npx ts-node src/scripts/run-meal-scan.ts path/to/image.jpg
 * Uses OPENROUTER_API_KEY or OPENAI_API_KEY from .env (or script fallback below).
 */
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

// Load .env from backend root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Optional: use this key for local testing if OPENROUTER_API_KEY is not in .env (remove before commit)
if (!process.env.OPENROUTER_API_KEY) {
  process.env.OPENROUTER_API_KEY = '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';
}

const imagePath = process.argv[2];
if (!imagePath) {
  console.error('Usage: npx ts-node src/scripts/run-meal-scan.ts <path-to-image>');
  process.exit(1);
}

const absPath = path.isAbsolute(imagePath) ? imagePath : path.resolve(process.cwd(), imagePath);
if (!fs.existsSync(absPath)) {
  console.error('File not found:', absPath);
  process.exit(1);
}

async function main() {
  const buffer = fs.readFileSync(absPath);
  const imageBase64 = buffer.toString('base64');
  console.log('Image:', absPath, 'size:', buffer.length, 'bytes');

  const { detectMealWithVision, getFallbackMealItems } = await import('../lib/mealScanVision');
  let result = await detectMealWithVision(imageBase64);
  if (!result) {
    console.log('(OpenAI non disponible ou erreur — utilisation du fallback par hash.)');
    const items = getFallbackMealItems(imageBase64);
    result = {
      items,
      notes: 'Détection basée sur l\'image. Vérifie les quantités.',
      lowConfidence: items.some((i) => i.confidence < 0.6),
    };
  }

  console.log('\n--- Meal detection result ---');
  console.log('Notes:', result.notes);
  console.log('Items:');
  result.items.forEach((i) => {
    console.log(`  - ${i.label} (${i.category}) confiance ${(i.confidence * 100).toFixed(0)}% ~${i.defaultGrams}g`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
