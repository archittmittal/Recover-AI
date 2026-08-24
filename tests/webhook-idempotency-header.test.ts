import { describe, it, expect, afterAll, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import fs from 'fs';
import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';

// This file is the only test (besides e2e-smoke.test.ts) that writes through the
// real DB singleton. Vitest runs test files in parallel, and both files would
// otherwise contend for the same on-disk SQLite database — e2e-smoke's
// `seedDatabase()` truncates every table in its `beforeAll`, which races with
// the inserts this file makes via the live route handler. Pointing this file at
// its own database avoids that race without touching shared test infrastructure.
const testDbPath = `./data/test-ra04-${crypto.randomUUID()}.db`;
process.env.DATABASE_URL = `file:${testDbPath}`;

const { db } = await import('../src/lib/db');
const { customers, paymentFailures, recoveryJourneys, webhookEvents } = await import('../src/lib/db/schema');
const { POST } = await import('../src/app/api/webhooks/razorpay/route');

/**
 * RA-04: Razorpay sends the event identifier via the x-razorpay-event-id header,
 * never as a field in the JSON body. The route must read it from there (and
 * reject requests missing it) instead of falling back to a random id that can
 * never collide with a prior delivery.
 */
describe('POST /api/webhooks/razorpay — event-id based idempotency', () => {
  const secret = 'ra04-test-secret';
  const originalSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

  beforeEach(() => {
    process.env.RAZORPAY_WEBHOOK_SECRET = secret;
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.RAZORPAY_WEBHOOK_SECRET;
    } else {
      process.env.RAZORPAY_WEBHOOK_SECRET = originalSecret;
    }
  });

  afterAll(() => {
    for (const suffix of ['', '-wal', '-shm']) {
      try {
        fs.unlinkSync(testDbPath + suffix);
      } catch {
        // file may not exist; nothing to clean up
      }
    }
  });

  function sign(body: string) {
    return crypto.createHmac('sha256', secret).update(body).digest('hex');
  }

  function buildRequest(body: string, eventId?: string) {
    const headers: Record<string, string> = { 'x-razorpay-signature': sign(body) };
    if (eventId) headers['x-razorpay-event-id'] = eventId;
    return new NextRequest('http://localhost/api/webhooks/razorpay', {
      method: 'POST',
      headers,
      body,
    });
  }

  it('rejects with 400 when x-razorpay-event-id is missing', async () => {
    const body = JSON.stringify({ event: 'payment.captured', payload: {} });

    const res = await POST(buildRequest(body));
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error.code).toBe('MISSING_EVENT_ID');
  });

  it('processes a payment.failed event exactly once when the same event id is redelivered', async () => {
    const eventId = `evt_ra04_${crypto.randomUUID()}`;
    const email = `ra04-${crypto.randomUUID()}@example.com`;
    const body = JSON.stringify({
      entity: 'event',
      account_id: 'acc_test',
      event: 'payment.failed',
      contains: ['payment'],
      created_at: Math.floor(Date.now() / 1000),
      payload: {
        payment: {
          entity: {
            id: `pay_${crypto.randomUUID()}`,
            amount: 49900,
            currency: 'INR',
            status: 'failed',
            order_id: `order_${crypto.randomUUID()}`,
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

    const first = await POST(buildRequest(body, eventId));
    expect(first.status).toBe(200);

    const second = await POST(buildRequest(body, eventId));
    expect(second.status).toBe(200);
    const secondJson = await second.json();
    expect(secondJson.data.message).toMatch(/duplicate/i);

    const matchingEvents = await db.select().from(webhookEvents).where(eq(webhookEvents.id, eventId));
    expect(matchingEvents).toHaveLength(1);

    const matchingCustomers = await db.select().from(customers).where(eq(customers.email, email));
    expect(matchingCustomers).toHaveLength(1);

    const matchingFailures = await db
      .select()
      .from(paymentFailures)
      .where(eq(paymentFailures.customerId, matchingCustomers[0].id));
    expect(matchingFailures).toHaveLength(1);

    const matchingJourneys = await db
      .select()
      .from(recoveryJourneys)
      .where(eq(recoveryJourneys.failureId, matchingFailures[0].id));
    expect(matchingJourneys).toHaveLength(1);
  });
});
