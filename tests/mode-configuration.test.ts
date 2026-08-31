import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getMode, isLive, readCredential, requireCredential, getGeminiModel, describeIntegrations } from '../src/lib/config';

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
