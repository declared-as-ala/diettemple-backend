/**
 * Test script for gym verification and meal scan endpoints.
 *
 * Usage (from backend directory):
 *   node scripts/test-gym-meal-endpoints.js [gym-image-path] [meal-image-path]
 *
 * Env (or .env in backend root):
 *   API_BASE_URL  - e.g. http://localhost:3000 (default)
 *   AUTH_TOKEN    - JWT (required)
 *   SESSION_ID    - optional; if not set, script tries GET /api/me/today for sessionTemplateId
 *
 * Place test images in backend/test-images/ (see test-images/README.md).
 */

const fs = require('fs');
const path = require('path');

// Load .env from backend root so AUTH_TOKEN can be set there
try {
  const dotenv = require('dotenv');
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) dotenv.config({ path: envPath });
} catch (_) {}

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const AUTH_TOKEN = process.env.AUTH_TOKEN;
const SESSION_ID = process.env.SESSION_ID;

const testImagesDir = path.join(__dirname, '..', 'test-images');
const defaultGymImage = path.join(testImagesDir, 'gym-ok.jpg');
const defaultMealImage = path.join(testImagesDir, 'meal1.jpg');
const placeholderGym = path.join(testImagesDir, 'gym-placeholder.png');
const placeholderMeal = path.join(testImagesDir, 'meal-placeholder.png');

// Minimal 1x1 PNG (valid image; gym will reject for size/dimensions, meal scan can use fallback)
const MINIMAL_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function ensureTestImagesDir() {
  if (!fs.existsSync(testImagesDir)) fs.mkdirSync(testImagesDir, { recursive: true });
}

function ensurePlaceholderImage(requestedPath, label, placeholderPath) {
  if (fs.existsSync(requestedPath)) return requestedPath;
  ensureTestImagesDir();
  const buf = Buffer.from(MINIMAL_PNG_BASE64, 'base64');
  fs.writeFileSync(placeholderPath, buf);
  console.log(`(Pas d'image: ${path.basename(requestedPath)}. Placeholder créé: ${path.basename(placeholderPath)}. Le gym sera probablement refusé, le meal utilisera le fallback.)`);
  return placeholderPath;
}

function log(msg, data = null) {
  console.log(msg);
  if (data != null) console.log(JSON.stringify(data, null, 2));
}

function getDateKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function getSessionId() {
  if (SESSION_ID) return SESSION_ID;
  const res = await fetch(`${API_BASE_URL}/api/me/today`, {
    headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
  });
  if (!res.ok) {
    throw new Error(`GET /api/me/today failed: ${res.status}`);
  }
  const data = await res.json();
  const id = data?.todaySession?.sessionTemplateId || data?.sessionTemplateId;
  if (id) return id;
  throw new Error('No session for today. Set SESSION_ID env to a valid session template ID.');
}

async function testGymVerify(imagePath) {
  const resolved = ensurePlaceholderImage(imagePath, 'gym', placeholderGym);
  const sessionId = await getSessionId();
  const form = new FormData();
  form.append('sessionId', sessionId);
  form.append('dateKey', getDateKey());
  form.append('capturedAt', new Date().toISOString());
  form.append('deviceInfo', 'Test script (Node)');
  const buf = fs.readFileSync(resolved);
  const mime = path.extname(resolved).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
  const blob = new Blob([buf], { type: mime });
  form.append('photo', blob, path.basename(resolved));

  const res = await fetch(`${API_BASE_URL}/api/checkin/gym/start`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
    body: form,
  });

  const body = await res.json().catch(() => ({}));
  if (res.ok) {
    log('--- Gym verify: ACCEPTED ---', body);
  } else {
    log('--- Gym verify: REJECTED ---', {
      status: res.status,
      code: body.code,
      message: body.message,
      aiScore: body.aiScore,
    });
  }
}

async function testMealScan(imagePath) {
  const resolved = ensurePlaceholderImage(imagePath, 'meal', placeholderMeal);
  const buf = fs.readFileSync(resolved);
  const imageBase64 = buf.toString('base64');

  const res = await fetch(`${API_BASE_URL}/api/me/nutrition/scan-meal`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${AUTH_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ imageBase64 }),
  });

  const body = await res.json().catch(() => ({}));
  if (res.ok) {
    log('--- Meal scan: result ---', {
      items: body.items?.length ?? 0,
      labels: body.items?.map((i) => ({ label: i.label, confidence: i.confidence })),
      notes: body.notes,
    });
  } else {
    log('--- Meal scan: error ---', { status: res.status, message: body.message });
  }
}

async function main() {
  if (!AUTH_TOKEN) {
    console.error('Set AUTH_TOKEN (JWT) to run this script.');
    process.exit(1);
  }

  const gymPath = process.argv[2] || defaultGymImage;
  const mealPath = process.argv[3] || defaultMealImage;

  log('API_BASE_URL:', API_BASE_URL);
  log('Gym image:', gymPath);
  log('Meal image:', mealPath);

  await testGymVerify(gymPath);
  console.log('');
  await testMealScan(mealPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
