import { isWithinContactHours, getClock } from '../utils/time';

// Multi-word Hindi/Hinglish/Devanagari opt-out phrases. Matched via plain
// substring since these are distinctive phrases, not single ambiguous words.
const OPT_OUT_PHRASES = [
  'band karo',
  'mat bhejo',
  'mat karo',
  'बंद करो',
  'रोको',
  'मत भेजो',
];

// Single/short English opt-out keywords. Matched with word boundaries so
// "the bank stopped my transaction" does NOT match "stop", while
// "please stop sending" does.
const OPT_OUT_KEYWORDS = [
  'stop',
  'unsubscribe',
  'opt out',
  'optout',
  'do not contact',
  "don't contact",
  'remove me',
  'do not text',
  'do not message',
  'do not sms',
  'stop messaging',
  'stop texting',
  'no more messages',
];

/**
 * Single source of truth for detecting a customer opt-out request.
 * Shared by the deterministic stopping-rule engine and the conversational
 * agent so the two can never drift out of sync (see RA-08/RA-11).
 */
export function detectOptOut(message: string | null | undefined): boolean {
  if (!message) return false;
  const text = message.trim().toLowerCase();
  if (!text) return false;

  for (const phrase of OPT_OUT_PHRASES) {
    if (text.includes(phrase.toLowerCase())) return true;
  }

  for (const keyword of OPT_OUT_KEYWORDS) {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(^|\\W)${escaped}(\\W|$)`, 'i');
    if (pattern.test(text)) return true;
  }

  return false;
}

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

  // 2. Customer Opt-Out via "STOP" / "unsubscribe" / equivalents
  if (detectOptOut(ctx.customerMessage)) {
    return {
      shouldStop: true,
      ruleFired: 'opt_out',
      nextStatus: 'opted_out',
      reason: 'Customer explicitly requested opt-out ("STOP"). Immediately halting outreach and enabling DND.',
    };
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
