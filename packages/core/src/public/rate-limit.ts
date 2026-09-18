/**
 * Dependency-free, in-memory rate limiter (fixed-window token bucket).
 *
 * The public API is unauthenticated, so it needs a cheap abuse guard that works
 * on plain shared hosting with **no Redis and no broker** (cost/hosting policy).
 * This is a per-process counter keyed by an arbitrary string (typically
 * `publicKey:ip:route`). It is intentionally simple and best-effort: it resets
 * on restart and is not shared across instances — it exists to blunt accidental
 * loops and trivial hammering, not to be a distributed quota. A future
 * deployment can swap in a shared store behind the same `check()` shape.
 *
 * Pure and deterministic given an injected clock, so it is unit-testable.
 */

export interface RateLimitResult {
  allowed: boolean;
  /** Requests still available in the current window. */
  remaining: number;
  /** Epoch ms when the current window resets. */
  resetAt: number;
  /** Configured window ceiling. */
  limit: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

export interface RateLimiterOptions {
  /** Max requests per window. */
  limit: number;
  /** Window length in ms. */
  windowMs: number;
  /** Injectable clock (defaults to Date.now) — for tests. */
  now?: () => number;
  /** Cap on tracked keys to bound memory; oldest-reset keys are evicted. */
  maxKeys?: number;
}

export class RateLimiter {
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly now: () => number;
  private readonly maxKeys: number;
  private readonly buckets = new Map<string, Bucket>();

  constructor(options: RateLimiterOptions) {
    this.limit = Math.max(1, Math.floor(options.limit));
    this.windowMs = Math.max(1, Math.floor(options.windowMs));
    this.now = options.now ?? Date.now;
    this.maxKeys = Math.max(1, Math.floor(options.maxKeys ?? 10_000));
  }

  /** Record one hit for `key` and report whether it is within the window limit. */
  check(key: string): RateLimitResult {
    const t = this.now();
    let bucket = this.buckets.get(key);

    if (!bucket || t >= bucket.resetAt) {
      bucket = { count: 0, resetAt: t + this.windowMs };
      this.buckets.set(key, bucket);
      this.evictIfNeeded(t);
    }

    bucket.count += 1;
    const allowed = bucket.count <= this.limit;
    return {
      allowed,
      remaining: Math.max(0, this.limit - bucket.count),
      resetAt: bucket.resetAt,
      limit: this.limit,
    };
  }

  /** Drop a key (e.g. on a successful auth path) — mainly for tests. */
  reset(key: string): void {
    this.buckets.delete(key);
  }

  private evictIfNeeded(t: number): void {
    if (this.buckets.size <= this.maxKeys) return;
    // Bounded cleanup: purge everything already expired; if still over, drop the
    // soonest-to-reset entries. Cheap and keeps memory flat under key churn.
    for (const [k, b] of this.buckets) {
      if (t >= b.resetAt) this.buckets.delete(k);
    }
    if (this.buckets.size <= this.maxKeys) return;
    const sorted = [...this.buckets.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt);
    const excess = this.buckets.size - this.maxKeys;
    for (let i = 0; i < excess; i += 1) {
      const entry = sorted[i];
      if (entry) this.buckets.delete(entry[0]);
    }
  }
}
