/**
 * Run gym photo validation on a local image (no server needed).
 * Usage: npx ts-node src/scripts/run-gym-verify.ts path/to/gym.jpg
 */
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Optional: use OpenRouter key for local testing if not in .env (so AI runs)
if (!process.env.OPENROUTER_API_KEY) {
  process.env.OPENROUTER_API_KEY = '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';
}

const imagePath = process.argv[2];
if (!imagePath) {
  console.error('Usage: npx ts-node src/scripts/run-gym-verify.ts <path-to-image>');
  process.exit(1);
}

const absPath = path.isAbsolute(imagePath) ? imagePath : path.resolve(process.cwd(), imagePath);
if (!fs.existsSync(absPath)) {
  console.error('File not found:', absPath);
  process.exit(1);
}

async function main() {
  const { validateGymPhoto } = await import('../lib/gymVerify');
  const result = await validateGymPhoto(absPath, {});
  console.log('\n--- Gym verification result ---');
  console.log('Accepted:', result.accepted);
  console.log('Reason:', result.reason);
  if (result.aiScore != null) console.log('AI score:', result.aiScore);
  if (result.gpsDistance != null) console.log('GPS distance (m):', result.gpsDistance);
  if (result.details) console.log('Details:', result.details);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
