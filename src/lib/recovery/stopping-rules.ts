import { isWithinContactHours, getClock } from '../utils/time';

export interface StoppingRuleEvaluationContext {
  journeyStatus: string;
  currentAttempt: number;
  maxAttempts: number;
  customerDndStatus: string;
  isPaymentSuccessful?: boolean;
  customerMessage?: string | null;
  checkContactHours?: boolean;
}

export interface StoppingRuleResult {
  shouldStop: boolean;
  ruleFired: 'payment_success' | 'opt_out' | 'attempt_exhaustion' | 'dnd_active' | 'outside_contact_hours' | null;
  nextStatus: 'resolved' | 'opted_out' | 'exhausted' | 'recovering' | null;
  reason: string;
}

/**
 * Checks all 5 regulatory and business stopping rules deterministically.
 */
export function evaluateStoppingRules(ctx: StoppingRuleEvaluationContext): StoppingRuleResult {
  // 1. Payment Success
  if (ctx.isPaymentSuccessful || ctx.journeyStatus === 'resolved') {
    return {
      shouldStop: true,
      ruleFired: 'payment_success',
      nextStatus: 'resolved',
      reason: 'Payment has succeeded. Halting all recovery outreach.',
    };
  }

  // 2. Customer Opt-Out via "STOP" / "unsubscribe"
  if (ctx.customerMessage) {
    const text = ctx.customerMessage.trim().toLowerCase();
    if (
      text === 'stop' ||
      text.includes('stop') ||
      text.includes('unsubscribe') ||
      text.includes('band karo') ||
      text.includes('mat bhejo')
    ) {
      return {
        shouldStop: true,
        ruleFired: 'opt_out',
        nextStatus: 'opted_out',
        reason: 'Customer explicitly requested opt-out ("STOP"). Immediately halting outreach and enabling DND.',
      };
    }
  }

  // 3. Customer already in DND status
  if (ctx.customerDndStatus === 'opted_out') {
    return {
      shouldStop: true,
      ruleFired: 'dnd_active',
      nextStatus: 'opted_out',
      reason: 'Customer is marked as DND (opted-out). Skipping all outreach.',
    };
  }

  // 4. Attempt Exhaustion (>= 3 attempts)
  if (ctx.currentAttempt >= ctx.maxAttempts) {
    return {
      shouldStop: true,
      ruleFired: 'attempt_exhaustion',
      nextStatus: 'exhausted',
      reason: `Maximum outreach attempts (${ctx.maxAttempts}) reached across all channels. Moving journey to exhausted.`,
    };
  }

  // 5. Contact Hours Window (8 AM to 7 PM IST)
  if (ctx.checkContactHours) {
    const clock = getClock();
    if (!isWithinContactHours(clock.now())) {
      return {
        shouldStop: true,
        ruleFired: 'outside_contact_hours',
        nextStatus: 'recovering', // Remains recovering, but execution deferred
        reason: 'Current time is outside the mandatory 8:00 AM - 7:00 PM IST contact window. Action deferred.',
      };
    }
  }

  return {
    shouldStop: false,
    ruleFired: null,
    nextStatus: null,
    reason: 'All safety and regulatory checks passed. Proceeding with recovery action.',
  };
}
