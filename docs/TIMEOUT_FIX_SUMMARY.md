# 504 Timeout Fix — Summary and Verification

## 1. Root cause(s) in this codebase

- **DB connection:** Connection was reused via global promise but timeouts were hardcoded; no env-driven tuning or `maxIdleTimeMS`. Risk of burning platform time on slow Atlas.
- **No app-level request budget:** Only the Vercel handler had a 55s response timeout; Express had no middleware to return 503 before the platform 504.
- **Unbounded or heavy queries:** `/api/recipes` and `/api/orders` (GET list) had no `limit` or `maxTimeMS`; favorites had no `limit` or query timeout; some product routes lacked `maxTimeMS`.
- **Error response shape:** Some routes returned only `{ message }`; error handler now consistently sends `{ error, message }` and always sends a response so the request never hangs.
- **No request timeout middleware:** Long-running routes could run until the platform killed the function (504) instead of failing fast with 503.

---

## 2. Files changed

| File | Change |
|------|--------|
| `src/lib/mongoServerless.ts` | Env-driven timeouts and pool (`MONGODB_*`), `maxIdleTimeMS`, singleton reuse; no `close()` in request path. |
| `src/middleware/requestTimeout.middleware.ts` | **New.** Request budget middleware (default 25s); sends 503 if no response within budget. |
| `src/middleware/logger.middleware.ts` | Error handler returns `{ error, message }`; added `[slow]` log when responseTime > 5s. |
| `src/app.ts` | Use `requestTimeoutMiddleware`, `express.json({ limit: '1mb' })`. |
| `src/routes/products.routes.ts` | `maxTimeMS` on categories, findById, search/suggestions; error responses `{ error, message }`. |
| `src/routes/favorites.routes.ts` | `maxTimeMS`, `limit(100)`, lean populate with select; error `{ error, message }`. |
| `src/routes/recipes.routes.ts` | `maxTimeMS`, `limit` (default 50, max 100); error `{ error, message }`. |
| `src/routes/foods.routes.ts` | `maxTimeMS` on both finds; error `{ error, message }`. |
| `src/routes/orders.routes.ts` | GET list: `maxTimeMS`, `limit` (default 50, max 100); error `{ error, message }`. |
| `api/index.ts` | Log includes method (e.g. `GET /api/products`). |

---

## 3. Env vars (optional overrides)

Set in Vercel → Project → Settings → Environment Variables (or in `.env` locally).

| Variable | Example | Description |
|----------|---------|-------------|
| `MONGODB_URI` | `mongodb+srv://...` | **Required.** Atlas connection string. |
| `MONGODB_SERVER_SELECTION_TIMEOUT_MS` | `5000` | Server selection timeout (default 5000). |
| `MONGODB_CONNECT_TIMEOUT_MS` | `5000` | TCP connect timeout (default 5000). |
| `MONGODB_SOCKET_TIMEOUT_MS` | `10000` | Socket idle timeout (default 10000). |
| `MONGODB_MAX_POOL_SIZE` | `10` | Max connections per process (default 10). |
| `MONGODB_MAX_IDLE_TIME_MS` | `60000` | Idle socket close (default 60000). |
| `MONGODB_WAIT_QUEUE_TIMEOUT_MS` | `2000` | Max wait for pool socket (default 2000). |
| `MONGODB_CONNECT_TOTAL_TIMEOUT_MS` | `15000` | Hard cap on connect (default 15000). |
| `REQUEST_BUDGET_MS` | `25000` | App-level request timeout; return 503 after this (default 25000). |

---

## 4. Quick test steps

### Local

```bash
cd backend
npm run build
# Set MONGODB_URI in .env, then:
npx ts-node src/index.ts
```

- `GET http://localhost:5000/health` → 200 quickly.
- `GET http://localhost:5000/api/products` → 200 with `{ products, pagination }`.
- `GET http://localhost:5000/api/products/featured` → 200 with `{ products }`.
- `GET http://localhost:5000/api/recipes?limit=5` → 200 with at most 5 recipes.

### Production (Vercel)

1. Deploy (push or `vercel --prod` from `backend`).
2. In Atlas → Network Access → allow `0.0.0.0/0` (or use Vercel Static IPs and allow those).
3. In Vercel → Settings → Environment Variables, set `MONGODB_URI`.
4. **Verify:**
   - `GET https://<your-project>.vercel.app/health` → 200.
   - `GET https://<your-project>.vercel.app/api/products` → 200 in a few seconds (cold start may take 5–15s once).
   - `GET https://<your-project>.vercel.app/api/products/featured` → 200.
5. In Vercel → Logs: check for `[vercel] request start`, `[vercel] after connect`, `[products list] query=...ms`; no `FUNCTION_INVOCATION_TIMEOUT` / 504.

### Timeout behavior

- If DB or startup is slow: app returns **503** with `{ error, message, retry: true }` (or `request_timeout`) instead of platform **504**.
- Requests that exceed `REQUEST_BUDGET_MS` get 503 from the timeout middleware.

---

## 5. Compatibility

- **API shape:** Response bodies for success cases unchanged (`products`, `pagination`, `orders`, `favorites`, `recipes`, `foods`). Added optional `limit` (and `page` where it existed) on list endpoints.
- **Endpoints:** No renames or removals.
- **Vercel:** Still Node runtime (no Edge); `vercel.json` functions `maxDuration: 60` unchanged.
