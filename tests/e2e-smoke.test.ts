import { describe, it, expect, beforeAll } from 'vitest';
import { seedDatabase } from '../src/lib/db/seed';
import { db } from '../src/lib/db';
import {
  customers,
  paymentFailures,
  recoveryJourneys,
  recoveryActions,
  auditLogs,
} from '../src/lib/db/schema';
import { eq, asc } from 'drizzle-orm';
import { recoveryCoordinator } from '../src/lib/recovery/coordinator';
import { runCheckoutAbandonmentSweep } from '../src/lib/recovery/abandonment-sweep';
import { setClock, FixedClock } from '../src/lib/utils/time';

describe('RecoverAI End-to-End Autonomous Workflow Smoke Suite', () => {
  beforeAll(async () => {
    // Set clock to daytime IST (14:30 IST) to satisfy contact hours
    setClock(new FixedClock('2026-08-21T14:30:00+05:30'));
    await seedDatabase();
  });

  /**
   * The seeded batch is materialised into three experiment arms (RA-22), and only Arm C runs
   * the full agent. These tests are about the agent's behaviour, so they draw from Arm C
   * explicitly — picking the first row in the table would land in Arm A, which by design never
   * dispatches anything.
   */
  const armCFailures = (limit: number) =>
    db.select().from(paymentFailures).where(eq(paymentFailures.arm, 'C')).limit(limit);

  it('1. Seeds 50+ failure records across cards, UPI, subscriptions, and invoices', async () => {
    const custCount = await db.select().from(customers);
    const failCount = await db.select().from(paymentFailures);

    expect(custCount.length).toBeGreaterThanOrEqual(50);
    expect(failCount.length).toBeGreaterThanOrEqual(50);
  });

  it('2. Initiates recovery journey and escalates outreach across channels', async () => {
    const failureList = await armCFailures(1);
    const failure = failureList[0];

    // startRecoveryJourney initiates the journey and automatically executes Attempt 1
    const journeyId = await recoveryCoordinator.startRecoveryJourney(failure.id);
    expect(journeyId).toBeDefined();

    let journeys = await db
      .select()
      .from(recoveryJourneys)
      .where(eq(recoveryJourneys.id, journeyId));
    expect(journeys[0].currentAttempt).toBe(1);
    expect(journeys[0].status).toBe('recovering');

    // Attempt 2 is gated behind the strategy's configured retry backoff
    // (retryIntervalsHours) — advance the clock well past the longest
    // interval any strategy declares (72h) before the next attempt is due.
    setClock(new FixedClock(new Date(Date.parse('2026-08-21T14:30:00+05:30') + 73 * 60 * 60 * 1000)));

    // Executing next attempt advances to Attempt 2 (SMS Escalation)
    await recoveryCoordinator.processRecoveryAttempt(journeyId);

    journeys = await db
      .select()
      .from(recoveryJourneys)
      .where(eq(recoveryJourneys.id, journeyId));
    expect(journeys[0].currentAttempt).toBe(2);

    // Verify 2 distinct actions recorded with deterministic ordering
    const actions = await db
      .select()
      .from(recoveryActions)
      .where(eq(recoveryActions.journeyId, journeyId))
      .orderBy(asc(recoveryActions.attemptNumber));

    expect(actions.length).toBe(2);
    expect(actions[0].attemptNumber).toBe(1);
    expect(actions[1].attemptNumber).toBe(2);

    // Restore the shared clock so later tests in this file see the original
    // daytime timestamp rather than the 73h jump made above.
    setClock(new FixedClock('2026-08-21T14:30:00+05:30'));
  });

  it('3. Resolves journey when customer completes payment via link', async () => {
    const failureList = await armCFailures(2);
    const failure = failureList[1];

    const journeyId = await recoveryCoordinator.startRecoveryJourney(failure.id);

    // Simulate payment settlement
    await recoveryCoordinator.resolveJourneyWithPayment(
      journeyId,
      'pay_smoke_test_123',
      failure.amount
    );

    // Verify DB update
    const updatedJourney = await db
      .select()
      .from(recoveryJourneys)
      .where(eq(recoveryJourneys.id, journeyId));
    expect(updatedJourney[0].status).toBe('resolved');
    expect(updatedJourney[0].amountRecovered).toBe(failure.amount);
  });

  it('4. Halts all future outreach when customer replies "STOP" (Stopping Rule #2)', async () => {
    const failureList = await armCFailures(3);
    const failure = failureList[2];

    const journeyId = await recoveryCoordinator.startRecoveryJourney(failure.id);

    // Customer sends STOP
    await recoveryCoordinator.handleCustomerResponse(
      journeyId,
      'STOP please unsubscribe me'
    );

    // Verify journey status set to opted_out
    const updatedJourney = await db
      .select()
      .from(recoveryJourneys)
      .where(eq(recoveryJourneys.id, journeyId));
    expect(updatedJourney[0].status).toBe('opted_out');

    // Verify customer marked as DND opted_out
    const updatedCustomer = await db
      .select()
      .from(customers)
      .where(eq(customers.id, updatedJourney[0].customerId));
    expect(updatedCustomer[0].dndStatus).toBe('opted_out');
  });

  it('5. Executes checkout abandonment sweep without duplicates (Idempotent)', async () => {
    // First sweep run initiates eligible abandonments
    const firstSweep = await runCheckoutAbandonmentSweep(0); // 0 threshold for smoke test evaluation
    expect(firstSweep).toBeDefined();
    expect(typeof firstSweep.sweptCount).toBe('number');
    expect(typeof firstSweep.initiatedCount).toBe('number');

    // Second sweep run must be idempotent and initiate 0 new journeys
    const secondSweep = await runCheckoutAbandonmentSweep(0);
    expect(secondSweep.initiatedCount).toBe(0);
    expect(secondSweep.journeyIds.length).toBe(0);
  });

  it('6. Enforces immutable audit logging across all state machine transitions', async () => {
    const logs = await db.select().from(auditLogs);
    expect(logs.length).toBeGreaterThan(0);

    for (const log of logs) {
      expect(log.id).toMatch(/^audit_/);
      expect(log.journeyId).toBeDefined();
      expect(log.actor).toBeDefined();
      expect(log.eventType).toBeDefined();
      expect(log.eventData).toBeDefined();

      // Verify eventData is valid JSON
      const parsed = JSON.parse(log.eventData);
      expect(typeof parsed).toBe('object');
    }
  });
});
