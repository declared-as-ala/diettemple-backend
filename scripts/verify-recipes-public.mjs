#!/usr/bin/env node
/**
 * Final production gate (runs on the CI runner, against the PUBLIC site — through Caddy, like the mobile app does).
 *
 *   node scripts/verify-recipes-public.mjs https://api.diettemple.tn
 *
 * Fails (exit 1) unless:
 *   - /health answers,
 *   - /api/recipes returns exactly the published recipes of the manifest (same titles, no duplicates, nothing else),
 *   - every recipe that must have a photo has one, and each photo URL answers 200 with an image content-type,
 *   - every recipe has ingredients and a calorie value.
 * Needs no secret and no dependency (Node 18+ fetch).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const base = (process.argv[2] || '').replace(/\/$/, '');
if (!base) {
  console.error('usage: verify-recipes-public.mjs <base url>');
  process.exit(2);
}
const manifest = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'recipes', 'manifest.json'), 'utf8'));
const problems = [];
const norm = (t) => String(t).trim().toLowerCase();

const health = await fetch(`${base}/health`).catch((e) => ({ ok: false, status: String(e) }));
if (!health.ok) problems.push(`/health → ${health.status}`);

const res = await fetch(`${base}/api/recipes?limit=100`).catch((e) => ({ ok: false, status: String(e) }));
if (!res.ok) {
  problems.push(`/api/recipes → ${res.status}`);
} else {
  const body = await res.json();
  const list = body.recipes || [];
  console.log(`API: ${list.length} recipes (total=${body.total}), expected ${manifest.publishedCount}.`);
  if (body.total !== manifest.publishedCount || list.length !== manifest.publishedCount) {
    problems.push(`API returns ${list.length} recipes (total ${body.total}), expected ${manifest.publishedCount}`);
  }
  const titles = list.map((r) => norm(r.title));
  if (new Set(titles).size !== titles.length) problems.push('duplicate titles in the API');
  const expected = new Set(manifest.publishedTitles.map(norm));
  for (const t of expected) if (!titles.includes(t)) problems.push(`missing recipe: ${t}`);
  for (const t of titles) if (!expected.has(t)) problems.push(`unexpected (legacy?) recipe still public: ${t}`);

  let withImage = 0;
  for (const r of list) {
    if (!(r.ingredients?.length > 0)) problems.push(`no ingredients: ${r.title}`);
    if (!(r.calories > 0)) problems.push(`no calories: ${r.title}`);
    if (!r.imageUrl) continue;
    const img = await fetch(`${base}${r.imageUrl}`, { method: 'HEAD' }).catch((e) => ({ ok: false, status: String(e), headers: new Headers() }));
    if (img.ok && (img.headers.get('content-type') || '').startsWith('image/')) withImage++;
    else problems.push(`photo not reachable: ${r.imageUrl} (${img.status})`);
  }
  console.log(`Photos reachable: ${withImage}/${manifest.withImageCount}.`);
  if (withImage !== manifest.withImageCount) problems.push(`photos: ${withImage}, expected ${manifest.withImageCount}`);
}

if (problems.length) {
  console.error('PUBLIC VERIFICATION FAILED:\n - ' + problems.join('\n - '));
  process.exit(1);
}
console.log('Public verification passed.');
