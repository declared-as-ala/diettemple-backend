# DietTemple Backend — context for Claude

## Overview

Node.js **Express** API for DietTemple (fitness / nutrition / e‑commerce). Uses **MongoDB** (Mongoose), **JWT** auth, static file serving for `/media` and legacy `/api/videos`.

## Entry points

| Entry | Purpose |
|--------|---------|
| `src/index.ts` | Local/dev: `mongoose.connect` + `app.listen` |
| `src/app.ts` | Express app factory only — **no** `listen` or `mongoose.connect` |
| `api/index.ts` + `api/[[...path]].ts` | **Vercel serverless** — imports `app` via `serverless-http` |

Do not add `app.listen` in `app.ts`.

## URL prefix

All API routes are under **`/api`** (e.g. `/api/auth/login`, `/api/admin/...`).

## Auth

- **JWT**: `Authorization: Bearer <token>`. Secret: **`JWT_SECRET`** (required, ≥32 chars recommended).
- **Admin routes**: `app.use('/api/admin', authenticate, requireAdmin, adminRoutes)` — user must have `role: 'admin'`.

## Major route modules (`src/routes/`)

- `auth.routes` → `/api/auth`
- `products`, `favorites`, `cart`, `orders`, `promo`, `payments`
- `home.routes` → `/api/home` (authenticated)
- `workout`, `checkin`, `verification`, `me`, `foods`
- `recipes` → `/api/recipes`
- **`admin.routes`** → `/api/admin` — products, orders, users, exercises (CRUD + video upload), sessions, nutrition, clients, dashboards, etc.

Admin exercise muscle groups: `GET /api/admin/exercises/muscle-groups` uses `Exercise.distinct('muscleGroup')`.

## Models

`src/models/*.model.ts` — Mongoose schemas (User, Exercise, Product, Order, etc.).

## Media / uploads

- Public files: **`/media`** → `storage/public` (or Vercel tmp).
- Legacy videos: **`/api/videos`**, **`/videos`** → `storage/video`.
- Admin exercise video upload: `POST /api/admin/exercises/:id/video` (multer).

## Environment (typical)

- **`MONGODB_URI`** — required for DB.
- **`JWT_SECRET`** — required.
- **`CORS_ORIGIN`** — optional comma-separated origins; empty = allow all.

Copy from `.env` locally; never commit secrets.

## Scripts (`npm run`)

- **`dev`** — `ts-node-dev` hot reload.
- **`build`** — `tsc` → `dist/`.
- **`start`** — `node dist/index.js`.
- **`seed:*`** — various seeds (`seed:exercises`, `seed:all`, etc.). See `package.json`.

## Deployment notes

- **PM2 / VPS**: build with `npm run build`, run `dist/index.js`, restart after git pull.
- **Vercel**: uses `api/` folder; ensure `MONGODB_URI` and `JWT_SECRET` in project env.

## Conventions for edits

- Use **TypeScript**; type Express `req`/`res` (`AuthRequest`, `Response`) to avoid `TS7006`.
- New admin endpoints belong in `admin.routes.ts` (or a sub-router) under `/api/admin`.
- Global 404 returns `{ message: 'Not found', path: req.path }` — if you see this for a valid path, the route is not registered or method mismatch.

---

*Generated for DietTemple backend — update when architecture changes.*
