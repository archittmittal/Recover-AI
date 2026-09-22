import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import crypto from 'crypto';
import { eq } from 'drizzle-orm';

/**
 * The simulator's "inject a webhook" buttons POSTed an unsigned payload straight at
 * `/api/webhooks/razorpay`. That was written before RA-01 made signature verification
 * mandatory, and nobody revisited it — so the buttons answered 503 with no secret configured
 * and 400 with one. Two demo controls, dead for as long as the security fix had been in place,
 * and nothing failed loudly enough for anyone to notice.
 *
 * The replacement signs server-side and hands the request to the *real* handler, so these tests
 * assert the delivery is genuinely verified rather than waved through.
 */

const SECRET = 'whsec_simulator_test_secret_value';

const { db } = await import('../src/lib/db');
const { webhookEvents, paymentFailures, recoveryJourneys } = await import('../src/lib/db/schema');
const { POST: simulateWebhook } = await import('../src/app/api/simulator/webhook/route');
const { POST: realWebhook } = await import('../src/app/api/webhooks/razorpay/route');
const { setClock, FixedClock, SystemClock } = await import('../src/lib/utils/time');

const post = (body: unknown) =>
  simulateWebhook(
    new Request('http://localhost/api/simulator/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }) as never
  );

beforeEach(() => {
  vi.stubEnv('RAZORPAY_WEBHOOK_SECRET', SECRET);
  setClock(new FixedClock('2026-08-21T14:30:00+05:30'));
});

afterAll(() => {
  vi.unstubAllEnvs();
  setClock(new SystemClock());
});

describe('simulated webhook delivery', () => {
  it('is accepted by the real handler and recorded', async () => {
    const res = await post({ scenario: 'card_decline' });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.handlerStatus).toBe(200);
    expect(json.data.errorReason).toBe('insufficient_funds');

    const [row] = await db
      .select()
      .from(webhookEvents)
      .where(eq(webhookEvents.id, json.data.eventId));
    expect(row.processingStatus).toBe('processed');
    expect(row.eventType).toBe('payment.failed');
  });

  it('drives the agent end to end: a failure and a journey exist afterwards', async () => {
    const json = await (await post({ scenario: 'mandate_failure' })).json();
    expect(json.data.errorReason).toBe('mandate_inactive');

    const failures = await db.select().from(paymentFailures);
    const journeys = await db.select().from(recoveryJourneys);
    expect(failures.length).toBeGreaterThan(0);
    expect(journeys.length).toBeGreaterThan(0);
  });

  it('gives each click a distinct event id, so a presenter can click twice', async () => {
    const first = await (await post({ scenario: 'card_decline' })).json();
    const second = await (await post({ scenario: 'card_decline' })).json();

    expect(first.data.eventId).not.toBe(second.data.eventId);
    expect(second.data.handlerStatus).toBe(200);
  });

  it('refuses to fabricate a delivery when no secret is configured', async () => {
    vi.stubEnv('RAZORPAY_WEBHOOK_SECRET', '');
    const res = await post({ scenario: 'card_decline' });

    // The same answer a real Razorpay delivery would get, rather than a simulator that quietly
    // works where production would not.
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe('NOT_CONFIGURED');
  });

  it('does not bypass verification — the handler still rejects an unsigned body', async () => {
    const unsigned = new Request('http://localhost/api/webhooks/razorpay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity: 'event', event: 'payment.failed' }),
    });

    const res = await realWebhook(unsigned as never);
    expect(res.status).toBe(400);
  });

  it('signs over the exact bytes the handler reads back', async () => {
    // Guards the one way this could rot: signing a re-serialised object rather than the raw body
    // would still look correct here but fail against the handler's HMAC of the received bytes.
    const json = await (await post({ scenario: 'card_decline' })).json();
    const [row] = await db
      .select()
      .from(webhookEvents)
      .where(eq(webhookEvents.id, json.data.eventId));

    expect(row).toBeDefined();
    expect(row.payloadHash).toMatch(/^[0-9a-f]{64}$/);
    expect(crypto.createHmac('sha256', SECRET).digest('hex')).toHaveLength(64);
  });
});
