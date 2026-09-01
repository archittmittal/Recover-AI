import { describe, it, expect } from 'vitest';
import { classifyFailureDeterministic } from '../src/lib/recovery/classifier';
import { getChannelForAttempt, STRATEGY_CONFIGS } from '../src/lib/recovery/strategies';

describe('Recovery Strategies & Escalation Matrix Test Suite', () => {
  describe('1. Strategy Routing & Taxonomy Classification', () => {
    it('routes customer funds declines to payment_link strategy', () => {
      const result = classifyFailureDeterministic({
        errorSource: 'customer',
        errorStep: 'payment_authorization',
        errorCode: 'BAD_REQUEST_ERROR',
        errorReason: 'insufficient_funds',
        failureType: 'one_time',
      });

      expect(result.strategy).toBe('payment_link');
      expect(result.confidence).toBeGreaterThanOrEqual(0.95);
    });

    it('routes network, gateway, and bank infrastructure downtime to smart_retry', () => {
      const sources = ['gateway', 'network', 'issuer_bank', 'customer_psp'] as const;

      for (const errorSource of sources) {
        const result = classifyFailureDeterministic({
          errorSource,
          errorStep: 'payment_authorization',
          errorCode: 'GATEWAY_ERROR',
          errorReason: 'gateway_timeout',
          failureType: 'one_time',
        });

        expect(result.strategy).toBe('smart_retry');
      }
    });

    it('routes business and internal configuration errors to merchant_alert', () => {
      const businessSources = ['business', 'internal'] as const;

      for (const errorSource of businessSources) {
        const result = classifyFailureDeterministic({
          errorSource,
          errorStep: 'payment_initiation',
          errorCode: 'BAD_REQUEST_ERROR',
          errorReason: 'account_inactive',
          failureType: 'one_time',
        });

        expect(result.strategy).toBe('merchant_alert');
      }
    });

    it('routes card expiration to conversational strategy', () => {
      const result = classifyFailureDeterministic({
        errorSource: 'customer',
        errorStep: 'payment_authentication',
        errorCode: 'BAD_REQUEST_ERROR',
        errorReason: 'card_expired',
        failureType: 'subscription',
      });

      expect(result.strategy).toBe('conversational');
    });
  });

  describe('2. Multi-Channel Escalation Ladder', () => {
    it('escalates payment_link strategy across WhatsApp -> SMS -> Voice', () => {
      expect(getChannelForAttempt('payment_link', 1)).toBe('whatsapp');
      expect(getChannelForAttempt('payment_link', 2)).toBe('sms');
      expect(getChannelForAttempt('payment_link', 3)).toBe('voice');
    });

    it('escalates conversational strategy across WhatsApp -> SMS', () => {
      expect(getChannelForAttempt('conversational', 1)).toBe('whatsapp');
      expect(getChannelForAttempt('conversational', 2)).toBe('sms');
    });

    it('restricts merchant_alert strategy strictly to internal email notifications', () => {
      expect(getChannelForAttempt('merchant_alert', 1)).toBe('email');
      expect(getChannelForAttempt('merchant_alert', 2)).toBe('email');
    });
  });

  describe('3. Strategy Configuration Safeguards', () => {
    it('ensures all outreach strategies have maximum attempt limits of <= 3', () => {
      for (const config of Object.values(STRATEGY_CONFIGS)) {
        expect(config.maxAttempts).toBeLessThanOrEqual(3);

        // no_outreach is Arm A's control (RA-22): it exists precisely to dispatch nothing, so
        // it is the one config whose attempt cap and channel ladder must be empty. Every other
        // strategy still has to be able to reach a customer.
        if (config.strategy === 'no_outreach') {
          expect(config.maxAttempts).toBe(0);
          expect(config.channelSequence).toHaveLength(0);
          continue;
        }

        expect(config.maxAttempts).toBeGreaterThan(0);
        expect(config.channelSequence.length).toBeGreaterThan(0);
      }
    });
  });
});
