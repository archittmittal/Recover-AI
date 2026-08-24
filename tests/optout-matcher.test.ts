import { describe, it, expect } from 'vitest';
import { detectOptOut, evaluateStoppingRules } from '../src/lib/recovery/stopping-rules';

describe('detectOptOut — shared opt-out matcher (RA-08 / RA-11)', () => {
  describe('true positives (should detect opt-out)', () => {
    const shouldMatch = [
      'STOP',
      'stop',
      'Stop please',
      'Please stop sending',
      'UNSUBSCRIBE',
      'unsubscribe',
      'Please unsubscribe me',
      'band karo',
      'ab band karo msg bhejna',
      'mat bhejo',
      'mat bhejo message',
      'mat karo',
      'do not contact me again',
      "don't contact me",
      'remove me from your list',
      'opt out',
      'optout please',
      'please do not text me',
      'do not message me anymore',
      'stop texting me',
      'no more messages please',
      'बंद करो',
      'रोको',
      'मत भेजो',
    ];

    it.each(shouldMatch)('detects opt-out in "%s"', (msg) => {
      expect(detectOptOut(msg)).toBe(true);
    });
  });

  describe('true negatives (should NOT falsely trigger opt-out)', () => {
    const shouldNotMatch = [
      'the bank stopped my transaction',
      'my card stopped working',
      'can you help me complete the payment',
      'I will pay tomorrow',
      'what is the amount due',
      '',
      null,
      undefined,
    ];

    it.each(shouldNotMatch)('does not flag "%s" as opt-out', (msg) => {
      expect(detectOptOut(msg as string | null | undefined)).toBe(false);
    });
  });
});

describe('evaluateStoppingRules — opt-out rule uses shared matcher', () => {
  it('fires opt_out on a previously-missed false negative ("do not contact me again")', () => {
    const res = evaluateStoppingRules({
      journeyStatus: 'recovering',
      currentAttempt: 1,
      maxAttempts: 3,
      customerDndStatus: 'active',
      customerMessage: 'do not contact me again',
    });

    expect(res.shouldStop).toBe(true);
    expect(res.ruleFired).toBe('opt_out');
    expect(res.nextStatus).toBe('opted_out');
  });

  it('does NOT fire opt_out on a previously-known false positive ("the bank stopped my transaction")', () => {
    const res = evaluateStoppingRules({
      journeyStatus: 'recovering',
      currentAttempt: 1,
      maxAttempts: 3,
      customerDndStatus: 'active',
      customerMessage: 'the bank stopped my transaction, please help',
    });

    expect(res.shouldStop).toBe(false);
    expect(res.ruleFired).toBeNull();
  });

  it('fires opt_out on Devanagari phrase "बंद करो"', () => {
    const res = evaluateStoppingRules({
      journeyStatus: 'recovering',
      currentAttempt: 1,
      maxAttempts: 3,
      customerDndStatus: 'active',
      customerMessage: 'कृपया बंद करो',
    });

    expect(res.shouldStop).toBe(true);
    expect(res.ruleFired).toBe('opt_out');
  });
});
