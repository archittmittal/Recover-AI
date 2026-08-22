import { describe, it, expect } from 'vitest';
import { classifyFailureDeterministic } from '../src/lib/recovery/classifier';

describe('Failure Classifier Deterministic Taxonomy Mapping', () => {
  it('maps gateway and network infrastructure errors to smart_retry', () => {
    const infrastructureSources = ['gateway', 'network', 'issuer_bank', 'customer_psp', 'beneficiary_bank'];

    for (const src of infrastructureSources) {
      const res = classifyFailureDeterministic({
        errorSource: src,
        errorStep: 'payment_authorization',
        errorCode: 'GATEWAY_ERROR',
        errorReason: 'gateway_technical_error',
        failureType: 'one_time',
      });

      expect(res.strategy).toBe('smart_retry');
      expect(res.category).toBe('TRANSIENT_GATEWAY');
    }
  });

  it('maps customer insufficient_funds and authentication_failed to payment_link', () => {
    const res = classifyFailureDeterministic({
      errorSource: 'customer',
      errorStep: 'authorization',
      errorCode: 'BAD_REQUEST_ERROR',
      errorReason: 'insufficient_funds',
      failureType: 'one_time',
    });

    expect(res.strategy).toBe('payment_link');
    expect(res.category).toBe('CUSTOMER_FUNDS');
  });

  it('maps subscription card_expired to conversational update flow', () => {
    const res = classifyFailureDeterministic({
      errorSource: 'customer',
      errorStep: 'authorization',
      errorCode: 'BAD_REQUEST_ERROR',
      errorReason: 'card_expired',
      failureType: 'subscription',
    });

    expect(res.strategy).toBe('conversational');
    expect(res.category).toBe('CARD_LIFECYCLE');
  });

  it('maps merchant business and internal errors to merchant_alert', () => {
    const res = classifyFailureDeterministic({
      errorSource: 'business',
      errorStep: 'initiation',
      errorCode: 'BAD_REQUEST_ERROR',
      errorReason: 'account_inactive',
      failureType: 'one_time',
    });

    expect(res.strategy).toBe('merchant_alert');
    expect(res.category).toBe('MERCHANT_CONFIGURATION');
  });

  it('routes unclassified/unrecognised error sources to exception list without guessing', () => {
    const res = classifyFailureDeterministic({
      errorSource: 'unknown_alien_system',
      errorStep: 'unknown',
      errorCode: 'SERVER_ERROR',
      errorReason: 'mysterious_decline',
      failureType: 'one_time',
    });

    expect(res.strategy).toBeNull();
    expect(res.category).toBe('UNCLASSIFIED');
    expect(res.confidence).toBe(0.0);
  });
});
