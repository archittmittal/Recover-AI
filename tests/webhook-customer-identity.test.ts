import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'crypto';
import fs from 'fs';
import { NextRequest } from 'next/server';

// Isolate this suite onto its own on-disk DB file so it never races the
// shared DB used by tests/e2e-smoke.test.ts.
const testDbPath = `./data/test-ra16-${crypto.randomUUID()}.db`;
process.env.DATABASE_URL = `file:${testDbPath}`;

const { db } = await import('../src/lib/db');
const schema = await import('../src/lib/db/schema');
const { eq } = await import('drizzle-orm');
const { POST } = await import('../src/app/api/webhooks/razorpay/route');
const { generateId } = await import('../src/lib/utils/ids');
const { getClock, formatIST } = await import('../src/lib/utils/time');
const { recoveryCoordinator } = await import('../src/lib/recovery/coordinator');

const secret = 'ra16-test-secret';
const originalSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

function sign(body: string) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function buildRequest(body: { id?: string } & Record<string, unknown>, eventId?: string) {
  const rawBody = JSON.stringify(body);
  const actualEventId = eventId || body.id || `evt_${crypto.randomUUID()}`;
  return new NextRequest('http://localhost/api/webhooks/razorpay', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-razorpay-signature': sign(rawBody),
      'x-razorpay-event-id': actualEventId,
    },
    body: rawBody,
  });
}

function paymentFailedPayload(overrides: {
  eventId: string;
  orderId: string;
  email?: string;
  contact?: string;
  customer_id?: string;
}) {
  return {
    entity: 'event',
    event: 'payment.failed',
    id: overrides.eventId,
    payload: {
      payment: {
        entity: {
          id: `pay_${crypto.randomUUID()}`,
          amount: 49900,
          currency: 'INR',
          order_id: overrides.orderId,
          method: 'card',
          email: overrides.email,
          contact: overrides.contact,
          customer_id: overrides.customer_id,
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

describe('Webhook customer identity resolution (RA-16)', () => {
  beforeAll(() => {
    process.env.RAZORPAY_WEBHOOK_SECRET = secret;
  });

  afterAll(() => {
    if (originalSecret === undefined) {
      delete process.env.RAZORPAY_WEBHOOK_SECRET;
    } else {
      process.env.RAZORPAY_WEBHOOK_SECRET = originalSecret;
    }
    for (const suffix of ['', '-wal', '-shm']) {
      try {
        fs.unlinkSync(testDbPath + suffix);
      } catch {
        // file may not exist
      }
    }
  });

  it('two failures with no email and different phone numbers create two distinct customers', async () => {
    const orderA = `order_${crypto.randomUUID()}`;
    const orderB = `order_${crypto.randomUUID()}`;

    const resA = await POST(
      buildRequest(
        paymentFailedPayload({ eventId: `evt_${crypto.randomUUID()}`, orderId: orderA, contact: '9800011111' })
      )
    );
    expect(resA.status).toBe(200);

    const resB = await POST(
      buildRequest(
        paymentFailedPayload({ eventId: `evt_${crypto.randomUUID()}`, orderId: orderB, contact: '9800022222' })
      )
    );
    expect(resB.status).toBe(200);

    const [failureA] = await db.select().from(schema.paymentFailures).where(eq(schema.paymentFailures.razorpayOrderId, orderA));
    const [failureB] = await db.select().from(schema.paymentFailures).where(eq(schema.paymentFailures.razorpayOrderId, orderB));

    expect(failureA.customerId).not.toBe(failureB.customerId);

    const [custA] = await db.select().from(schema.customers).where(eq(schema.customers.id, failureA.customerId));
    const [custB] = await db.select().from(schema.customers).where(eq(schema.customers.id, failureB.customerId));
    expect(custA.phone).toBe('+919800011111');
    expect(custB.phone).toBe('+919800022222');
    expect(custA.email).toBeNull();
    expect(custB.email).toBeNull();
  });

  it('two failures for the same razorpay_customer_id reuse one customer', async () => {
    const razorpayCustomerId = `cust_${crypto.randomUUID()}`;
    const orderA = `order_${crypto.randomUUID()}`;
    const orderB = `order_${crypto.randomUUID()}`;

    await POST(
      buildRequest(
        paymentFailedPayload({
          eventId: `evt_${crypto.randomUUID()}`,
          orderId: orderA,
          contact: '9800033333',
          customer_id: razorpayCustomerId,
        })
      )
    );
    await POST(
      buildRequest(
        paymentFailedPayload({
          eventId: `evt_${crypto.randomUUID()}`,
          orderId: orderB,
          contact: '9800044444', // different phone, same razorpay customer id
          customer_id: razorpayCustomerId,
        })
      )
    );

    const [failureA] = await db.select().from(schema.paymentFailures).where(eq(schema.paymentFailures.razorpayOrderId, orderA));
    const [failureB] = await db.select().from(schema.paymentFailures).where(eq(schema.paymentFailures.razorpayOrderId, orderB));

    expect(failureA.customerId).toBe(failureB.customerId);

    const matchingCustomers = await db
      .select()
      .from(schema.customers)
      .where(eq(schema.customers.razorpayCustomerId, razorpayCustomerId));
    expect(matchingCustomers.length).toBe(1);
  });

  it('a failure with no email, no contact, and no razorpay customer id creates an uncontactable journey that dispatches nothing', async () => {
    const orderId = `order_${crypto.randomUUID()}`;
    const eventId = `evt_${crypto.randomUUID()}`;

    const res = await POST(buildRequest(paymentFailedPayload({ eventId, orderId })));
    expect(res.status).toBe(200);

    const [failure] = await db.select().from(schema.paymentFailures).where(eq(schema.paymentFailures.razorpayOrderId, orderId));
    expect(failure).toBeDefined();

    const [customer] = await db.select().from(schema.customers).where(eq(schema.customers.id, failure.customerId));
    expect(customer.phone).toBeNull();
    expect(customer.email).toBeNull();

    const [journey] = await db
      .select()
      .from(schema.recoveryJourneys)
      .where(eq(schema.recoveryJourneys.failureId, failure.id));
    expect(journey.status).toBe('uncontactable');

    const actions = await db
      .select()
      .from(schema.recoveryActions)
      .where(eq(schema.recoveryActions.journeyId, journey.id));
    expect(actions.length).toBe(0);
  });

  it('processRecoveryAttempt never dispatches to a customer with a null phone, even outside the webhook path', async () => {
    const nowStr = formatIST(getClock().now());
    const customerId = generateId('cust');
    const failureId = generateId('fail');
    const journeyId = generateId('rj');

    await db.insert(schema.customers).values({
      id: customerId,
      name: 'No Contact Customer',
      email: null,
      phone: null,
      preferredLanguage: 'en',
      segment: 'b2c',
      totalFailures: 1,
      totalRecoveredAmount: 0,
      dndStatus: 'active',
      createdAt: nowStr,
      updatedAt: nowStr,
    });

    await db.insert(schema.paymentFailures).values({
      id: failureId,
      customerId,
      razorpayPaymentId: 'pay_no_contact',
      razorpayOrderId: `order_${crypto.randomUUID()}`,
      amount: 100000,
      currency: 'INR',
      paymentMethod: 'card',
      failureType: 'one_time',
      errorCode: 'BAD_REQUEST_ERROR',
      errorSource: 'customer',
      errorStep: 'authorization',
      errorReason: 'insufficient_funds',
      errorDescription: 'Insufficient funds',
      createdAt: nowStr,
    });

    // Seeded directly as 'recovering' (not via createUncontactableJourney)
    // to prove the coordinator's own defensive guard catches this, not
    // just the webhook route's upstream check.
    await db.insert(schema.recoveryJourneys).values({
      id: journeyId,
      customerId,
      failureId,
      status: 'recovering',
      strategy: 'payment_link',
      amountAtRisk: 100000,
      amountRecovered: 0,
      maxAttempts: 3,
      currentAttempt: 0,
      createdAt: nowStr,
      updatedAt: nowStr,
    });

    await recoveryCoordinator.processRecoveryAttempt(journeyId);

    const actions = await db.select().from(schema.recoveryActions).where(eq(schema.recoveryActions.journeyId, journeyId));
    expect(actions.length).toBe(0);

    const [journey] = await db.select().from(schema.recoveryJourneys).where(eq(schema.recoveryJourneys.id, journeyId));
    expect(journey.status).toBe('uncontactable');
  });
});
