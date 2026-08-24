import { describe, it, expect, afterAll } from 'vitest';
import crypto from 'crypto';
import fs from 'fs';
import { eq } from 'drizzle-orm';

/**
 * RA-07: retryIntervalsHours is specified per strategy but the scheduler was
 * always called with offset 0, and nothing gated a repeated call on whether
 * the next attempt was actually due — so a caller invoking
 * processRecoveryAttempt in a tight loop (e.g. a sweep run every minute)
 * could exhaust a journey's entire attempt ladder in seconds instead of
 * across the days the strategy configures.
 *
 * Isolated onto its own SQLite file for the same reason as the RA-04/RA-06
 * tests: it's a third file writing through the real DB singleton, which
 * would otherwise race e2e-smoke's seedDatabase() truncation.
 */
const testDbPath = `./data/test-ra07-${crypto.randomUUID()}.db`;
process.env.DATABASE_URL = `file:${testDbPath}`;

const { db } = await import('../src/lib/db');
const { customers, paymentFailures, recoveryJourneys, recoveryActions } = await import('../src/lib/db/schema');
const { recoveryCoordinator } = await import('../src/lib/recovery/coordinator');
const { setClock, FixedClock, SystemClock } = await import('../src/lib/utils/time');
const { STRATEGY_CONFIGS } = await import('../src/lib/recovery/strategies');

const DAYTIME_START = '2026-08-21T08:30:00+05:30';

async function seedJourney(strategy: string) {
  const suffix = crypto.randomUUID();
  const customerId = `cust_ra07_${suffix}`;
  const failureId = `fail_ra07_${suffix}`;
  const journeyId = `rj_ra07_${suffix}`;
  const now = DAYTIME_START;

  await db.insert(customers).values({
    id: customerId,
    name: 'Retry Backoff Test',
    email: `ra07-${suffix}@example.com`,
    phone: '+919876500003',
    preferredLanguage: 'en',
    segment: 'b2c',
    totalFailures: 1,
    totalRecoveredAmount: 0,
    dndStatus: 'active',
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(paymentFailures).values({
    id: failureId,
    customerId,
    razorpayPaymentId: `pay_${suffix}`,
    razorpayOrderId: `order_${suffix}`,
    amount: 49900,
    currency: 'INR',
    paymentMethod: 'card',
    failureType: 'one_time',
    errorCode: 'BAD_REQUEST_ERROR',
    errorSource: 'customer',
    errorStep: 'authorization',
    errorReason: 'insufficient_funds',
    errorDescription: 'Insufficient funds.',
    createdAt: now,
  });

  await db.insert(recoveryJourneys).values({
    id: journeyId,
    customerId,
    failureId,
    status: 'recovering',
    strategy,
    amountAtRisk: 49900,
    amountRecovered: 0,
    maxAttempts: STRATEGY_CONFIGS[strategy as keyof typeof STRATEGY_CONFIGS].maxAttempts,
    currentAttempt: 0,
    currentChannel: null,
    createdAt: now,
    updatedAt: now,
  });

  return journeyId;
}

describe('processRecoveryAttempt — retry backoff enforcement', () => {
  afterAll(() => {
    setClock(new SystemClock());
    for (const suffix of ['', '-wal', '-shm']) {
      try {
        fs.unlinkSync(testDbPath + suffix);
      } catch {
        // nothing to clean up
      }
    }
  });

  it('does not dispatch a second attempt immediately after the first (payment_link: 1h backoff)', async () => {
    const journeyId = await seedJourney('payment_link');
    setClock(new FixedClock(DAYTIME_START));

    await recoveryCoordinator.processRecoveryAttempt(journeyId);
    // Three consecutive calls with no clock advance — matches a sweep fired repeatedly.
    await recoveryCoordinator.processRecoveryAttempt(journeyId);
    await recoveryCoordinator.processRecoveryAttempt(journeyId);

    const actions = await db.select().from(recoveryActions).where(eq(recoveryActions.journeyId, journeyId));
    expect(actions).toHaveLength(1);
    expect(actions[0].attemptNumber).toBe(1);

    const [journey] = await db.select().from(recoveryJourneys).where(eq(recoveryJourneys.id, journeyId));
    expect(journey.currentAttempt).toBe(1);
  });

  it('dispatches the second attempt once the configured backoff has elapsed', async () => {
    const journeyId = await seedJourney('payment_link');
    setClock(new FixedClock(DAYTIME_START));

    await recoveryCoordinator.processRecoveryAttempt(journeyId); // attempt 1

    // payment_link's retryIntervalsHours[0] === 1 (hour). Advance just past it.
    setClock(new FixedClock(new Date(Date.parse(DAYTIME_START) + 61 * 60 * 1000)));
    await recoveryCoordinator.processRecoveryAttempt(journeyId); // attempt 2

    const actions = await db.select().from(recoveryActions).where(eq(recoveryActions.journeyId, journeyId));
    expect(actions).toHaveLength(2);

    const [journey] = await db.select().from(recoveryJourneys).where(eq(recoveryJourneys.id, journeyId));
    expect(journey.currentAttempt).toBe(2);
  });

  it('does not throw for merchant_alert, whose retryIntervalsHours is empty', async () => {
    const journeyId = await seedJourney('merchant_alert');
    setClock(new FixedClock(DAYTIME_START));

    await expect(recoveryCoordinator.processRecoveryAttempt(journeyId)).resolves.not.toThrow();

    const [journey] = await db.select().from(recoveryJourneys).where(eq(recoveryJourneys.id, journeyId));
    // merchant_alert has maxAttempts: 1, so a single attempt exhausts it.
    expect(journey.status).toBe('exhausted');
  });
});
