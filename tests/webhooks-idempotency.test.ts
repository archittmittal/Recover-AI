import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { verifyWebhookSignature, computePayloadHash } from '../src/lib/razorpay/webhooks';

describe('Webhook Signature Verification & Idempotency Hashing', () => {
  const secret = 'rzp_wh_secret_test_1234567890';
  const samplePayload = JSON.stringify({
    entity: 'event',
    event: 'payment.failed',
    id: 'evt_test_123',
    payload: { payment: { entity: { id: 'pay_123', amount: 499900 } } },
  });

  it('validates genuine HMAC-SHA256 signature using timing-safe comparison', () => {
    const validSignature = crypto
      .createHmac('sha256', secret)
      .update(samplePayload)
      .digest('hex');

    const isValid = verifyWebhookSignature(samplePayload, validSignature, secret);
    expect(isValid).toBe(true);
  });

  it('rejects tampered body or invalid signature safely', () => {
    const validSignature = crypto
      .createHmac('sha256', secret)
      .update(samplePayload)
      .digest('hex');

    const tamperedPayload = samplePayload.replace('499900', '100');
    const isValid = verifyWebhookSignature(tamperedPayload, validSignature, secret);
    expect(isValid).toBe(false);
  });

  it('computes deterministic payload hash for idempotency deduplication', () => {
    const hash1 = computePayloadHash(samplePayload);
    const hash2 = computePayloadHash(samplePayload);
    const hashDifferent = computePayloadHash(samplePayload + ' ');

    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hashDifferent);
    expect(hash1.length).toBe(64); // SHA-256 hex length
  });
});
