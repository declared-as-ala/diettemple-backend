# Deploy DietTemple Backend to Vercel

## Why `/api/*` routes work (path preservation)

Requests to `/api/products`, `/api/orders`, etc. must reach Express with the correct path. The rewrite `/(.*) -> /api` would send every request to the same handler with path `/api`, so only the root responded. The fix:

- **`api/[[...path]].ts`** (catch-all) handles `/api/anything`. It reconstructs `req.url` from `req.query.path` and calls the same handler as `api/index.ts`.
- **vercel.json** rewrites `/api/(.*)` to `/api/$1` so the path is preserved; only then does the catch-all run with the right segments.

Root `/` and `/health` still rewrite to `/api` and are answered by `api/index.ts` without loading Express.

## Fix: "Missing public directory" / "Missing build script"

This project is **API-only** (serverless functions in `api/`). Vercel must not expect a frontend build or a `public` folder.

1. Open **Vercel Dashboard** → your project → **Settings** → **Build & Development Settings**.
2. Set **Framework Preset** to **Other** (or "No framework").
3. **Build Command**: leave **empty** or delete any value (the build is defined in `vercel.json` via `builds`).
4. **Output Directory**: leave **empty** or delete any value. Do **not** set `public` or `dist` — there is no static output.
5. Save and **Redeploy**.

If **Root Directory** is set, it must point to the folder that contains `vercel.json` and the `api/` folder (e.g. `backend`).

---

If **Vercel does not auto-deploy when you push**, use one of these approaches.

---

## Option 1: Set Root Directory in Vercel (Git deploy)

Your Git repo root might be the whole repo (e.g. `C:/Users/Ala` or the DietTemple folder). Vercel must build from the **backend** folder.

1. Open [Vercel Dashboard](https://vercel.com/dashboard) → your **diettemple-backend** project.
2. Go to **Settings** → **General**.
3. Under **Root Directory**, click **Edit**.
4. Set it to the path of the backend **from the repo root**:
   - If the repo root is **DietTemple**: use `backend`.
   - If the repo root is something else: use the path that contains `vercel.json` and `api/` (e.g. `Desktop/DietTemple/backend` if your repo root is your user folder).
5. Save. **Redeploy** (Deployments → … on latest → Redeploy) so the new root is used.

After this, every push to the connected branch will trigger a build from that folder.

---

## Option 2: Deploy from backend folder with Vercel CLI (no Git needed)

You can deploy from your machine without relying on Git auto-deploy.

1. Install Vercel CLI (once):
   ```bash
   npm i -g vercel
   ```

2. From the **backend** folder, run:
   ```bash
   cd c:\Users\Ala\Desktop\DietTemple\backend
   vercel --prod
   ```
   If asked, link to your existing **diettemple-backend** project.

3. To deploy again after changes, run the same:
   ```bash
   cd c:\Users\Ala\Desktop\DietTemple\backend
   vercel --prod
   ```

This uses the code on your PC and does not depend on Git or Root Directory.

---

## Option 3: Use a repo that has the backend at the root

If you create a Git repo whose **root** is the backend folder (so the repo contains `vercel.json`, `api/`, `src/`, `package.json` at the top level), then:

1. In Vercel, create a **new** project and import that repo.
2. Leave **Root Directory** empty.
3. Push to the default branch → Vercel will detect the project and deploy.

---

## Checklist

- [ ] **Root Directory** in Vercel points to the folder that contains `vercel.json` and `api/index.ts`.
- [ ] You are pushing to the branch that Vercel is watching (e.g. `main` or `master`).
- [ ] In Vercel → **Settings** → **Git**, "Production Branch" is the branch you push to.
- [ ] If you use **Option 2**, run `vercel --prod` from `DietTemple\backend` after making changes.
