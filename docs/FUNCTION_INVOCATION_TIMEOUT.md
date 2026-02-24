# FUNCTION_INVOCATION_TIMEOUT — Fix, Cause, and How to Avoid It

## 1. The fix (what we changed)

- **Response timeout in `api/index.ts`**  
  If Express never sends a response (route hangs, middleware doesn’t call `next`, DB never returns, etc.), the handler now sends **503** after **55 seconds** and stops waiting. That way the function **always** returns before Vercel’s **60s** limit, so you get a controlled **503** instead of **504 FUNCTION_INVOCATION_TIMEOUT**.

- **Explicit `maxDuration`**  
  `api/index.ts` exports `config = { maxDuration: 60 }` (and `vercel.json` sets the same for both API functions). The platform will kill the function at 60s; our 25s startup timeout and 55s response timeout are both **under** that so we can respond with 503 instead of 504.

- **Already in place (from earlier work)**  
  - Cached MongoDB connection with **fast-fail** timeouts (5–10s) so DB doesn’t hang.  
  - **25s** limit on cold start (connect + load Express); after that we return 503.  
  - Products routes use `.lean()`, `.select()`, and limited page size so queries stay fast.

**What you should see after deploy:**  
- Normal case: `/api/products` and `/api/products/featured` respond in a few seconds.  
- If something hangs (DB, slow route, bug): you get **503** with a clear message and `retry: true` after ~25s (startup) or ~55s (response), **not** 504 after 60s.

---

## 2. Root cause (why this error happened)

### What the code was doing vs what it needed to do

- **Doing:**  
  The serverless handler was waiting for two things:  
  1. **Cold start:** connect to MongoDB and load the Express app (with a 25s cap).  
  2. **Request handling:** call `serverless-http(app)(req, res)` and **await** it until Express sent a response.

- **Needed:**  
  The function must **send an HTTP response and exit** within the platform’s **max duration** (60s in your config). If either cold start or Express handling takes longer than that — or if Express **never** sends a response — the platform kills the invocation and returns **504 FUNCTION_INVOCATION_TIMEOUT**.

### What actually triggered the error

One (or more) of these was true when you saw the timeout:

1. **Cold start > 60s**  
   Loading Node, dependencies, Mongoose, Express, and connecting to MongoDB took longer than 60s (e.g. slow network, cold region, heavy bundle). Our 25s startup timeout is meant to 503 before that, but if it wasn’t deployed or a different path ran, the full 60s could be hit.

2. **Express never sent a response**  
   - No route matched (wrong path), so no handler called `res.json()` / `res.send()`.  
   - A route or middleware threw before calling `res.*` and the error middleware didn’t run or didn’t send.  
   - A route awaited something that never resolved (e.g. DB query with no timeout, external API hang).  
   In all these cases `serverless-http` keeps waiting for `res.end()`; the handler never completes, and the function runs until Vercel kills it at 60s → 504.

3. **Response sent too late**  
   The route did eventually send a response, but only after 60s (e.g. very slow DB or heavy work). Again the platform kills at 60s → 504.

### Misconception / oversight

- **Mental model:** “The server runs until the request is done.”  
- **Reality:** The “server” is a short-lived function: it must **produce a response and exit** within `maxDuration`. If nothing calls `res.end()` (or it happens after 60s), the platform enforces the limit and returns 504.  
- **Oversight:** There was no **safety net** that said: “If Express hasn’t responded by 55s, we send 503 and stop waiting.” So any path where the response was delayed or never sent led straight to FUNCTION_INVOCATION_TIMEOUT.

---

## 3. The concept (why this error exists and the right mental model)

### Why the error exists and what it protects

- **Resource limits:** Serverless platforms cap how long a single invocation can run (e.g. 60s on Hobby, 300s on Pro). This prevents one request from holding a worker forever and keeps billing and capacity predictable.
- **No long-lived server:** There is no process that “stays up”; the function process is tied to one (or a few) requests and then torn down. If your code doesn’t respond in time, the platform has to stop you and return 504 so the client and the system can recover.

So the error is **the platform enforcing**: “You didn’t finish within the allowed time; I’m stopping you and telling the client the request timed out.”

### Correct mental model

- **Every request must end in a response (or explicit timeout) within `maxDuration`.**  
  “Finishing” means: the handler runs, your code (or error middleware) calls `res.send()` / `res.json()` / `res.end()`, and the `serverless-http` promise resolves. If that doesn’t happen in time, the platform will kill the function and return 504.

- **Cold start is part of the same clock.**  
  Time spent loading the app and connecting to the DB counts toward the same 60s. So you want:  
  - Fast-fail DB (return 503 if connect takes > a few seconds).  
  - A cap on “startup” (e.g. 25s) so you 503 instead of waiting the full 60s.

- **Defense in depth:**  
  1. Quick paths (`/`, `/health`) don’t load DB or Express → respond in milliseconds.  
  2. Startup timeout (25s) → if connect or app load is slow, return 503.  
  3. Response timeout (55s) → if Express hasn’t responded, send 503 and stop.  
  4. `maxDuration: 60` in config → platform hard limit; we always try to respond before it.

### How this fits into Vercel / serverless design

- **Vercel** runs your code in short-lived, stateless functions. Each request gets a new (or reused) execution context and a **maximum duration**.
- **Docs:** [FUNCTION_INVOCATION_TIMEOUT](https://vercel.com/docs/errors/FUNCTION_INVOCATION_TIMEOUT) describes exactly this: function ran longer than the allowed time → 504.
- **Design:** The framework expects you to return a response (or throw so the runtime can convert it to 5xx) within that window. It does **not** wait indefinitely; the timeout is the contract.

---

## 4. Warning signs (how to spot this again)

### Things that often lead to invocation timeout

- **Any path that might not call `res.send` / `res.json` / `res.end()`**  
  - Unhandled rejection in an async route so error middleware never runs.  
  - Route that only calls `next()` in one branch and never sends.  
  - Wrong path so no route matches and no 404 handler sends.

- **Awaiting something with no timeout**  
  - MongoDB query with no `maxTimeMS` / connection timeouts.  
  - External HTTP call with no timeout.  
  - Any `await` that can hang forever.

- **Heavy work before the first response**  
  - Large bundle load, slow DB connect, or big computation before any `res.*` call.  
  - Doing too much in a single request instead of splitting or moving to a job queue.

### Similar mistakes in related scenarios

- **Other serverless platforms (Lambda, Cloud Functions):** Same idea — there is a max execution time; if you don’t respond in time, you get a timeout error. The same “response timeout + fast-fail” pattern applies.
- **Edge / middleware:** Lower limits (e.g. a few seconds). Same principle: finish and respond quickly or fail explicitly.

### Code smells / patterns

- No timeout on `await mongoose.connect()` or on DB queries in serverless.
- No timeout around the “invoke Express” step (our 55s wrapper fixes this).
- Routes that can throw without a catch that sends a response.
- No 404 handler so unknown paths never send anything.
- Relying on “it works on my machine” without considering cold start + DB + slow routes under a single 60s cap.

---

## 5. Alternatives and trade-offs

| Approach | Trade-off |
|----------|-----------|
| **Response timeout (what we did)** | We guarantee a 503 before 60s if Express hangs. Client can retry. Simple and keeps current architecture. |
| **Increase `maxDuration`** | Only on Pro/Enterprise (e.g. 300s). Hides slow behavior; better to fix slow paths and keep a safety timeout. |
| **Fluid Compute (Vercel)** | Longer limits and different execution model. Use for long-running or background work; not required to fix normal API timeouts. |
| **Move long work off the request** | Queue + worker (e.g. Vercel background, separate worker). Request returns 202 quickly; worker does the work. Best for jobs that can’t complete in a few seconds. |
| **Edge / lighter runtimes** | Shorter limits but faster cold start. Good for very simple APIs; your Express + Mongo stack fits Node serverless better. |
| **Dedicated server (e.g. Railway, Render)** | No 60s limit per request, but you manage the server and scaling. Use when you truly need long-running requests. |

**Recommendation:** Keep the current design (Express + Mongo on Vercel with 25s startup timeout and 55s response timeout). Ensure every route and error path sends a response, and that all external/DB calls have timeouts. If you later need work that can’t finish in ~55s, move that work to a queue and return 202 from the API.
