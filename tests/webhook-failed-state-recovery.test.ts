import { describe, it, expect, afterAll } from 'vitest';
import crypto from 'crypto';
import fs from 'fs';
import { NextRequest } from 'next/server';

// Isolate this suite onto its own on-disk DB file so it never races the
// shared DB used by tests/e2e-smoke.test.ts (which truncates all tables in
// its own beforeAll under Vitest's parallel-by-default file execution).
const testDbPath = `./data/test-ra10-${crypto.randomUUID()}.db`;
process.env.DATABASE_URL = `file:${testDbPath}`;

const { db } = await import('../src/lib/db');
const { webhookEvents, recoveryJourneys, paymentFailures } = await import('../src/lib/db/schema');
const { eq } = await import('drizzle-orm');
const { POST } = await import('../src/app/api/webhooks/razorpay/route');

/**
 * RA-10: a throw during processing must leave the webhook_events row at
 * 'failed', not stuck at 'processing' forever, and a retry of a 'failed'
 * event must actually reprocess it rather than being silently swallowed.
 */
describe('POST /api/webhooks/razorpay — failed-state recovery & idempotency (RA-10)', () => {
  afterAll(() => {
    for (const suffix of ['', '-wal', '-shm']) {
      try {
        fs.unlinkSync(testDbPath + suffix);
      } catch {
        // file may not exist
      }
    }
  });

  function buildBody(eventId: string, email: string, orderId: string) {
    return JSON.stringify({
      entity: 'event',
      account_id: 'acc_test',
      event: 'payment.failed',
      contains: ['payment'],
      created_at: Math.floor(Date.now() / 1000),
      id: eventId,
      payload: {
        payment: {
          entity: {
            id: `pay_${crypto.randomUUID()}`,
            amount: 49900,
            currency: 'INR',
            status: 'failed',
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
    });
  }

  function buildRequest(body: string) {
    return new NextRequest('http://localhost/api/webhooks/razorpay', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
  }

  it('marks the event failed (not stuck processing) when downstream processing throws', async () => {
    const eventId = `evt_ra10_fail_${crypto.randomUUID()}`;
    // Malformed payload: 'payment.failed' event with no `payload.payment` and no
    // amount, causing the paymentFailures insert to violate its NOT NULL amount
    // column and throw mid-processing.
    const body = JSON.stringify({
      entity: 'event',
      event: 'payment.failed',
      id: eventId,
      payload: { payment: { entity: { id: 'pay_broken', order_id: 'order_broken', amount: null } } },
    });

    const res = await POST(buildRequest(body));
    expect(res.status).toBe(500);

    const [row] = await db.select().from(webhookEvents).where(eq(webhookEvents.id, eventId));
    expect(row.processingStatus).toBe('failed');
    expect(row.errorMessage).toBeTruthy();
  });

  it('reprocesses successfully on retry of a failed event', async () => {
    const eventId = `evt_ra10_retry_${crypto.randomUUID()}`;
    const brokenBody = JSON.stringify({
      entity: 'event',
      event: 'payment.failed',
      id: eventId,
      payload: { payment: { entity: { id: 'pay_broken2', order_id: 'order_broken2', amount: null } } },
    });

    const firstRes = await POST(buildRequest(brokenBody));
    expect(firstRes.status).toBe(500);

    const [failedRow] = await db.select().from(webhookEvents).where(eq(webhookEvents.id, eventId));
    expect(failedRow.processingStatus).toBe('failed');

    // Retry redelivery of the same event id, now with a well-formed payload
    // (Razorpay resends the same event unmodified, but this proves the row
    // is genuinely reprocessed rather than permanently swallowed).
    const email = `ra10-retry-${crypto.randomUUID()}@example.com`;
    const goodBody = buildBody(eventId, email, `order_${crypto.randomUUID()}`);

    const secondRes = await POST(buildRequest(goodBody));
    expect(secondRes.status).toBe(200);

    const [processedRow] = await db.select().from(webhookEvents).where(eq(webhookEvents.id, eventId));
    expect(processedRow.processingStatus).toBe('processed');

    const journeys = await db.select().from(recoveryJourneys);
    const failures = await db.select().from(paymentFailures);
    expect(failures.some((f) => f.customerId)).toBe(true);
    expect(journeys.length).toBeGreaterThan(0);
  });

  it('returns 200 with no side effects on retry of an already-processed event', async () => {
    const eventId = `evt_ra10_dup_${crypto.randomUUID()}`;
    const email = `ra10-dup-${crypto.randomUUID()}@example.com`;
    const body = buildBody(eventId, email, `order_${crypto.randomUUID()}`);

    const firstRes = await POST(buildRequest(body));
    expect(firstRes.status).toBe(200);

    const journeysAfterFirst = await db.select().from(recoveryJourneys);
    const countAfterFirst = journeysAfterFirst.length;

    const secondRes = await POST(buildRequest(body));
    expect(secondRes.status).toBe(200);
    const secondJson = await secondRes.json();
    expect(secondJson.data.message).toMatch(/duplicate/i);

    const journeysAfterSecond = await db.select().from(recoveryJourneys);
    expect(journeysAfterSecond.length).toBe(countAfterFirst);
  });

  it('produces exactly one journey and no 500s from two concurrent deliveries of the same event', async () => {
    const eventId = `evt_ra10_concurrent_${crypto.randomUUID()}`;
    const email = `ra10-concurrent-${crypto.randomUUID()}@example.com`;
    const orderId = `order_${crypto.randomUUID()}`;
    const body = buildBody(eventId, email, orderId);

    const [res1, res2] = await Promise.all([
      POST(buildRequest(body)),
      POST(buildRequest(body)),
    ]);

    const statuses = [res1.status, res2.status].sort();
    // One request wins the claim (200); the other observes 'processing' and
    // is told to retry (503) rather than getting a 500 or double-processing.
    expect(statuses).toEqual([200, 503]);

    const [failure] = await db
      .select()
      .from(paymentFailures)
      .where(eq(paymentFailures.razorpayOrderId, orderId));
    expect(failure).toBeDefined();

    const journeys = await db.select().from(recoveryJourneys).where(eq(recoveryJourneys.failureId, failure.id));
    expect(journeys.length).toBe(1);
  });
});
