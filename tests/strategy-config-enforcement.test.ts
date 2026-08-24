import { describe, it, expect, afterAll } from 'vitest';
import crypto from 'crypto';
import fs from 'fs';

// Isolate this suite onto its own on-disk DB file so it never races the
// shared DB used by tests/e2e-smoke.test.ts.
const testDbPath = `./data/test-ra15-${crypto.randomUUID()}.db`;
process.env.DATABASE_URL = `file:${testDbPath}`;

const { db } = await import('../src/lib/db');
const schema = await import('../src/lib/db/schema');
const { eq } = await import('drizzle-orm');
const { generateId } = await import('../src/lib/utils/ids');
const { getClock, setClock, FixedClock, formatIST, SystemClock } = await import('../src/lib/utils/time');
const { recoveryCoordinator } = await import('../src/lib/recovery/coordinator');
const { STRATEGY_CONFIGS } = await import('../src/lib/recovery/strategies');

async function seedJourney(strategy: keyof typeof STRATEGY_CONFIGS) {
  const nowStr = formatIST(getClock().now());
  const customerId = generateId('cust');
  const failureId = generateId('fail');
  const journeyId = generateId('rj');

  await db.insert(schema.customers).values({
    id: customerId,
    name: 'Sanya Kapoor',
    email: `ra15-${crypto.randomUUID()}@example.com`,
    phone: '+919800000055',
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
    razorpayPaymentId: 'pay_ra15',
    razorpayOrderId: `order_ra15_${crypto.randomUUID()}`,
    amount: 500000,
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

  // Seed the journey with the strategy's configured maxAttempts directly
  // (mirrors what startRecoveryJourney now does at creation time), so
  // processRecoveryAttempt is exercised against the real per-strategy cap.
  await db.insert(schema.recoveryJourneys).values({
    id: journeyId,
    customerId,
    failureId,
    status: 'recovering',
    strategy,
    amountAtRisk: 500000,
    amountRecovered: 0,
    maxAttempts: STRATEGY_CONFIGS[strategy].maxAttempts,
    currentAttempt: 0,
    createdAt: nowStr,
    updatedAt: nowStr,
  });

  return { journeyId };
}

describe('recovery_journeys.max_attempts matches the strategy config (RA-15)', () => {
  afterAll(() => {
    setClock(new SystemClock());
    for (const suffix of ['', '-wal', '-shm']) {
      try {
        fs.unlinkSync(testDbPath + suffix);
      } catch {
        // file may not exist
      }
    }
  });

  it('a merchant_alert journey sends exactly one message and then exhausts', async () => {
    setClock(new FixedClock('2026-08-21T14:30:00+05:30'));
    const { journeyId } = await seedJourney('merchant_alert');

    await recoveryCoordinator.processRecoveryAttempt(journeyId);
    await recoveryCoordinator.processRecoveryAttempt(journeyId);
    await recoveryCoordinator.processRecoveryAttempt(journeyId);

    const actions = await db.select().from(schema.recoveryActions).where(eq(schema.recoveryActions.journeyId, journeyId));
    expect(actions.length).toBe(1);

    const [journey] = await db.select().from(schema.recoveryJourneys).where(eq(schema.recoveryJourneys.id, journeyId));
    expect(journey.status).toBe('exhausted');
    expect(journey.maxAttempts).toBe(1);
  });

  for (const strategy of ['payment_link', 'conversational', 'smart_retry', 'invoice_reminder'] as const) {
    it(`a ${strategy} journey is seeded with maxAttempts=${STRATEGY_CONFIGS[strategy].maxAttempts}`, async () => {
      const { journeyId } = await seedJourney(strategy);
      const [journey] = await db.select().from(schema.recoveryJourneys).where(eq(schema.recoveryJourneys.id, journeyId));
      expect(journey.maxAttempts).toBe(STRATEGY_CONFIGS[strategy].maxAttempts);
    });
  }
});

describe('Applied discount never exceeds the strategy ceiling (RA-15)', () => {
  afterAll(() => {
    setClock(new SystemClock());
  });

  it('a conversational strategy (allowDiscount, cap 10%) applies exactly maxDiscountPercentage on attempt 2', async () => {
    setClock(new FixedClock('2026-08-21T14:30:00+05:30'));
    const { journeyId } = await seedJourney('conversational');

    await recoveryCoordinator.processRecoveryAttempt(journeyId); // attempt 1, no discount
    await recoveryCoordinator.processRecoveryAttempt(journeyId); // attempt 2, discount applies

    const logs = await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.journeyId, journeyId));
    const dispatched = logs.filter((l) => l.eventType === 'outreach_dispatched');
    expect(dispatched.length).toBe(2);

    const secondAttempt = dispatched.find((l) => JSON.parse(l.eventData).attemptNumber === 2);
    const eventData = JSON.parse(secondAttempt!.eventData);
    expect(eventData.appliedDiscountPercentage).toBe(STRATEGY_CONFIGS.conversational.maxDiscountPercentage);
    expect(eventData.appliedDiscountPercentage).toBeLessThanOrEqual(eventData.maxDiscountPercentage);
    expect(eventData.maxDiscountPercentage).toBe(10);
  });

  it('a payment_link strategy (allowDiscount: false) never applies a discount', async () => {
    setClock(new FixedClock('2026-08-21T14:30:00+05:30'));
    const { journeyId } = await seedJourney('payment_link');

    await recoveryCoordinator.processRecoveryAttempt(journeyId);
    await recoveryCoordinator.processRecoveryAttempt(journeyId);

    const logs = await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.journeyId, journeyId));
    const dispatched = logs.filter((l) => l.eventType === 'outreach_dispatched');
    for (const log of dispatched) {
      const eventData = JSON.parse(log.eventData);
      expect(eventData.appliedDiscountPercentage).toBe(0);
    }
  });
});
