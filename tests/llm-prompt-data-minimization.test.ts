import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * RA-17: SECURITY.md and ETHICAL_AI_FRAMEWORK.md both claim LLM prompts
 * receive only the customer's first name, not the full name. Before this
 * fix, generateRecoveryMessage/processCustomerConversation sanitized the
 * name (RA-03) but still sent it in full. These tests inspect the actual
 * prompt text sent to the mocked Gemini call to verify only the first name
 * appears.
 */
const { mockGenerateContent } = vi.hoisted(() => ({ mockGenerateContent: vi.fn() }));

vi.mock('@/lib/ai/gemini', () => ({
  gemini: {
    isAvailable: () => true,
    getModel: () => ({ generateContent: mockGenerateContent }),
  },
}));

import { generateRecoveryMessage } from '@/lib/ai/messenger';
import { processCustomerConversation } from '@/lib/ai/conversation';

const REAL_LINK = 'https://rzp.io/i/recov_rj_genuine123';

function mockGeminiResponse(text: string) {
  mockGenerateContent.mockResolvedValueOnce({ response: { text: () => text } });
}

function promptTextSentToGemini(): string {
  const call = mockGenerateContent.mock.calls[0][0];
  return call.contents[0].parts[0].text as string;
}

describe('LLM prompt data minimization — only first name is sent (RA-17)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('generateRecoveryMessage sends only the first name to Gemini', async () => {
    mockGeminiResponse(
      JSON.stringify({ message: `Hi Aarav, your ₹499 payment: ${REAL_LINK} Reply STOP to unsubscribe.` })
    );

    await generateRecoveryMessage({
      customerName: 'Aarav Sharma Kapoor',
      language: 'en',
      channel: 'whatsapp',
      amount: 49900,
      failureReason: 'transaction decline',
      paymentLinkUrl: REAL_LINK,
    });

    const prompt = promptTextSentToGemini();
    expect(prompt).toContain('Aarav');
    expect(prompt).not.toContain('Sharma');
    expect(prompt).not.toContain('Kapoor');
  });

  it('processCustomerConversation sends only the first name to Gemini', async () => {
    mockGeminiResponse(
      JSON.stringify({
        response_message: 'Thanks for reaching out.',
        intent: 'general_query',
        action_required: 'none',
      })
    );

    await processCustomerConversation({
      customerName: 'Priya Desai Nair',
      customerMessage: 'when will this be resolved',
      amount: 49900,
      paymentLinkUrl: REAL_LINK,
    });

    const prompt = promptTextSentToGemini();
    expect(prompt).toContain('Priya');
    expect(prompt).not.toContain('Desai');
    expect(prompt).not.toContain('Nair');
  });
});
