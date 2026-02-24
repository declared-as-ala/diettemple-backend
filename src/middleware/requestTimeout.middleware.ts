/**
 * Request timeout: return 503 before platform (Vercel) kills the function with 504.
 * Set REQUEST_BUDGET_MS below your Vercel maxDuration (e.g. 25s when maxDuration=60).
 */
import { Request, Response, NextFunction } from 'express';

const REQUEST_BUDGET_MS = Number(process.env.REQUEST_BUDGET_MS ?? 25_000);

export function requestTimeoutMiddleware(req: Request, res: Response, next: NextFunction): void {
  const timer = setTimeout(() => {
    if (!res.headersSent) {
      console.error(`[timeout] request exceeded ${REQUEST_BUDGET_MS}ms path=${req.method} ${req.path}`);
      res.status(503).json({
        error: 'request_timeout',
        message: `Request exceeded ${REQUEST_BUDGET_MS}ms budget. Please retry.`,
      });
    }
  }, REQUEST_BUDGET_MS);

  const clear = () => clearTimeout(timer);
  res.once('finish', clear);
  res.once('close', clear);
  next();
}
