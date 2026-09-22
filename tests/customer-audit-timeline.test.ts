import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import crypto from 'crypto';

/**
 * The customer audit timeline is the artefact Track 3 is graded on — "audit trails and
 * explainability" is not something a screenshot of a dashboard can carry. Two defects made it
 * show less than the system actually records, and both were invisible unless you compared the
 * page against the database.
 *
 * 1. The seeded batch gives every customer one journey per arm. The route took `journeys[0]`
 *    with no ordering, which in practice returned arm A — the no-outreach control, the single
 *    journey guaranteed to have no dispatch, no escalation and no stopping rule. Every customer's
 *    timeline therefore rendered as the emptiest version of itself.
 *
 * 2. `clock_advanced` rows are written with a null journey id on purpose: advancing simulated
 *    time is a process-wide act and does not belong in one customer's history. But the timeline
 *    query filtered on `journeyId = journey.id`, so those rows were recorded and then displayed
 *    nowhere. The audit trail could not evidence that time moved — which is precisely what makes
 *    contact-hours deferral legible rather than an unexplained gap.
 */

const { db } = await import('../src/lib/db');
const { customers, paymentFailures, recoveryJourneys, auditLogs } = await import(
  '../src/lib/db/schema'
);
const { GET } = await import('../src/app/api/customers/[id]/route');

const SEEDED_AT = '2026-09-05T21:09:00+05:30';
const ADVANCED_AT = '2026-09-06T09:00:00+05:30';
const BEFORE_JOURNEY = '2026-09-01T10:00:00+05:30';

let customerId: string;
const journeyIds: Record<string, string> = {};

beforeEach(async () => {
  // Process-wide rows carry no journey id, so they are not scoped to the fixture customer and
  // would otherwise accumulate across cases in this file's shared database.
  await db.delete(auditLogs);

  const suffix = crypto.randomUUID();
  customerId = `cust_timeline_${suffix}`;

  await db.insert(customers).values({
    id: customerId,
    name: 'Timeline Customer',
    email: `timeline-${suffix}@example.com`,
    phone: '+919876500778',
    preferredLanguage: 'en',
    segment: 'b2c',
    totalFailures: 3,
    totalRecoveredAmount: 0,
    dndStatus: 'active',
    createdAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
  });

  for (const arm of ['A', 'B', 'C'] as const) {
    const failureId = `fail_tl_${arm}_${suffix}`;
    await db.insert(paymentFailures).values({
      id: failureId,
      customerId,
      razorpayPaymentId: `pay_tl_${arm}_${suffix}`,
      razorpayOrderId: `order_tl_${arm}_${suffix}`,
      amount: 249900,
      currency: 'INR',
      paymentMethod: 'card',
      failureType: 'one_time',
      errorCode: 'BAD_REQUEST_ERROR',
      errorSource: 'customer',
      errorStep: 'authorization',
      errorReason: 'insufficient_funds',
      errorDescription: 'Timeline fixture.',
      arm,
      simulationKey: `sim_tl_${suffix}`,
      createdAt: SEEDED_AT,
    });

    journeyIds[arm] = `rj_tl_${arm}_${suffix}`;
    await db.insert(recoveryJourneys).values({
      id: journeyIds[arm],
      customerId,
      failureId,
      status: arm === 'A' ? 'detected' : 'recovering',
      strategy: arm === 'A' ? 'no_outreach' : 'payment_link',
      arm,
      amountAtRisk: 249900,
      amountRecovered: 0,
      maxAttempts: arm === 'A' ? 0 : 3,
      currentAttempt: arm === 'A' ? 0 : 1,
      currentChannel: arm === 'A' ? null : 'whatsapp',
      createdAt: SEEDED_AT,
      updatedAt: SEEDED_AT,
    });
  }

  // The agent's arm dispatched; the control did not. Same instant as the clock advance, because
  // the advance is what made that instant current.
  await db.insert(auditLogs).values({
    id: `audit_tl_dispatch_${suffix}`,
    journeyId: journeyIds.C,
    actor: 'agent',
    eventType: 'outreach_dispatched',
    eventData: JSON.stringify({ channel: 'whatsapp' }),
    createdAt: ADVANCED_AT,
  });

  await db.insert(auditLogs).values({
    id: `audit_tl_clock_${suffix}`,
    journeyId: null,
    actor: 'system',
    eventType: 'clock_advanced',
    eventData: JSON.stringify({
      fromIso: SEEDED_AT,
      toIso: ADVANCED_AT,
      advancedMinutes: 711,
      reason: 'demo_clock_advance',
    }),
    createdAt: ADVANCED_AT,
  });

  // A process-wide event from before this journey existed. It is not part of this journey's
  // story and must not be merged in, or the timeline becomes a log of the whole deployment.
  await db.insert(auditLogs).values({
    id: `audit_tl_stale_${suffix}`,
    journeyId: null,
    actor: 'system',
    eventType: 'clock_advanced',
    eventData: JSON.stringify({ fromIso: BEFORE_JOURNEY, toIso: BEFORE_JOURNEY, advancedMinutes: 1 }),
    createdAt: BEFORE_JOURNEY,
  });
});

afterAll(async () => {
  // Leave no fixture rows behind for the arm-comparison suites to trip over.
  await db.delete(auditLogs);
});

const get = (id: string) =>
  GET(new Request(`http://localhost/api/customers/${id}`) as never, {
    params: Promise.resolve({ id }),
  });

const body = async (id: string) => (await get(id)).json();

describe('customer audit timeline', () => {
  it('shows the agent arm, not the no-outreach control', async () => {
    const json = await body(customerId);

    expect(json.success).toBe(true);
    expect(json.data.journey.arm).toBe('C');
    expect(json.data.journey.id).toBe(journeyIds.C);
  });

  it('merges process-wide clock advances into the journey timeline', async () => {
    const json = await body(customerId);
    const clockRows = json.data.auditLogs.filter(
      (l: { eventType: string }) => l.eventType === 'clock_advanced'
    );

    expect(clockRows).toHaveLength(1);
    expect(clockRows[0].journeyId).toBeNull();
    expect(clockRows[0].parsedData.advancedMinutes).toBe(711);
  });

  it('excludes system events from before the journey began', async () => {
    const json = await body(customerId);
    const stale = json.data.auditLogs.filter(
      (l: { createdAt: string }) => l.createdAt === BEFORE_JOURNEY
    );

    expect(stale).toHaveLength(0);
  });

  it('orders a clock advance before the work it unblocked at the same instant', async () => {
    const json = await body(customerId);
    const types = json.data.auditLogs
      .filter((l: { createdAt: string }) => l.createdAt === ADVANCED_AT)
      .map((l: { eventType: string }) => l.eventType);

    expect(types).toEqual(['clock_advanced', 'outreach_dispatched']);
  });
});
