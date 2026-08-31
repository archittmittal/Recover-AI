import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * RA-24 — the link validator used a greedy `\S+` match, so a payment link ending a sentence
 * captured its trailing punctuation ("…/KiutSqX." !== "…/KiutSqX"). Every such message was
 * discarded and replaced by the deterministic template.
 *
 * That went unnoticed because the LLM path had never actually run — the configured model was
 * retired, so every message took the fallback for an unrelated reason. Once live, this was
 * the next thing standing between the agent and a personalised message.
 *
 * The RA-03 guarantee must survive the fix: exactly one URL, equal to the real link.
 */
const { mockGenerateContent } = vi.hoisted(() => ({ mockGenerateContent: vi.fn() }));

vi.mock('@/lib/ai/gemini', () => ({
  gemini: {
    isAvailable: () => true,
    getModel: () => ({ generateContent: mockGenerateContent }),
  },
}));

import { generateRecoveryMessage } from '@/lib/ai/messenger';

const REAL_LINK = 'https://rzp.io/rzp/KiutSqX';
const PHISHING_LINK = 'https://rzp-secure-verify.example/pay';

const reply = (text: string) =>
  mockGenerateContent.mockResolvedValueOnce({ response: { text: () => text } });

const params = {
  customerName: 'Priya',
  language: 'en',
  amount: 249900,
  failureReason: 'Card declined',
  paymentLinkUrl: REAL_LINK,
  channel: 'whatsapp',
} as never;

describe('link validation tolerates sentence punctuation', () => {
  beforeEach(() => vi.clearAllMocks());

  for (const [label, suffix] of [
    ['full stop', '.'],
    ['comma', ','],
    ['exclamation', '!'],
    ['closing paren', ')'],
    ['none', ''],
  ] as const) {
    it(`accepts a valid message when the link is followed by a ${label}`, async () => {
      reply(
        JSON.stringify({
          message: `Hi Priya, your payment of ₹2,499 failed. Complete it here: ${REAL_LINK}${suffix}`,
          reasoning: 'ok',
        })
      );
      const r = await generateRecoveryMessage(params);
      expect(r.isTemplateFallback).toBe(false);
      expect(r.message).toContain(REAL_LINK);
    });
  }

  it('still rejects a substituted URL (RA-03 preserved)', async () => {
    reply(
      JSON.stringify({
        message: `Hi Priya, your payment of ₹2,499 failed. Complete it here: ${PHISHING_LINK}.`,
        reasoning: 'injected',
      })
    );
    const r = await generateRecoveryMessage(params);
    expect(r.isTemplateFallback).toBe(true);
    expect(r.message).not.toContain(PHISHING_LINK);
  });

  it('still rejects a message carrying a second URL alongside the real one', async () => {
    reply(
      JSON.stringify({
        message: `Hi Priya, ₹2,499 failed. Pay: ${REAL_LINK}. Verify: ${PHISHING_LINK}.`,
        reasoning: 'injected',
      })
    );
    const r = await generateRecoveryMessage(params);
    expect(r.isTemplateFallback).toBe(true);
    expect(r.message).not.toContain(PHISHING_LINK);
  });
});
