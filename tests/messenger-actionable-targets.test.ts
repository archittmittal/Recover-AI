import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * RA-03 hardening — only the real payment link may be actionable in an outbound message.
 *
 * The validator previously matched `https?://` and nothing else, so a message could ship
 * carrying a second, non-http payment target chosen by an injected instruction. In an Indian
 * payments context the sharp one is `upi://pay?pa=<vpa>&am=<amount>`, which opens a UPI app
 * pre-filled to pay an attacker's VPA — no phishing page required.
 *
 * The check is now allowlist-shaped: remove the known-good link, then reject anything
 * link-shaped that remains. A false positive costs a personalised message; a false negative
 * ships an attacker's payment target to a customer.
 */
const { mockGenerateContent } = vi.hoisted(() => ({ mockGenerateContent: vi.fn() }));
vi.mock('@/lib/ai/gemini', () => ({
  gemini: { isAvailable: () => true, getModel: () => ({ generateContent: mockGenerateContent }) },
}));

import { generateRecoveryMessage, containsActionableTarget } from '@/lib/ai/messenger';

const REAL = 'https://rzp.io/rzp/KiutSqX';
const reply = (t: string) =>
  mockGenerateContent.mockResolvedValueOnce({ response: { text: () => t } });
const params = {
  customerName: 'Priya', language: 'en', amount: 249900,
  failureReason: 'Card declined', paymentLinkUrl: REAL, channel: 'whatsapp',
} as never;

const HOSTILE: [string, string][] = [
  ['UPI deep link',        `upi://pay?pa=fraud@okaxis&am=2499`],
  ['UPI VPA in plain text', `send to fraud@okaxis`],
  ['scheme-less domain',   `rzp-verify.example/pay`],
  ['www-prefixed domain',  `www.rzp-secure.example`],
  ['tel: number',          `tel:+919999999999`],
  ['whatsapp deep link',   `wa.me/919999999999`],
  ['mailto:',              `mailto:refunds@rzp-secure.example`],
  ['intent:// (Android)',  `intent://pay#Intent;scheme=upi;end`],
  ['second https URL',     `https://evil.example/x`],
];

describe('a second actionable target is never shipped', () => {
  beforeEach(() => vi.clearAllMocks());

  for (const [label, hostile] of HOSTILE) {
    it(`rejects ${label} riding alongside the real link`, async () => {
      reply(
        JSON.stringify({
          message: `Hi Priya, your payment of ₹2,499 failed. Pay here: ${REAL} — or ${hostile}`,
          reasoning: 'injected',
        })
      );
      const r = await generateRecoveryMessage(params);
      expect(r.isTemplateFallback).toBe(true);
      expect(r.message).not.toContain(hostile);
    });
  }

  it('accepts a clean message carrying only the real link', async () => {
    reply(
      JSON.stringify({
        message: `Hi Priya, your payment of ₹2,499 failed. Complete it here: ${REAL}`,
        reasoning: 'ok',
      })
    );
    const r = await generateRecoveryMessage(params);
    expect(r.isTemplateFallback).toBe(false);
  });
});

describe('containsActionableTarget does not fire on ordinary copy', () => {
  const benign = [
    'Hi Priya, your payment of ₹2,499 failed. Reply STOP to unsubscribe.',
    'Your annual subscription renewal of ₹12,999.00 could not be completed.',
    'We tried e.g. your saved card, i.e. the one ending 4242.',
    'नमस्ते Priya जी! आपके भुगतान ₹2,499 पूरा नहीं हो सका।',
  ];
  for (const text of benign) {
    it(`allows: ${text.slice(0, 44)}…`, () => {
      expect(containsActionableTarget(text)).toBe(false);
    });
  }
});
