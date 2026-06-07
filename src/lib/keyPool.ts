/**
 * KeyPool — round-robin API key rotation with rate-limit tracking.
 *
 * Usage:
 *   const pool = new KeyPool('GROQ_API_KEY', 'GROQ_API_KEY_2', 'GROQ_API_KEY_3');
 *   const key = pool.getKey();           // next available key
 *   pool.markRateLimited(key, retryAfterMs);  // called on 429
 *
 * Reads keys from env vars. Falls back gracefully when all are exhausted.
 */
export class KeyPool {
  private keys: string[];
  private cooldowns: Map<string, number> = new Map(); // key → timestamp when usable again
  private index = 0;

  constructor(...envVarNames: string[]) {
    this.keys = envVarNames
      .map(name => process.env[name] ?? '')
      .filter(Boolean);

    if (this.keys.length === 0) {
      console.warn(`[KeyPool] No API keys found for vars: ${envVarNames.join(', ')}`);
    } else {
      console.log(`[KeyPool] Loaded ${this.keys.length} key(s) for: ${envVarNames[0]}`);
    }
  }

  /** Returns the next available key, or null if all are rate-limited. */
  getKey(): string | null {
    const now = Date.now();
    const total = this.keys.length;

    // Try each key starting from current index (round-robin)
    for (let i = 0; i < total; i++) {
      const key = this.keys[(this.index + i) % total];
      const cooldownUntil = this.cooldowns.get(key) ?? 0;

      if (now >= cooldownUntil) {
        this.index = (this.index + i + 1) % total; // advance for next call
        return key;
      }
    }

    // All keys are rate-limited — return the one that recovers soonest
    const soonest = this.keys.reduce((a, b) =>
      (this.cooldowns.get(a) ?? 0) < (this.cooldowns.get(b) ?? 0) ? a : b
    );
    const wait = Math.max(0, (this.cooldowns.get(soonest) ?? 0) - now);
    console.warn(`[KeyPool] All keys exhausted. Soonest available in ${Math.ceil(wait / 1000)}s`);
    return null;
  }

  /**
   * Call this when you receive a 429 response.
   * @param key         The key that was rate-limited
   * @param retryAfterMs How long to wait (from Retry-After header). Default: 60s
   */
  markRateLimited(key: string, retryAfterMs = 60_000): void {
    this.cooldowns.set(key, Date.now() + retryAfterMs);
    const remaining = this.keys.filter(k => (this.cooldowns.get(k) ?? 0) <= Date.now()).length;
    console.warn(`[KeyPool] Key rate-limited for ${retryAfterMs / 1000}s. ${remaining}/${this.keys.length} keys still available`);
  }

  /** True if at least one key is available right now. */
  hasAvailable(): boolean {
    return this.getKey() !== null;
  }

  get size(): number {
    return this.keys.length;
  }
}

// ── Shared pools (singleton per process) ──────────────────────────────────────
// Add GROQ_API_KEY_2, GROQ_API_KEY_3 etc. in your .env to activate rotation
export const groqPool = new KeyPool(
  'GROQ_API_KEY',
  'GROQ_API_KEY_2',
  'GROQ_API_KEY_3',
  'GROQ_API_KEY_4',
  'GROQ_API_KEY_5',
);

export const openRouterPool = new KeyPool(
  'OPENROUTER_API_KEY',
  'OPENROUTER_API_KEY_2',
  'OPENROUTER_API_KEY_3',
);
