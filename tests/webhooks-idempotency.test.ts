import { describe, it, expect, afterAll } from 'vitest';
import crypto from 'crypto';
import fs from 'fs';
import { verifyWebhookSignature, computePayloadHash } from '../src/lib/razorpay/webhooks';
import { buildJsonRequest } from './helpers/request';

// Isolate this suite onto its own on-disk DB file so it never races the
// shared DB used by tests/e2e-smoke.test.ts (which truncates all tables in
// its own beforeAll under Vitest's parallel-by-default file execution).
const testDbPath = `./data/test-webhooks-idempotency-${crypto.randomUUID()}.db`;
process.env.DATABASE_URL = `file:${testDbPath}`;

const { db } = await import('../src/lib/db');
const { recoveryJourneys, paymentFailures, customers } = await import('../src/lib/db/schema');
const { eq } = await import('drizzle-orm');
const { POST } = await import('../src/app/api/webhooks/razorpay/route');

describe('Webhook Signature Verification & Payload Hashing', () => {
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

describe('Webhook route — replay deduplication (RA-18: exercises the real handler)', () => {
  afterAll(() => {
    for (const suffix of ['', '-wal', '-shm']) {
      try {
        fs.unlinkSync(testDbPath + suffix);
      } catch {
        // file may not exist
      }
    }
  });

  function buildPayload(eventId: string, email: string, orderId: string) {
    return {
      entity: 'event',
      event: 'payment.failed',
      id: eventId,
      payload: {
        payment: {
          entity: {
            id: `pay_${crypto.randomUUID()}`,
            amount: 49900,
            currency: 'INR',
            order_id: orderId,
            method: 'card',
            email,
            contact: '+919876500001',
            error_code: 'BAD_REQUEST_ERROR',
            error_source: 'customer',
            error_step: 'authorization',
            error_reason: 'insufficient_funds',
            error_description: 'Insufficient funds.',
          },
        },
      },
    };
  }

  it('detects and deduplicates a replayed webhook delivered with the same event id', async () => {
    const eventId = `evt_dedup_${crypto.randomUUID()}`;
    const email = `dedup-${crypto.randomUUID()}@example.com`;
    const orderId = `order_${crypto.randomUUID()}`;
    const payload = buildPayload(eventId, email, orderId);

    const firstRes = await POST(buildJsonRequest('http://localhost/api/webhooks/razorpay', payload));
    expect(firstRes.status).toBe(200);

    const secondRes = await POST(buildJsonRequest('http://localhost/api/webhooks/razorpay', payload));
    expect(secondRes.status).toBe(200);
    const secondJson = await secondRes.json();
    expect(secondJson.data.message).toMatch(/duplicate/i);

    const [failure] = await db
      .select()
      .from(paymentFailures)
      .where(eq(paymentFailures.razorpayOrderId, orderId));
    expect(failure).toBeDefined();

    const journeys = await db
      .select()
      .from(recoveryJourneys)
      .where(eq(recoveryJourneys.failureId, failure.id));
    expect(journeys.length).toBe(1);

    const matchingCustomers = await db.select().from(customers).where(eq(customers.email, email));
    expect(matchingCustomers.length).toBe(1);
  });

  it('processes two distinct event ids as two distinct journeys', async () => {
    const email = `distinct-${crypto.randomUUID()}@example.com`;

    const eventA = `evt_distinct_a_${crypto.randomUUID()}`;
    const orderA = `order_a_${crypto.randomUUID()}`;
    const resA = await POST(buildJsonRequest('http://localhost/api/webhooks/razorpay', buildPayload(eventA, email, orderA)));
    expect(resA.status).toBe(200);

    const eventB = `evt_distinct_b_${crypto.randomUUID()}`;
    const orderB = `order_b_${crypto.randomUUID()}`;
    const resB = await POST(buildJsonRequest('http://localhost/api/webhooks/razorpay', buildPayload(eventB, email, orderB)));
    expect(resB.status).toBe(200);

    const failures = await db.select().from(paymentFailures).where(eq(paymentFailures.razorpayOrderId, orderA));
    const failuresB = await db.select().from(paymentFailures).where(eq(paymentFailures.razorpayOrderId, orderB));
    expect(failures.length).toBe(1);
    expect(failuresB.length).toBe(1);
    expect(failures[0].id).not.toBe(failuresB[0].id);
  });
});
