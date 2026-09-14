/**
 * Bounded concurrency, and a shared gate for rate-limited APIs.
 *
 * `POST /api/recovery/trigger` processed the batch in a plain sequential `for` loop. Each journey
 * costs roughly seven round trips (journey, latest action, customer, the dispatch write, the
 * journey update, two audit rows), and against a hosted libSQL database every one of those pays
 * network latency. Measured on the deployed demo: **266 seconds for 150 journeys with no LLM
 * calls at all**, because the run happened outside contact hours and every attempt deferred
 * before reaching Gemini.
 *
 * The journeys are independent of one another, so that wait was almost entirely idle time.
 */

/** Default width for database-bound work. Override with RECOVERY_CONCURRENCY. */
export const DEFAULT_DB_CONCURRENCY = 8;

/**
 * Default width for Gemini calls, deliberately much narrower than the database limit.
 *
 * Measured against the project's own API key: of 15 requests issued at once, **13 came back
 * `429 RESOURCE_EXHAUSTED`**. A batch that fans out as wide as the database allows would spend
 * most of its LLM calls on rejected requests, and every rejection silently becomes a template
 * message — which is how a "live" deployment ends up serving mostly fallback copy while
 * reporting that the model is enabled.
 *
 * Override with GEMINI_CONCURRENCY once the key is on a paid tier with a higher rate limit.
 */
export const DEFAULT_LLM_CONCURRENCY = 2;

function readPositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number((raw || '').trim());
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return parsed;
}

export function getRecoveryConcurrency(): number {
  return readPositiveInt(process.env.RECOVERY_CONCURRENCY, DEFAULT_DB_CONCURRENCY);
}

export function getLlmConcurrency(): number {
  return readPositiveInt(process.env.GEMINI_CONCURRENCY, DEFAULT_LLM_CONCURRENCY);
}

/**
 * Runs `worker` over `items` with at most `limit` in flight.
 *
 * Results are returned in the order of `items`, never in completion order, so a caller can pair
 * them back up with their inputs. A worker that throws rejects the whole call, matching the
 * sequential loop this replaced — the route's own try/catch still owns the response.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];

  const width = Math.max(1, Math.min(limit, items.length));
  const results = new Array<R>(items.length);
  let cursor = 0;

  const runners = Array.from({ length: width }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  });

  await Promise.all(runners);
  return results;
}

/**
 * A process-wide gate limiting how many calls may be in flight at once.
 *
 * Separate from `mapWithConcurrency` because the constraint is different in kind: the batch
 * decides how many *journeys* run together, while this decides how many *requests to one
 * provider* run together — and a journey can reach the provider from several call sites
 * (classification, message generation, conversational replies). One shared gate around the
 * provider holds no matter which path gets there.
 */
export class ConcurrencyGate {
  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(private readonly limit: () => number) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await task();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.limit()) {
      this.active += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.queue.push(() => {
        this.active += 1;
        resolve();
      });
    });
  }

  private release(): void {
    this.active -= 1;
    const next = this.queue.shift();
    if (next) next();
  }
}

/** The shared gate for Gemini. Every call site goes through this one instance. */
export const llmGate = new ConcurrencyGate(getLlmConcurrency);

/** True when an error looks like a provider rate-limit rejection rather than a real fault. */
export function isRateLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return (
    message.includes('429') ||
    message.includes('RESOURCE_EXHAUSTED') ||
    message.toLowerCase().includes('rate limit') ||
    message.toLowerCase().includes('quota')
  );
}

/**
 * Runs an LLM call behind the shared gate, retrying only on rate-limit rejections.
 *
 * Retries are deliberately narrow. A 429 means "ask again later" and is worth another attempt;
 * a malformed prompt or a revoked key is not, and retrying those would turn one fast failure
 * into three slow ones before the same template fallback ships anyway.
 *
 * Backoff is exponential with jitter, because a batch that retries in lockstep re-creates the
 * burst that caused the rejection.
 */
export async function callWithLlmLimit<T>(
  task: () => Promise<T>,
  { retries = 2, baseDelayMs = 900 }: { retries?: number; baseDelayMs?: number } = {}
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await llmGate.run(task);
    } catch (error) {
      lastError = error;
      if (!isRateLimitError(error) || attempt === retries) break;

      const backoff = baseDelayMs * 2 ** attempt;
      const jitter = Math.random() * baseDelayMs;
      await new Promise((resolve) => setTimeout(resolve, backoff + jitter));
    }
  }

  throw lastError;
}
