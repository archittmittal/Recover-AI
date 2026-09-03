import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getMode, isLive, readCredential, requireCredential, getGeminiModel, describeIntegrations, shouldSimulateOutcomes } from '../src/lib/config';

/**
 * RA-24 — mock vs live is declared, not inferred from the shape of a credential, and live
 * mode refuses to start on a placeholder rather than silently degrading to simulation.
 */

const saved = { ...process.env };
beforeEach(() => {
  delete process.env.RECOVERAI_MODE;
  delete process.env.GEMINI_MODEL;
  process.env.GEMINI_API_KEY = 'XXXXXXXXXXXXXXXXXXXXXXXX';
});
afterEach(() => {
  process.env = { ...saved };
});

describe('mode', () => {
  it('defaults to mock when unset, so a fresh clone still boots', () => {
    expect(getMode()).toBe('mock');
    expect(isLive()).toBe(false);
  });

  it('rejects an unrecognised mode instead of quietly falling back', () => {
    process.env.RECOVERAI_MODE = 'production';
    expect(() => getMode()).toThrow(/Invalid RECOVERAI_MODE/);
  });

  it('live mode throws on a placeholder credential', () => {
    process.env.RECOVERAI_MODE = 'live';
    expect(() => requireCredential('GEMINI_API_KEY')).toThrow(/missing or still a placeholder/);
  });

  it('live mode returns a real credential', () => {
    process.env.RECOVERAI_MODE = 'live';
    process.env.GEMINI_API_KEY = 'AQ.realkeyvalue';
    expect(requireCredential('GEMINI_API_KEY')).toBe('AQ.realkeyvalue');
  });

  it('mock mode treats a placeholder as absent without throwing', () => {
    expect(requireCredential('GEMINI_API_KEY')).toBeUndefined();
  });

  it('readCredential never throws, so the webhook route can answer 503', () => {
    process.env.RECOVERAI_MODE = 'live';
    expect(readCredential('RAZORPAY_WEBHOOK_SECRET')).toBeUndefined();
  });
});

describe('gemini model', () => {
  it('is pinned, not a floating -latest alias that could move under a demo', () => {
    expect(getGeminiModel()).toBe('gemini-3.6-flash');
    expect(getGeminiModel()).not.toMatch(/latest/);
  });

  it('is overridable without a code change when a model is retired', () => {
    process.env.GEMINI_MODEL = 'gemini-3.5-flash';
    expect(getGeminiModel()).toBe('gemini-3.5-flash');
  });
});

describe('preflight', () => {
  it('names the active mode and which integrations are configured', () => {
    const line = describeIntegrations();
    expect(line).toContain('mode=mock');
    expect(line).toContain('gemini=unset');
    expect(line).toContain('model=gemini-3.6-flash');
  });
});

describe('credentials are never read at module scope', () => {
  /**
   * `next build` evaluates every route module to collect page data. Reading a credential in a
   * client constructor therefore made the *build* depend on runtime secrets: with
   * RECOVERAI_MODE=live and no key in the build environment, the deployment failed with
   * "Failed to collect configuration for /api/recovery/sweep" — nowhere near the real cause.
   *
   * Importing the modules must stay harmless. The loud failure belongs at first use.
   */
  it('importing the clients in live mode with no credentials does not throw', async () => {
    vi.stubEnv('RECOVERAI_MODE', 'live');
    vi.stubEnv('GEMINI_API_KEY', 'XXXXXXXXXXXXXXXXXXXX');
    vi.stubEnv('RAZORPAY_KEY_ID', 'XXXXXXXXXXXXXXXXXXXX');
    vi.stubEnv('RAZORPAY_KEY_SECRET', 'XXXXXXXXXXXXXXXXXXXX');
    vi.resetModules();

    await expect(import('../src/lib/ai/gemini')).resolves.toBeDefined();
    await expect(import('../src/lib/razorpay/client')).resolves.toBeDefined();
  });

  it('still fails loudly at first use', async () => {
    vi.stubEnv('RECOVERAI_MODE', 'live');
    vi.stubEnv('GEMINI_API_KEY', 'XXXXXXXXXXXXXXXXXXXX');
    vi.resetModules();

    const { gemini } = await import('../src/lib/ai/gemini');
    expect(() => gemini.isAvailable()).toThrow(/GEMINI_API_KEY is missing or still a placeholder/);
  });
});

describe('SIMULATE_OUTCOMES', () => {
  /**
   * Mock and live were mutually exclusive in a way that served no demo well: mock gave a
   * populated recovery rate with no AI anywhere, live gave real Gemini copy and real payment
   * links with nothing ever resolving. This flag is the seam between them, and it must stay
   * explicit — a live deployment carrying real merchant traffic cannot have simulated recoveries
   * appear in its numbers by accident.
   */
  it('always simulates in mock mode, where nothing else could decide an outcome', () => {
    vi.stubEnv('RECOVERAI_MODE', 'mock');
    vi.stubEnv('SIMULATE_OUTCOMES', '');
    expect(shouldSimulateOutcomes()).toBe(true);
  });

  it('does not simulate in live mode by default', () => {
    vi.stubEnv('RECOVERAI_MODE', 'live');
    vi.stubEnv('SIMULATE_OUTCOMES', '');
    expect(shouldSimulateOutcomes()).toBe(false);
  });

  it('simulates in live mode only when explicitly asked', () => {
    vi.stubEnv('RECOVERAI_MODE', 'live');
    vi.stubEnv('SIMULATE_OUTCOMES', 'true');
    expect(shouldSimulateOutcomes()).toBe(true);
  });

  it('treats anything other than "true" as off', () => {
    vi.stubEnv('RECOVERAI_MODE', 'live');
    for (const value of ['false', '1', 'yes', 'TRUE ', 'maybe']) {
      vi.stubEnv('SIMULATE_OUTCOMES', value);
      expect(shouldSimulateOutcomes(), value).toBe(value.trim().toLowerCase() === 'true');
    }
  });
});
