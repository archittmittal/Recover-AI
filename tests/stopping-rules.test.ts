import { describe, it, expect } from 'vitest';
import { evaluateStoppingRules } from '../src/lib/recovery/stopping-rules';
import { setClock, FixedClock } from '../src/lib/utils/time';

describe('RecoverAI Stopping Rules Enforcement', () => {
  it('Rule 1: Halts immediately on Payment Success', () => {
    const res = evaluateStoppingRules({
      journeyStatus: 'resolved',
      currentAttempt: 1,
      maxAttempts: 3,
      customerDndStatus: 'active',
      isPaymentSuccessful: true,
    });

    expect(res.shouldStop).toBe(true);
    expect(res.ruleFired).toBe('payment_success');
    expect(res.nextStatus).toBe('resolved');
  });

  it('Rule 2: Halts immediately and sets opted_out when customer replies "STOP"', () => {
    const variations = ['STOP', 'stop', 'Please stop sending', 'unsubscribe', 'band karo', 'mat bhejo message'];

    for (const msg of variations) {
      const res = evaluateStoppingRules({
        journeyStatus: 'recovering',
        currentAttempt: 1,
        maxAttempts: 3,
        customerDndStatus: 'active',
        customerMessage: msg,
      });

      expect(res.shouldStop).toBe(true);
      expect(res.ruleFired).toBe('opt_out');
      expect(res.nextStatus).toBe('opted_out');
    }
  });

  it('Rule 3: Halts immediately if customer has DND status active', () => {
    const res = evaluateStoppingRules({
      journeyStatus: 'recovering',
      currentAttempt: 1,
      maxAttempts: 3,
      customerDndStatus: 'opted_out',
    });

    expect(res.shouldStop).toBe(true);
    expect(res.ruleFired).toBe('dnd_active');
    expect(res.nextStatus).toBe('opted_out');
  });

  it('Rule 4: Halts when max attempt threshold (3) is reached (Attempt Exhaustion)', () => {
    const res = evaluateStoppingRules({
      journeyStatus: 'recovering',
      currentAttempt: 3,
      maxAttempts: 3,
      customerDndStatus: 'active',
    });

    expect(res.shouldStop).toBe(true);
    expect(res.ruleFired).toBe('attempt_exhaustion');
    expect(res.nextStatus).toBe('exhausted');
  });

  it('Rule 5: Defers action if outside 8 AM - 7 PM IST contact hours window', () => {
    // 22:30 IST (Night)
    setClock(new FixedClock('2026-08-21T22:30:00+05:30'));

    const res = evaluateStoppingRules({
      journeyStatus: 'recovering',
      currentAttempt: 1,
      maxAttempts: 3,
      customerDndStatus: 'active',
      checkContactHours: true,
    });

    expect(res.shouldStop).toBe(true);
    expect(res.ruleFired).toBe('outside_contact_hours');
    expect(res.nextStatus).toBe('recovering'); // Not aborted permanently, just deferred
  });

  it('Passes all checks when inside valid hours, attempts < 3, no opt out', () => {
    // 14:00 IST (Daytime)
    setClock(new FixedClock('2026-08-21T14:00:00+05:30'));

    const res = evaluateStoppingRules({
      journeyStatus: 'recovering',
      currentAttempt: 1,
      maxAttempts: 3,
      customerDndStatus: 'active',
      checkContactHours: true,
    });

    expect(res.shouldStop).toBe(false);
    expect(res.ruleFired).toBeNull();
  });
});
