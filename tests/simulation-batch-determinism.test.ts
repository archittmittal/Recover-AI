import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import { eq } from 'drizzle-orm';

/**
 * RA-23 acceptance criterion: running a batch twice with the same seed produces identical
 * recovery outcomes.
 *
 * The interesting half of that is what "identical" is allowed to mean. Journey and action ids
 * are nanoids, so a re-seeded batch never reproduces them; if the draws were keyed to those
 * ids, or taken from one shared RNG stream in row order, the second run would diverge and the
 * reproducibility claim would be false in exactly the case the README relies on. This file
 * builds the same fixtures twice under fresh random ids and asserts the recovered set matches
 * by failure — the natural key that survives a re-seed.
 */

const { db } = await import('../src/lib/db');
const { customers, paymentFailures, recoveryJourneys, recoveryActions, auditLogs } = await import(
  '../src/lib/db/schema'
);
const { runSimulatedOutcomes } = await import('../src/lib/simulation/outcomes');
const { getSimulationSeed, DEFAULT_SIMULATION_SEED } = await import('../src/lib/config');
const { setClock, FixedClock } = await import('../src/lib/utils/time');
const { recoveryCoordinator } = await import('../src/lib/recovery/coordinator');

const NOW = '2026-08-21T14:30:00+05:30';
const FIXTURE_COUNT = 24;

/**
 * Builds a batch of dispatched-but-unanswered outreach with stable failure ids and fresh
 * random journey/action ids, exactly as a re-seed followed by a batch run would leave it.
 */
async function buildBatch(): Promise<void> {
  await db.delete(auditLogs);
  await db.delete(recoveryActions);
  await db.delete(recoveryJourneys);
  await db.delete(paymentFailures);
  await db.delete(customers);

  const reasons = [
    'insufficient_funds',
    'card_expired',
    'card_declined',
    'authentication_failed',
    'payment_cancelled',
    'gateway_technical_error',
    'mandate_inactive',
    'bank_account_invalid',
  ];
  const channels = ['whatsapp', 'sms', 'voice'] as const;

  for (let i = 0; i < FIXTURE_COUNT; i++) {
    // Stable across runs — this is what the draw is keyed to.
    const failureId = `fail_${String(i + 1).padStart(16, '0')}`;
    const customerId = `cust_${String(i + 1).padStart(16, '0')}`;
    // Fresh every run — this is what must NOT affect the draw.
    const journeyId = `rj_${crypto.randomUUID()}`;
    const actionId = `ra_${crypto.randomUUID()}`;

    await db.insert(customers).values({
      id: customerId,
      name: `Determinism Case ${i}`,
      email: `ra23-${i}-${crypto.randomUUID()}@example.com`,
      phone: `+91987650${String(1000 + i).slice(1)}`,
      preferredLanguage: 'en',
      segment: i % 5 === 0 ? 'b2b' : 'b2c',
      totalFailures: 1,
      totalRecoveredAmount: 0,
      dndStatus: 'active',
      createdAt: NOW,
      updatedAt: NOW,
    });

    await db.insert(paymentFailures).values({
      id: failureId,
      customerId,
      razorpayPaymentId: `pay_${i}`,
      razorpayOrderId: `order_${i}`,
      amount: 49900 + i * 100,
      currency: 'INR',
      paymentMethod: 'card',
      failureType: 'one_time',
      errorCode: 'BAD_REQUEST_ERROR',
      errorSource: 'customer',
      errorStep: 'authorization',
      errorReason: reasons[i % reasons.length],
      errorDescription: 'Fixture failure for RA-23 determinism.',
      createdAt: NOW,
    });

    await db.insert(recoveryJourneys).values({
      id: journeyId,
      customerId,
      failureId,
      status: 'recovering',
      strategy: 'payment_link',
      amountAtRisk: 49900 + i * 100,
      amountRecovered: 0,
      maxAttempts: 3,
      currentAttempt: 1,
      currentChannel: channels[i % channels.length],
      createdAt: NOW,
      updatedAt: NOW,
    });

    await db.insert(recoveryActions).values({
      id: actionId,
      journeyId,
      attemptNumber: (i % 3) + 1,
      channel: channels[i % channels.length],
      actionType: 'payment_link',
      messageContent: 'Fixture outreach.',
      llmReasoning: null,
      deliveryStatus: 'delivered',
      customerResponse: null,
      isTemplateFallback: i % 2 === 0,
      outcome: 'pending',
      scheduledAt: NOW,
      executedAt: NOW,
      createdAt: NOW,
    });
  }
}

/** The recovered set, expressed in terms that survive a re-seed. */
async function runAndSummarise(seed: number): Promise<string[]> {
  const recoveries = await runSimulatedOutcomes(seed);
  return recoveries.map((r) => `${r.paymentId}:${r.amountRecovered}`).sort();
}

describe('RA-23 batch reproducibility', () => {
  beforeEach(async () => {
    setClock(new FixedClock(NOW));
    await buildBatch();
  });

  it('produces identical recoveries across two runs of the same seed', async () => {
    const first = await runAndSummarise(DEFAULT_SIMULATION_SEED);
    await buildBatch();
    const second = await runAndSummarise(DEFAULT_SIMULATION_SEED);

    expect(second).toEqual(first);
    // A run that recovers nothing would satisfy equality trivially and prove nothing.
    expect(first.length).toBeGreaterThan(0);
    expect(first.length).toBeLessThan(FIXTURE_COUNT);
  });

  it('produces a different batch under a different seed', async () => {
    const first = await runAndSummarise(DEFAULT_SIMULATION_SEED);
    await buildBatch();
    const other = await runAndSummarise(DEFAULT_SIMULATION_SEED + 1);

    expect(other).not.toEqual(first);
  });

  it('records every draw in the audit trail, including the ones that did not convert', async () => {
    const recoveries = await runSimulatedOutcomes(DEFAULT_SIMULATION_SEED);

    const drawn = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.eventType, 'simulated_response_drawn'));

    expect(drawn.length).toBe(FIXTURE_COUNT);
    expect(drawn.filter((row) => JSON.parse(row.eventData).paid === true).length).toBe(
      recoveries.length
    );

    const sample = JSON.parse(drawn[0].eventData);
    expect(sample.modelVersion).toBeDefined();
    expect(sample.simulationSeed).toBe(DEFAULT_SIMULATION_SEED);
    // The breakdown is recorded so an outcome can be recomputed by hand from the doc.
    expect(sample.baseRate).toBeGreaterThan(0);
    expect(sample.probability).toBeGreaterThan(0);
  });

  it('marks non-converting outreach as ignored instead of leaving it pending forever', async () => {
    const recoveries = await runSimulatedOutcomes(DEFAULT_SIMULATION_SEED);

    const stillPending = await db
      .select()
      .from(recoveryActions)
      .where(eq(recoveryActions.outcome, 'pending'));

    // Only the converting attempts are still open here: this module never resolves a journey,
    // so their 'payment_completed' outcome is written by the coordinator when the caller
    // applies the recovery. Everything the model turned down is closed as 'ignored' — before
    // this change every outreach stayed 'pending' forever, since nothing ever answered.
    expect(stillPending.map((a) => a.id).sort()).toEqual(
      recoveries.map((r) => r.actionId).sort()
    );
    expect(stillPending.length).toBeLessThan(FIXTURE_COUNT);
  });

  it('defaults the seed independently of the fixture seed', () => {
    expect(getSimulationSeed()).toBe(DEFAULT_SIMULATION_SEED);
    // 12345 is src/lib/db/seed.ts's fixture seed; sharing it would let an edit to the synthetic
    // data move every recovery outcome.
    expect(DEFAULT_SIMULATION_SEED).not.toBe(12345);
  });
});

describe('RA-23 conversion attribution', () => {
  /**
   * A journey can have more than one outreach outstanding — the abandonment sweep dispatches
   * attempt 1, and a later batch run dispatches attempt 2 before any outcome has been drawn for
   * the first. When the model then converts the earlier attempt, crediting the newest one
   * attributes the recovery to the wrong channel and leaves the converting attempt 'pending'
   * forever.
   */
  it('credits the attempt that converted, not merely the newest one', async () => {
    setClock(new FixedClock(NOW));
    await buildBatch();

    const [journey] = await db.select().from(recoveryJourneys).limit(1);
    const [firstAction] = await db
      .select()
      .from(recoveryActions)
      .where(eq(recoveryActions.journeyId, journey.id));

    const laterActionId = `ra_${crypto.randomUUID()}`;
    await db.insert(recoveryActions).values({
      id: laterActionId,
      journeyId: journey.id,
      attemptNumber: firstAction.attemptNumber + 1,
      channel: 'sms',
      actionType: 'payment_link',
      messageContent: 'Second outreach, still unanswered.',
      deliveryStatus: 'delivered',
      customerResponse: null,
      isTemplateFallback: true,
      outcome: 'pending',
      scheduledAt: NOW,
      executedAt: NOW,
      createdAt: NOW,
    });

    await recoveryCoordinator.resolveJourneyWithPayment(
      journey.id,
      'pay_sim_attribution',
      journey.amountAtRisk,
      firstAction.id
    );

    const actions = await db
      .select()
      .from(recoveryActions)
      .where(eq(recoveryActions.journeyId, journey.id));

    const byId = Object.fromEntries(actions.map((a) => [a.id, a.outcome]));
    expect(byId[firstAction.id]).toBe('payment_completed');
    expect(byId[laterActionId]).toBe('pending');
  });

  it('still falls back to the newest attempt when the caller cannot name one', async () => {
    // A Razorpay webhook or a simulator click knows only that the customer paid after being
    // contacted, so the newest attempt remains the right default there.
    setClock(new FixedClock(NOW));
    await buildBatch();

    const [journey] = await db.select().from(recoveryJourneys).limit(1);
    const [existing] = await db
      .select()
      .from(recoveryActions)
      .where(eq(recoveryActions.journeyId, journey.id));

    const newestId = `ra_${crypto.randomUUID()}`;
    await db.insert(recoveryActions).values({
      id: newestId,
      journeyId: journey.id,
      attemptNumber: existing.attemptNumber + 1,
      channel: 'sms',
      actionType: 'payment_link',
      messageContent: 'Newest outreach.',
      deliveryStatus: 'delivered',
      customerResponse: null,
      isTemplateFallback: true,
      outcome: 'pending',
      scheduledAt: NOW,
      executedAt: NOW,
      createdAt: NOW,
    });

    await recoveryCoordinator.resolveJourneyWithPayment(
      journey.id,
      'pay_sim_fallback',
      journey.amountAtRisk
    );

    const [newest] = await db
      .select()
      .from(recoveryActions)
      .where(eq(recoveryActions.id, newestId));
    expect(newest.outcome).toBe('payment_completed');
  });
});
