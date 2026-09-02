import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import crypto from 'crypto';
import { eq } from 'drizzle-orm';

/**
 * `payment_link.paid` and `payment.captured` were verified, recorded, marked `processed` and then
 * dropped — `payload.event` was tested exactly once, for `payment.failed`. So a customer who
 * actually paid through a recovery link resolved nothing: the dashboard's recovered figure could
 * only move via the simulator's Pay button, while `DEPLOYMENT.md` told operators to subscribe to
 * both events and claimed one of them "resolves recovery journeys".
 *
 * Attribution is the delicate part. A journey is matched only by identifiers this system itself
 * created — the stored payment link id, or the `recov_<journeyId>_att<n>` reference stamped on
 * the link. Anything else is recorded and left alone, because guessing which open journey a
 * payment belonged to would fabricate the one number the project is judged on.
 */

const SECRET = 'whsec_resolution_test_secret_value';

const { db } = await import('../src/lib/db');
const { customers, paymentFailures, recoveryJourneys, auditLogs } = await import(
  '../src/lib/db/schema'
);
const { POST: webhook } = await import('../src/app/api/webhooks/razorpay/route');
const { setClock, FixedClock, SystemClock } = await import('../src/lib/utils/time');

const NOW = '2026-08-21T14:30:00+05:30';

async function seedJourney(paymentLinkId: string | null): Promise<string> {
  const suffix = crypto.randomUUID();
  const customerId = `cust_res_${suffix}`;
  const failureId = `fail_res_${suffix}`;
  const journeyId = `rj_res_${suffix}`;

  await db.insert(customers).values({
    id: customerId,
    name: 'Resolution Fixture',
    email: `res-${suffix}@example.com`,
    phone: '+919876500444',
    preferredLanguage: 'en',
    segment: 'b2c',
    totalFailures: 1,
    totalRecoveredAmount: 0,
    dndStatus: 'active',
    createdAt: NOW,
    updatedAt: NOW,
  });

  await db.insert(paymentFailures).values({
    id: failureId,
    customerId,
    razorpayPaymentId: `pay_${suffix}`,
    razorpayOrderId: `order_${suffix}`,
    amount: 249900,
    currency: 'INR',
    paymentMethod: 'card',
    failureType: 'one_time',
    errorCode: 'BAD_REQUEST_ERROR',
    errorSource: 'customer',
    errorStep: 'authorization',
    errorReason: 'insufficient_funds',
    errorDescription: 'Resolution fixture.',
    arm: 'C',
    simulationKey: `sim_res_${suffix}`,
    createdAt: NOW,
  });

  await db.insert(recoveryJourneys).values({
    id: journeyId,
    customerId,
    failureId,
    status: 'recovering',
    strategy: 'payment_link',
    arm: 'C',
    amountAtRisk: 249900,
    amountRecovered: 0,
    paymentLinkId,
    maxAttempts: 3,
    currentAttempt: 1,
    currentChannel: 'whatsapp',
    createdAt: NOW,
    updatedAt: NOW,
  });

  return journeyId;
}

/** Signs and delivers a webhook exactly as Razorpay would. */
async function deliver(payload: Record<string, unknown>) {
  const rawBody = JSON.stringify(payload);
  const signature = crypto.createHmac('sha256', SECRET).update(rawBody).digest('hex');

  return webhook(
    new Request('http://localhost/api/webhooks/razorpay', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-razorpay-signature': signature,
        'x-razorpay-event-id': `evt_${crypto.randomUUID()}`,
      },
      body: rawBody,
    }) as never
  );
}

const linkPaidPayload = (opts: {
  linkId: string;
  referenceId?: string;
  paymentId?: string;
  amount?: number;
}) => ({
  entity: 'event',
  account_id: 'acc_test',
  event: 'payment_link.paid',
  contains: ['payment_link', 'payment'],
  payload: {
    payment_link: {
      entity: {
        id: opts.linkId,
        amount: opts.amount ?? 249900,
        currency: 'INR',
        status: 'paid',
        short_url: 'https://rzp.io/i/abc',
        reference_id: opts.referenceId,
      },
    },
    payment: {
      entity: { id: opts.paymentId ?? 'pay_recovered_1', amount: opts.amount ?? 249900 },
    },
  },
  created_at: 1788000000,
});

beforeEach(() => {
  vi.stubEnv('RAZORPAY_WEBHOOK_SECRET', SECRET);
  setClock(new FixedClock(NOW));
});

afterAll(() => {
  vi.unstubAllEnvs();
  setClock(new SystemClock());
});

describe('payment_link.paid resolves the journey it belongs to', () => {
  it('matches on the recovery reference the coordinator stamped', async () => {
    const journeyId = await seedJourney(null);

    const res = await deliver(
      linkPaidPayload({ linkId: 'plink_unknown', referenceId: `recov_${journeyId}_att1` })
    );
    expect(res.status).toBe(200);
    expect((await res.json()).data.resolvedJourneyId).toBe(journeyId);

    const [journey] = await db
      .select()
      .from(recoveryJourneys)
      .where(eq(recoveryJourneys.id, journeyId));
    expect(journey.status).toBe('resolved');
    expect(journey.amountRecovered).toBe(249900);
    expect(journey.recoveryPaymentId).toBe('pay_recovered_1');
  });

  it('falls back to the stored payment link id', async () => {
    const linkId = `plink_${crypto.randomUUID().slice(0, 8)}`;
    const journeyId = await seedJourney(linkId);

    const res = await deliver(linkPaidPayload({ linkId, paymentId: 'pay_recovered_2' }));
    expect((await res.json()).data.resolvedJourneyId).toBe(journeyId);

    const [journey] = await db
      .select()
      .from(recoveryJourneys)
      .where(eq(recoveryJourneys.id, journeyId));
    expect(journey.status).toBe('resolved');
  });

  it('records the attribution it used, so a recovery can be traced back', async () => {
    const journeyId = await seedJourney(null);
    await deliver(linkPaidPayload({ linkId: 'plink_x', referenceId: `recov_${journeyId}_att2` }));

    const logs = await db.select().from(auditLogs).where(eq(auditLogs.journeyId, journeyId));
    const entry = logs.find((l) => l.eventType === 'payment_recovered_via_webhook');
    expect(entry).toBeDefined();
    expect(JSON.parse(entry!.eventData).attribution).toBe('recovery_reference');
  });

  it('refuses to guess when the payment carries no identifier of ours', async () => {
    const journeyId = await seedJourney(null);

    const res = await deliver(linkPaidPayload({ linkId: 'plink_belongs_to_nobody' }));
    expect(res.status).toBe(200); // recorded, not an error
    const body = await res.json();
    expect(body.data.resolvedJourneyId).toBeNull();
    expect(body.data.reason).toBe('no_matching_journey');

    // The open journey is untouched: attributing a stray payment to it would invent a recovery.
    const [journey] = await db
      .select()
      .from(recoveryJourneys)
      .where(eq(recoveryJourneys.id, journeyId));
    expect(journey.status).toBe('recovering');
    expect(journey.amountRecovered).toBe(0);
  });

  it('does not double-count a redelivered payment', async () => {
    const journeyId = await seedJourney(null);
    const payload = linkPaidPayload({
      linkId: 'plink_retry',
      referenceId: `recov_${journeyId}_att1`,
      paymentId: 'pay_retry_1',
    });

    await deliver(payload);
    await deliver(payload); // Razorpay retries on any non-2xx, and events can arrive twice

    const [journey] = await db
      .select()
      .from(recoveryJourneys)
      .where(eq(recoveryJourneys.id, journeyId));
    expect(journey.amountRecovered).toBe(249900);

    const [customer] = await db
      .select()
      .from(customers)
      .where(eq(customers.id, journey.customerId));
    expect(customer.totalRecoveredAmount).toBe(249900);
  });
});

describe('payment.captured', () => {
  it('resolves through the same path when it carries the link', async () => {
    const linkId = `plink_${crypto.randomUUID().slice(0, 8)}`;
    const journeyId = await seedJourney(linkId);

    const res = await deliver({
      entity: 'event',
      account_id: 'acc_test',
      event: 'payment.captured',
      contains: ['payment', 'payment_link'],
      payload: {
        payment_link: { entity: { id: linkId, amount: 249900, currency: 'INR', status: 'paid', short_url: 'x' } },
        payment: { entity: { id: 'pay_captured_1', amount: 249900 } },
      },
      created_at: 1788000000,
    });

    expect((await res.json()).data.resolvedJourneyId).toBe(journeyId);
  });
});
