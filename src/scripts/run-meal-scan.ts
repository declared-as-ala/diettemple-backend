/**
 * Run meal detection on a local image file (no server needed).
 * Usage: npx ts-node src/scripts/run-meal-scan.ts path/to/image.jpg
 * Uses GEMINI_API_KEY from .env.
 */
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

// Load .env from backend root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

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

  const { detectMealWithVision } = await import('../lib/mealScanVision');
  const result = await detectMealWithVision(imageBase64);
  if (!result) {
    throw new Error('Gemini meal analysis failed. Check GEMINI_API_KEY and the input image.');
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
