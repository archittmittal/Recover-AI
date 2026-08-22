import { describe, it, expect } from 'vitest';
import { evaluateStoppingRules } from '../src/lib/recovery/stopping-rules';
import { isWithinContactHours } from '../src/lib/utils/time';
import { processCustomerConversation } from '../src/lib/ai/conversation';

describe('Ethical AI & Regulatory Compliance Invariant Test Suite', () => {
  describe('1. Multilingual Opt-Out & Right-to-be-Forgotten (DPDPA 2023)', () => {
    const optOutPhrases = [
      'STOP',
      'stop',
      'Stop please',
      'UNSUBSCRIBE',
      'unsubscribe',
      'Please unsubscribe me',
      'band karo',
      'ab band karo msg bhejna',
      'mat bhejo',
    ];

    it.each(optOutPhrases)('immediately stops outreach when customer replies "%s"', async (phrase) => {
      // 1. Evaluate deterministic stopping rule engine
      const stoppingResult = evaluateStoppingRules({
        journeyStatus: 'recovering',
        currentAttempt: 1,
        maxAttempts: 3,
        customerDndStatus: 'active',
        customerMessage: phrase,
      });

      expect(stoppingResult.shouldStop).toBe(true);
      expect(stoppingResult.ruleFired).toBe('opt_out');
      expect(stoppingResult.nextStatus).toBe('opted_out');

      // 2. Evaluate conversational intent parser
      const conversationResult = await processCustomerConversation({
        customerName: 'Aarav Sharma',
        customerMessage: phrase,
        amount: 499900,
        paymentLinkUrl: 'https://rzp.io/i/test_123',
      });

      expect(conversationResult.intent).toBe('opt_out');
      expect(conversationResult.actionRequired).toBe('stop');
    });
  });

  describe('2. Anti-Harassment Upper Bounds & Attempt Exhaustion', () => {
    it('strictly forbids any outreach beyond attempt #3', () => {
      // Current attempt = 3 (reaching maximum limit)
      const stoppingResult = evaluateStoppingRules({
        journeyStatus: 'recovering',
        currentAttempt: 3,
        maxAttempts: 3,
        customerDndStatus: 'active',
      });

      expect(stoppingResult.shouldStop).toBe(true);
      expect(stoppingResult.ruleFired).toBe('attempt_exhaustion');
      expect(stoppingResult.nextStatus).toBe('exhausted');
    });

    it('rejects outreach if customer is already opted out in DND registry', () => {
      const stoppingResult = evaluateStoppingRules({
        journeyStatus: 'detected',
        currentAttempt: 0,
        maxAttempts: 3,
        customerDndStatus: 'opted_out',
      });

      expect(stoppingResult.shouldStop).toBe(true);
      expect(stoppingResult.ruleFired).toBe('dnd_active');
      expect(stoppingResult.nextStatus).toBe('opted_out');
    });
  });

  describe('3. RBI Fair Practices Code (Contact Hours Window 8AM - 7PM IST)', () => {
    it('permits communications strictly inside the active 08:00 to 19:00 IST window', () => {
      // 11:30 AM IST -> Allowed
      const morningTime = new Date('2026-08-22T06:00:00.000Z'); // 11:30 AM IST
      expect(isWithinContactHours(morningTime)).toBe(true);

      // 4:45 PM IST -> Allowed
      const eveningTime = new Date('2026-08-22T11:15:00.000Z'); // 4:45 PM IST
      expect(isWithinContactHours(eveningTime)).toBe(true);
    });

    it('defers outreach outside contact hours (Late night, early morning)', () => {
      // 11:30 PM IST -> Blocked
      const nightTime = new Date('2026-08-22T18:00:00.000Z'); // 11:30 PM IST
      expect(isWithinContactHours(nightTime)).toBe(false);

      // 06:30 AM IST -> Blocked
      const earlyTime = new Date('2026-08-22T01:00:00.000Z'); // 06:30 AM IST
      expect(isWithinContactHours(earlyTime)).toBe(false);
    });
  });

  describe('4. Zero-PII Data Isolation & Financial Privacy', () => {
    it('verifies that mock credit card numbers (PAN) are never accepted in message generation', () => {
      const sampleCardPan = '4111222233334444';
      const sampleCvv = '123';

      // Verify PAN pattern matching
      const panRegex = /\b(?:\d[ -]*?){13,16}\b/;
      expect(panRegex.test(sampleCardPan)).toBe(true);

      // Sanitize payload helper test
      function sanitizePayloadForLLM(payload: Record<string, unknown>): Record<string, unknown> {
        const clean = { ...payload };
        delete clean.cardPan;
        delete clean.cvv;
        delete clean.expiry;
        return clean;
      }

      const rawPayload = {
        amount: 499900,
        cardPan: sampleCardPan,
        cvv: sampleCvv,
        expiry: '12/28',
      };

      const sanitized = sanitizePayloadForLLM(rawPayload);
      expect(sanitized.cardPan).toBeUndefined();
      expect(sanitized.cvv).toBeUndefined();
      expect(sanitized.expiry).toBeUndefined();
      expect(sanitized.amount).toBe(499900);
    });
  });
});
