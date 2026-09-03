import { describe, it, expect, beforeAll, vi } from 'vitest';
import fs from 'fs';
import crypto from 'crypto';
import { eq, sql } from 'drizzle-orm';

/**
 * RA-22 — the three-arm comparison used to be two literals and one measurement:
 *
 *   const baselineArmARate = 0;
 *   const baselineArmBRate = 31.5;   // no run, no source, no derivation
 *
 * These tests hold the line the issue draws: every rate the API reports has to come from rows
 * in that arm's own cohort, and Arm B has to be genuinely rules-only — not the full agent with
 * its LLM output quietly discarded, which would look identical on the dashboard and would make
 * the C − B delta meaningless.
 */

vi.mock('../src/lib/ai/classifier', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/ai/classifier')>();
  return { ...actual, classifyFailureWithLLM: vi.fn(actual.classifyFailureWithLLM) };
});

vi.mock('../src/lib/ai/messenger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/ai/messenger')>();
  return { ...actual, generateRecoveryMessage: vi.fn(actual.generateRecoveryMessage) };
});

const { db } = await import('../src/lib/db');
const { customers, paymentFailures, recoveryJourneys, recoveryActions } = await import(
  '../src/lib/db/schema'
);
const { seedDatabase, EXPERIMENT_ARMS } = await import('../src/lib/db/seed');
const { recoveryCoordinator } = await import('../src/lib/recovery/coordinator');
const { setClock, FixedClock } = await import('../src/lib/utils/time');
const { classifyFailureWithLLM } = await import('../src/lib/ai/classifier');
const { generateRecoveryMessage } = await import('../src/lib/ai/messenger');
const { POST: triggerRecovery } = await import('../src/app/api/recovery/trigger/route');
const { GET: getMetrics } = await import('../src/app/api/metrics/route');

const DAYTIME = '2026-08-21T14:30:00+05:30';

/** A single failure in one arm, so an arm's behaviour can be observed in isolation. */
async function seedArmFailure(arm: 'A' | 'B' | 'C') {
  const suffix = crypto.randomUUID();
  const customerId = `cust_arm_${suffix}`;
  const failureId = `fail_arm_${suffix}`;

  await db.insert(customers).values({
    id: customerId,
    name: 'Arm Fixture',
    email: `arm-${suffix}@example.com`,
    phone: '+919876500123',
    preferredLanguage: 'en',
    segment: 'b2c',
    totalFailures: 1,
    totalRecoveredAmount: 0,
    dndStatus: 'active',
    createdAt: DAYTIME,
    updatedAt: DAYTIME,
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
    errorDescription: 'Arm fixture failure.',
    arm,
    simulationKey: `sim_arm_${suffix}`,
    createdAt: DAYTIME,
  });

  return { failureId, customerId };
}

describe('RA-22 arm behaviour', () => {
  beforeAll(() => {
    setClock(new FixedClock(DAYTIME));
  });

  it('Arm A detects and records without ever dispatching', async () => {
    const { failureId } = await seedArmFailure('A');
    const journeyId = await recoveryCoordinator.startRecoveryJourney(failureId);

    const [journey] = await db
      .select()
      .from(recoveryJourneys)
      .where(eq(recoveryJourneys.id, journeyId));

    expect(journey.arm).toBe('A');
    expect(journey.strategy).toBe('no_outreach');
    expect(journey.status).toBe('detected');
    expect(journey.currentAttempt).toBe(0);

    // Even a direct call cannot make the control dispatch.
    await recoveryCoordinator.processRecoveryAttempt(journeyId);

    const actions = await db
      .select()
      .from(recoveryActions)
      .where(eq(recoveryActions.journeyId, journeyId));
    expect(actions).toHaveLength(0);
  });

  it('Arm B reaches no LLM call at all', async () => {
    vi.mocked(classifyFailureWithLLM).mockClear();
    vi.mocked(generateRecoveryMessage).mockClear();

    const { failureId } = await seedArmFailure('B');
    const journeyId = await recoveryCoordinator.startRecoveryJourney(failureId);

    // The acceptance criterion, stated directly: if either of these is ever reached on an Arm B
    // journey, the baseline is not a baseline and the C − B delta measures nothing.
    expect(classifyFailureWithLLM).not.toHaveBeenCalled();
    expect(generateRecoveryMessage).not.toHaveBeenCalled();

    const [journey] = await db
      .select()
      .from(recoveryJourneys)
      .where(eq(recoveryJourneys.id, journeyId));
    expect(journey.strategy).toBe('rules_only');

    const [action] = await db
      .select()
      .from(recoveryActions)
      .where(eq(recoveryActions.journeyId, journeyId));
    expect(action.isTemplateFallback).toBe(true);
    expect(action.channel).toBe('whatsapp');
    expect(action.messageContent).toContain('₹2,499');
  });

  it('Arm B holds one channel and one cadence across every attempt', async () => {
    const { failureId } = await seedArmFailure('B');
    const journeyId = await recoveryCoordinator.startRecoveryJourney(failureId);

    // rules_only declares a flat 24h cadence; advance past each interval in turn.
    for (let attempt = 2; attempt <= 3; attempt++) {
      setClock(new FixedClock(new Date(Date.parse(DAYTIME) + (attempt - 1) * 25 * 60 * 60 * 1000)));
      await recoveryCoordinator.processRecoveryAttempt(journeyId);
    }
    setClock(new FixedClock(DAYTIME));

    const actions = await db
      .select()
      .from(recoveryActions)
      .where(eq(recoveryActions.journeyId, journeyId));

    expect(actions.length).toBeGreaterThan(1);
    // No escalation ladder: the whole point of the baseline is that it does the same thing
    // every time, whatever the failure and whatever happened last time.
    expect(new Set(actions.map((a) => a.channel))).toEqual(new Set(['whatsapp']));
    expect(actions.every((a) => a.isTemplateFallback)).toBe(true);
  });

  it('Arm C runs the full agent', async () => {
    vi.mocked(classifyFailureWithLLM).mockClear();

    const { failureId } = await seedArmFailure('C');
    const journeyId = await recoveryCoordinator.startRecoveryJourney(failureId);

    expect(classifyFailureWithLLM).toHaveBeenCalledTimes(1);

    const [journey] = await db
      .select()
      .from(recoveryJourneys)
      .where(eq(recoveryJourneys.id, journeyId));
    expect(journey.arm).toBe('C');
    expect(journey.strategy).not.toBe('rules_only');
    expect(journey.currentAttempt).toBe(1);
  });
});

describe('RA-22 measured baseline comparison', () => {
  beforeAll(async () => {
    setClock(new FixedClock(DAYTIME));
    await seedDatabase();
    await triggerRecovery();
  });

  it('seeds the same failure mix into all three cohorts', async () => {
    const perArm = await db
      .select({
        arm: paymentFailures.arm,
        count: sql<number>`COUNT(*)`,
        atRisk: sql<number>`SUM(${paymentFailures.amount})`,
        reasons: sql<string>`GROUP_CONCAT(${paymentFailures.errorReason})`,
      })
      .from(paymentFailures)
      .groupBy(paymentFailures.arm);

    expect(perArm.map((a) => a.arm).sort()).toEqual([...EXPERIMENT_ARMS]);
    // Identical by construction, not approximately: same count, same rupees, same causes.
    expect(new Set(perArm.map((a) => a.count)).size).toBe(1);
    expect(new Set(perArm.map((a) => a.atRisk)).size).toBe(1);
    expect(new Set(perArm.map((a) => a.reasons)).size).toBe(1);
  });

  it('derives every arm rate from that arm own journeys', async () => {
    const res = await getMetrics();
    const json = await res.json();
    const { arms, netLiftPct, isMeasurable } = json.data.baselineComparison;

    expect(isMeasurable).toBe(true);

    for (const reported of arms) {
      const [actual] = await db
        .select({
          journeyCount: sql<number>`COUNT(*)`,
          atRisk: sql<number>`COALESCE(SUM(${recoveryJourneys.amountAtRisk}), 0)`,
          recovered: sql<number>`COALESCE(SUM(${recoveryJourneys.amountRecovered}), 0)`,
        })
        .from(recoveryJourneys)
        .where(eq(recoveryJourneys.arm, reported.arm));

      expect(reported.journeyCount).toBe(actual.journeyCount);
      expect(reported.journeyCount).toBeGreaterThan(0);
      expect(reported.atRiskPaise).toBe(actual.atRisk);
      expect(reported.recoveredPaise).toBe(actual.recovered);
      expect(reported.recoveryRatePct).toBeCloseTo(
        Number(((actual.recovered / actual.atRisk) * 100).toFixed(1)),
        5
      );
    }

    const armB = arms.find((a: { arm: string }) => a.arm === 'B');
    const armC = arms.find((a: { arm: string }) => a.arm === 'C');
    expect(netLiftPct).toBeCloseTo(
      Number((armC.recoveryRatePct - armB.recoveryRatePct).toFixed(1)),
      5
    );
  });

  /**
   * A failure ingested from a live webhook is stamped arm 'C' — the agent should treat it
   * normally and the dashboard should count it — but it has no counterpart in arms A and B. Left
   * in the comparison it destroys the property the arms exist for: identical data. Seen on the
   * deployment, where seven injected webhooks had grown arm C to 57 against 50 apiece.
   */
  it('excludes webhook-ingested failures from the comparison', async () => {
    const before = await getMetrics().then((r) => r.json());
    const armCBefore = before.data.baselineComparison.arms.find((a: { arm: string }) => a.arm === 'C');

    // An ingested failure looks exactly like a seeded one except that it carries no
    // simulation_key — nothing generated it against the declared response model.
    const suffix = crypto.randomUUID();
    await db.insert(customers).values({
      id: `cust_ingested_${suffix}`,
      name: 'Ingested Customer',
      email: `ingested-${suffix}@example.com`,
      phone: '+919876500555',
      preferredLanguage: 'en',
      segment: 'b2c',
      totalFailures: 1,
      totalRecoveredAmount: 0,
      dndStatus: 'active',
      createdAt: DAYTIME,
      updatedAt: DAYTIME,
    });
    await db.insert(paymentFailures).values({
      id: `fail_ingested_${suffix}`,
      customerId: `cust_ingested_${suffix}`,
      razorpayPaymentId: `pay_${suffix}`,
      razorpayOrderId: `order_${suffix}`,
      amount: 999900,
      currency: 'INR',
      paymentMethod: 'card',
      failureType: 'one_time',
      errorCode: 'BAD_REQUEST_ERROR',
      errorSource: 'customer',
      errorStep: 'authorization',
      errorReason: 'insufficient_funds',
      errorDescription: 'Arrived by webhook, not by seed.',
      arm: 'C',
      simulationKey: '',
      createdAt: DAYTIME,
    });
    await db.insert(recoveryJourneys).values({
      id: `rj_ingested_${suffix}`,
      customerId: `cust_ingested_${suffix}`,
      failureId: `fail_ingested_${suffix}`,
      status: 'recovering',
      strategy: 'payment_link',
      arm: 'C',
      amountAtRisk: 999900,
      amountRecovered: 0,
      maxAttempts: 3,
      currentAttempt: 1,
      currentChannel: 'whatsapp',
      createdAt: DAYTIME,
      updatedAt: DAYTIME,
    });

    const after = await getMetrics().then((r) => r.json());
    const armCAfter = after.data.baselineComparison.arms.find((a: { arm: string }) => a.arm === 'C');

    expect(armCAfter.journeyCount).toBe(armCBefore.journeyCount);
    expect(armCAfter.atRiskPaise).toBe(armCBefore.atRiskPaise);

    // Still the same size as the arms it is compared against — the whole point.
    const armB = after.data.baselineComparison.arms.find((a: { arm: string }) => a.arm === 'B');
    expect(armCAfter.journeyCount).toBe(armB.journeyCount);
  });

  it('reports Arm A as zero because it recovered nothing, not because a zero was typed', async () => {
    const res = await getMetrics();
    const json = await res.json();
    const armA = json.data.baselineComparison.arms.find((a: { arm: string }) => a.arm === 'A');

    expect(armA.journeyCount).toBeGreaterThan(0);
    expect(armA.recoveredPaise).toBe(0);
    expect(armA.recoveryRatePct).toBe(0);

    const armAActions = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(recoveryActions)
      .innerJoin(recoveryJourneys, eq(recoveryActions.journeyId, recoveryJourneys.id))
      .where(eq(recoveryJourneys.arm, 'A'));
    expect(armAActions[0].count).toBe(0);
  });

  it('leaves no numeric literal standing in for a measured rate', () => {
    const source = fs.readFileSync('src/app/api/metrics/route.ts', 'utf8');
    // The three constants this issue is about, and the fabricated "realistic default" average
    // that sat beside them.
    expect(source).not.toMatch(/=\s*31\.5\b/);
    expect(source).not.toMatch(/baselineArm[AB]Rate/);
    expect(source).not.toMatch(/:\s*18;\s*\/\/ realistic default/);
  });
});
