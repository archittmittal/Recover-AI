import { describe, it, expect } from 'vitest';
import {
  ConcurrencyGate,
  callWithLlmLimit,
  isRateLimitError,
  mapWithConcurrency,
} from '@/lib/utils/concurrency';

/**
 * The batch runs journeys concurrently to stop a 150-journey run taking 266 seconds, and gates
 * Gemini narrowly because 13 of 15 concurrent calls to it came back 429. Both halves need to hold:
 * the width has to actually be bounded (or the gate is decorative), and the results have to stay
 * in input order (or outcomes get paired to the wrong journeys).
 */
describe('mapWithConcurrency', () => {
  it('returns results in input order, not completion order', async () => {
    const items = [40, 5, 30, 1, 20];

    const results = await mapWithConcurrency(items, 4, async (ms, index) => {
      await new Promise((resolve) => setTimeout(resolve, ms));
      return `${index}:${ms}`;
    });

    // The 1ms item finishes first and the 40ms item last; order must still follow `items`.
    expect(results).toEqual(['0:40', '1:5', '2:30', '3:1', '4:20']);
  });

  it('never exceeds the requested width', async () => {
    let inFlight = 0;
    let peak = 0;

    await mapWithConcurrency(Array.from({ length: 40 }, (_, i) => i), 5, async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
    });

    expect(peak).toBeLessThanOrEqual(5);
    // Guard against the opposite failure: a "limiter" that quietly serialises everything would
    // pass the bound above while giving back none of the speed it exists for.
    expect(peak).toBeGreaterThan(1);
  });

  it('processes every item exactly once', async () => {
    const seen: number[] = [];
    await mapWithConcurrency(Array.from({ length: 25 }, (_, i) => i), 6, async (n) => {
      seen.push(n);
    });

    expect(seen).toHaveLength(25);
    expect(new Set(seen).size).toBe(25);
  });

  it('handles an empty batch without opening a worker', async () => {
    expect(await mapWithConcurrency([], 8, async () => 'x')).toEqual([]);
  });

  it('propagates a worker failure rather than swallowing it', async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error('journey blew up');
        return n;
      })
    ).rejects.toThrow('journey blew up');
  });
});

describe('ConcurrencyGate', () => {
  it('holds calls above the limit until a slot frees', async () => {
    const gate = new ConcurrencyGate(() => 2);
    let inFlight = 0;
    let peak = 0;

    await Promise.all(
      Array.from({ length: 12 }, () =>
        gate.run(async () => {
          inFlight += 1;
          peak = Math.max(peak, inFlight);
          await new Promise((resolve) => setTimeout(resolve, 4));
          inFlight -= 1;
        })
      )
    );

    expect(peak).toBe(2);
  });

  it('frees its slot when the task throws, instead of leaking it', async () => {
    const gate = new ConcurrencyGate(() => 1);

    await expect(gate.run(async () => { throw new Error('boom'); })).rejects.toThrow('boom');

    // If the failed task had kept its slot, this would hang forever rather than resolve.
    await expect(gate.run(async () => 'recovered')).resolves.toBe('recovered');
  });
});

describe('isRateLimitError', () => {
  it('recognises the shapes Gemini actually returns', () => {
    expect(isRateLimitError(new Error('[429 Too Many Requests] quota exceeded'))).toBe(true);
    expect(isRateLimitError(new Error('RESOURCE_EXHAUSTED'))).toBe(true);
    expect(isRateLimitError(new Error('You exceeded your current quota'))).toBe(true);
  });

  it('does not treat ordinary failures as rate limits', () => {
    expect(isRateLimitError(new Error('API key not valid'))).toBe(false);
    expect(isRateLimitError(new Error('Unexpected token < in JSON'))).toBe(false);
    expect(isRateLimitError(undefined)).toBe(false);
  });
});

describe('callWithLlmLimit', () => {
  it('retries a rate-limited call and returns the eventual success', async () => {
    let attempts = 0;

    const result = await callWithLlmLimit(
      async () => {
        attempts += 1;
        if (attempts < 3) throw new Error('429 RESOURCE_EXHAUSTED');
        return 'generated';
      },
      { retries: 3, baseDelayMs: 1 }
    );

    expect(result).toBe('generated');
    expect(attempts).toBe(3);
  });

  it('does not retry errors that retrying cannot fix', async () => {
    let attempts = 0;

    await expect(
      callWithLlmLimit(
        async () => {
          attempts += 1;
          throw new Error('API key not valid');
        },
        { retries: 3, baseDelayMs: 1 }
      )
    ).rejects.toThrow('API key not valid');

    // One attempt, not four: a revoked key fails the same way every time, and three extra
    // round trips only delay the template fallback that was always going to ship.
    expect(attempts).toBe(1);
  });

  it('gives up after the retry budget and surfaces the rate-limit error', async () => {
    let attempts = 0;

    await expect(
      callWithLlmLimit(
        async () => {
          attempts += 1;
          throw new Error('429 RESOURCE_EXHAUSTED');
        },
        { retries: 2, baseDelayMs: 1 }
      )
    ).rejects.toThrow('RESOURCE_EXHAUSTED');

    expect(attempts).toBe(3);
  });
});
