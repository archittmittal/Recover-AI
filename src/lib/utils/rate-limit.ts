/**
 * In-memory per-key token bucket. Sufficient at this app's scale; a single
 * server process is assumed. If the app is ever horizontally scaled, this
 * would need to move to a shared store (e.g. Redis) — see RA-20.
 */
interface Bucket {
  tokens: number;
  lastRefillMs: number;
}

const buckets = new Map<string, Bucket>();

// Documented ceiling: a burst of up to CAPACITY requests, sustained at
// REFILL_PER_SECOND thereafter. Generous enough for legitimate Razorpay
// webhook volume (which is not high-frequency per merchant) and normal
// dashboard/API usage, while bounding the cost-amplification path a single
// client could otherwise drive through the recovery coordinator.
export const RATE_LIMIT_CAPACITY = 30;
export const RATE_LIMIT_REFILL_PER_SECOND = 1; // 60 requests/minute sustained

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export function checkRateLimit(
  key: string,
  now: number = Date.now(),
  capacity: number = RATE_LIMIT_CAPACITY,
  refillPerSecond: number = RATE_LIMIT_REFILL_PER_SECOND
): RateLimitResult {
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { tokens: capacity, lastRefillMs: now };
    buckets.set(key, bucket);
  }

  const elapsedSeconds = Math.max(0, (now - bucket.lastRefillMs) / 1000);
  bucket.tokens = Math.min(capacity, bucket.tokens + elapsedSeconds * refillPerSecond);
  bucket.lastRefillMs = now;

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return { allowed: true, retryAfterSeconds: 0 };
  }

  const deficit = 1 - bucket.tokens;
  const retryAfterSeconds = Math.max(1, Math.ceil(deficit / refillPerSecond));
  return { allowed: false, retryAfterSeconds };
}

/** Test-only: clears all bucket state so suites don't leak across keys. */
export function resetRateLimitState(): void {
  buckets.clear();
}
