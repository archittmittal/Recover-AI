import { describe, it, expect, afterAll } from 'vitest';
import crypto from 'crypto';
import fs from 'fs';
import { eq } from 'drizzle-orm';

/**
 * RA-06: the 8AM-7PM IST contact window is correctly implemented
 * (isWithinContactHours, tests/contact-hours.test.ts) but was hardcoded off
 * at the one call site that actually dispatches outreach
 * (processRecoveryAttempt passed checkContactHours: false). These tests
 * exercise the coordinator itself, not just the underlying time helper, so a
 * regression here can't hide behind a passing unit test on isWithinContactHours.
 *
 * Isolated onto its own SQLite file for the same reason as
 * webhook-idempotency-header.test.ts: it's a second file writing through the
 * real DB singleton, which would otherwise race e2e-smoke's seedDatabase().
 */
const testDbPath = `./data/test-ra06-${crypto.randomUUID()}.db`;
process.env.DATABASE_URL = `file:${testDbPath}`;

const { db } = await import('../src/lib/db');
const { customers, paymentFailures, recoveryJourneys, recoveryActions, auditLogs } = await import(
  '../src/lib/db/schema'
);
const { recoveryCoordinator } = await import('../src/lib/recovery/coordinator');
const { setClock, FixedClock, SystemClock } = await import('../src/lib/utils/time');

async function seedJourney() {
  const suffix = crypto.randomUUID();
  const customerId = `cust_ra06_${suffix}`;
  const failureId = `fail_ra06_${suffix}`;
  const journeyId = `rj_ra06_${suffix}`;
  const now = '2026-08-21T14:30:00+05:30';

  await db.insert(customers).values({
    id: customerId,
    name: 'Contact Hours Test',
    email: `ra06-${suffix}@example.com`,
    phone: '+919876500002',
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
    strategy: 'payment_link',
    amountAtRisk: 49900,
    amountRecovered: 0,
    maxAttempts: 3,
    currentAttempt: 0,
    currentChannel: null,
    createdAt: now,
    updatedAt: now,
  });

  return journeyId;
}

describe('processRecoveryAttempt — contact hours enforcement', () => {
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

  it('dispatches no outreach and defers the journey when invoked at 03:00 IST', async () => {
    const journeyId = await seedJourney();

    setClock(new FixedClock('2026-08-21T03:00:00+05:30'));
    await recoveryCoordinator.processRecoveryAttempt(journeyId);

    const actions = await db.select().from(recoveryActions).where(eq(recoveryActions.journeyId, journeyId));
    expect(actions).toHaveLength(0);

    const [journey] = await db.select().from(recoveryJourneys).where(eq(recoveryJourneys.id, journeyId));
    expect(journey.currentAttempt).toBe(0);
    expect(journey.status).toBe('recovering');

    const logs = await db.select().from(auditLogs).where(eq(auditLogs.journeyId, journeyId));
    const deferred = logs.find((l) => l.eventType === 'stopping_rule_triggered');
    expect(deferred).toBeDefined();
    expect(JSON.parse(deferred!.eventData).rule).toBe('outside_contact_hours');
  });

  it('dispatches outreach when invoked at 14:30 IST', async () => {
    const journeyId = await seedJourney();

    setClock(new FixedClock('2026-08-21T14:30:00+05:30'));
    await recoveryCoordinator.processRecoveryAttempt(journeyId);

    const actions = await db.select().from(recoveryActions).where(eq(recoveryActions.journeyId, journeyId));
    expect(actions).toHaveLength(1);

    const [journey] = await db.select().from(recoveryJourneys).where(eq(recoveryJourneys.id, journeyId));
    expect(journey.currentAttempt).toBe(1);
  });
});
