// One-off test: verify GEMINI_API_KEY works, then ask Gemini to identify the meal in scripts/image.png
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';
const IMAGE_PATH = path.join(__dirname, 'image.png');

async function testKeyIsValid() {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Key check failed (${res.status}): ${JSON.stringify(data)}`);
  }
  console.log(`Key is valid. ${data.models?.length ?? 0} models available.`);
}

async function recognizeMeal() {
  const imageBuffer = fs.readFileSync(IMAGE_PATH);
  const base64Image = imageBuffer.toString('base64');

  const body = {
    contents: [
      {
        parts: [
          { text: 'Identify what meal/dish this is and list the visible ingredients and an estimated calorie range. Be concise.' },
          { inline_data: { mime_type: 'image/png', data: base64Image } },
        ],
      },
    ],
  };

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`generateContent failed (${res.status}): ${JSON.stringify(data)}`);
  }
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '(no text returned)';
  console.log('\n--- Gemini meal recognition ---\n' + text);
}

(async () => {
  if (!API_KEY) {
    console.error('GEMINI_API_KEY missing from backend/.env');
    process.exit(1);
  }
  try {
    await testKeyIsValid();
    await recognizeMeal();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
})();
