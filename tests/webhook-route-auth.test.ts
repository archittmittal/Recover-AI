import { describe, it, expect, afterEach } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST } from '../src/app/api/webhooks/razorpay/route';

/**
 * RA-01: signature verification must fail closed when RAZORPAY_WEBHOOK_SECRET
 * is missing or still a placeholder, not silently skip verification.
 * These tests call the real route handler, not a re-implementation.
 */
describe('POST /api/webhooks/razorpay — signature enforcement', () => {
  const originalSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.RAZORPAY_WEBHOOK_SECRET;
    } else {
      process.env.RAZORPAY_WEBHOOK_SECRET = originalSecret;
    }
  });

  function buildRequest(body: string, signature?: string) {
    return new NextRequest('http://localhost/api/webhooks/razorpay', {
      method: 'POST',
      headers: signature ? { 'x-razorpay-signature': signature } : {},
      body,
    });
  }

  it('rejects with 503 when the webhook secret is unset', async () => {
    delete process.env.RAZORPAY_WEBHOOK_SECRET;

    const res = await POST(buildRequest('{}', 'irrelevant'));
    expect(res.status).toBe(503);

    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('NOT_CONFIGURED');
  });

  it('rejects with 503 when the webhook secret is still the placeholder', async () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = 'XXXXXXXXXXXXXXXXXXXXXXXX';

    const res = await POST(buildRequest('{}', 'irrelevant'));
    expect(res.status).toBe(503);
  });

  it('rejects with 400 when the signature is missing', async () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = 'a-real-test-secret';

    const res = await POST(buildRequest('{}'));
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error.code).toBe('INVALID_SIGNATURE');
  });

  it('rejects with 400 when the signature does not match the body', async () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = 'a-real-test-secret';

    const res = await POST(buildRequest('{"event":"payment.captured"}', 'not-a-valid-signature'));
    expect(res.status).toBe(400);
  });

  it('passes verification with a genuine HMAC-SHA256 signature', async () => {
    const secret = 'a-real-test-secret';
    process.env.RAZORPAY_WEBHOOK_SECRET = secret;

    const body = JSON.stringify({
      id: `evt_ra01_test_${crypto.randomUUID()}`,
      event: 'payment.captured', // non-failure event: exercises verification without the recovery pipeline
      payload: {},
    });
    const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');

    const res = await POST(buildRequest(body, signature));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
  });
});
