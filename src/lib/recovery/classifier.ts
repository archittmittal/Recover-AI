import { RazorpayErrorSource, RazorpayErrorStep, RazorpayErrorCode, RazorpayFailureType } from '../razorpay/types';

export type RecoveryStrategy =
  | 'smart_retry'
  | 'merchant_alert'
  | 'payment_link'
  | 'conversational'
  | 'invoice_reminder';

export interface ClassificationInput {
  errorSource: RazorpayErrorSource | string;
  errorStep: RazorpayErrorStep | string;
  errorCode: RazorpayErrorCode | string;
  errorReason: string;
  failureType: RazorpayFailureType | string;
  customerSegment?: 'b2c' | 'b2b';
  amount?: number; // paise
}

export interface ClassificationResult {
  strategy: RecoveryStrategy | null;
  confidence: number;
  reasoning: string;
  isDeterministic: boolean;
  category: string;
}

/**
 * Deterministic failure classifier mapping Razorpay error taxonomy to recovery strategies.
 * High-precision, zero-cost, instant lookup table that handles unambiguous error sources.
 */
export function classifyFailureDeterministic(input: ClassificationInput): ClassificationResult {
  const source = input.errorSource.toLowerCase();
  const reason = input.errorReason.toLowerCase();
  const failureType = input.failureType.toLowerCase();
  const segment = input.customerSegment?.toLowerCase() || 'b2c';

  // 1. Infrastructure failures: Customer did nothing wrong. Retry without customer outreach.
  const infrastructureSources = ['gateway', 'network', 'issuer_bank', 'customer_psp', 'beneficiary_bank'];
  if (infrastructureSources.includes(source)) {
    return {
      strategy: 'smart_retry',
      confidence: 1.0,
      reasoning: `Infrastructure failure from '${source}' (${input.errorReason}). Automated retries scheduled without disturbing customer.`,
      isDeterministic: true,
      category: 'TRANSIENT_GATEWAY',
    };
  }

  // 2. Merchant-side misconfigurations: Surface to merchant, never message the customer.
  if (source === 'business' || source === 'internal') {
    return {
      strategy: 'merchant_alert',
      confidence: 1.0,
      reasoning: `Merchant-side configuration error from '${source}' (${input.errorReason}). Customer cannot resolve this; surfaced to merchant dashboard.`,
      isDeterministic: true,
      category: 'MERCHANT_CONFIGURATION',
    };
  }

  // 3. Customer-side actions on one-time payments or dropoffs: Payment link outreach
  if (source === 'customer') {
    // Checkout drop-off / cart abandonment
    if (reason === 'checkout_abandonment') {
      return {
        strategy: 'conversational',
        confidence: 0.95,
        reasoning: 'Checkout drop-off detected. Initiating personalized conversational reminder with cart incentive.',
        isDeterministic: true,
        category: 'CHECKOUT_ABANDONMENT',
      };
    }

    // B2B Overdue Invoices
    if (failureType === 'invoice' || segment === 'b2b' || reason === 'invoice_overdue') {
      return {
        strategy: 'invoice_reminder',
        confidence: 1.0,
        reasoning: 'Overdue commercial invoice detected. Initiating escalating invoice notification cadence.',
        isDeterministic: true,
        category: 'INVOICE_OVERDUE',
      };
    }

    // Subscription Card Expiry
    if (failureType === 'subscription' && (reason === 'card_expired' || reason.includes('expired'))) {
      return {
        strategy: 'conversational',
        confidence: 1.0,
        reasoning: 'Subscribed card has expired. Initiating card update flow with plan downgrade options.',
        isDeterministic: true,
        category: 'CARD_LIFECYCLE',
      };
    }

    // Subscription or Mandate inactive/revoked
    if (failureType === 'mandate' || reason === 'mandate_inactive' || reason.includes('mandate')) {
      return {
        strategy: 'conversational',
        confidence: 0.95,
        reasoning: 'Recurring payment mandate inactive or revoked. Requesting customer re-authorization.',
        isDeterministic: true,
        category: 'MANDATE_ISSUE',
      };
    }

    // Direct payment decline / insufficient funds / auth failed
    if (
      reason === 'insufficient_funds' ||
      reason === 'authentication_failed' ||
      reason === 'payment_cancelled' ||
      reason === 'card_declined' ||
      reason === 'bank_account_invalid'
    ) {
      return {
        strategy: 'payment_link',
        confidence: 1.0,
        reasoning: `Customer payment declined due to '${reason}'. Dynamic payment link generated with alternative payment methods.`,
        isDeterministic: true,
        category: 'CUSTOMER_FUNDS',
      };
    }
  }

  // 4. Unrecognised source or ambiguous reason: NEVER silently guess.
  return {
    strategy: null,
    confidence: 0.0,
    reasoning: `Unrecognised error_source '${input.errorSource}' with reason '${input.errorReason}'. Routed to exception list for review.`,
    isDeterministic: true,
    category: 'UNCLASSIFIED',
  };
}
