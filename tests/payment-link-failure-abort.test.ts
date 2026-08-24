import { describe, it, expect, afterAll, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import fs from 'fs';

// Isolate this suite onto its own on-disk DB file so it never races the
// shared DB used by tests/e2e-smoke.test.ts.
const testDbPath = `./data/test-ra14-${crypto.randomUUID()}.db`;
process.env.DATABASE_URL = `file:${testDbPath}`;

const { db } = await import('../src/lib/db');
const schema = await import('../src/lib/db/schema');
const { eq } = await import('drizzle-orm');
const { generateId } = await import('../src/lib/utils/ids');
const { getClock, setClock, FixedClock, formatIST, SystemClock } = await import('../src/lib/utils/time');
const { recoveryCoordinator } = await import('../src/lib/recovery/coordinator');
const { razorpayClient } = await import('../src/lib/razorpay/client');

async function seedJourney() {
  const nowStr = formatIST(getClock().now());
  const customerId = generateId('cust');
  const failureId = generateId('fail');
  const journeyId = generateId('rj');

  await db.insert(schema.customers).values({
    id: customerId,
    name: 'Arjun Mehta',
    email: `ra14-${crypto.randomUUID()}@example.com`,
    phone: '+919800000077',
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
    razorpayPaymentId: 'pay_ra14',
    razorpayOrderId: `order_ra14_${crypto.randomUUID()}`,
    amount: 150000,
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

  await db.insert(schema.recoveryJourneys).values({
    id: journeyId,
    customerId,
    failureId,
    status: 'recovering',
    strategy: 'payment_link',
    amountAtRisk: 150000,
    amountRecovered: 0,
    maxAttempts: 3,
    currentAttempt: 0,
    createdAt: nowStr,
    updatedAt: nowStr,
  });

  return { customerId, journeyId };
}

describe('processRecoveryAttempt — aborts on payment-link failure instead of faking a URL (RA-14)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  it('inserts no recovery_actions row and leaves currentAttempt unchanged when createPaymentLink throws', async () => {
    setClock(new FixedClock('2026-08-21T14:30:00+05:30'));
    const { journeyId } = await seedJourney();

    vi.spyOn(razorpayClient, 'createPaymentLink').mockRejectedValueOnce(
      new Error('Razorpay createPaymentLink failed (500): gateway timeout')
    );

    await recoveryCoordinator.processRecoveryAttempt(journeyId);

    const actions = await db
      .select()
      .from(schema.recoveryActions)
      .where(eq(schema.recoveryActions.journeyId, journeyId));
    expect(actions.length).toBe(0);

    const [journey] = await db
      .select()
      .from(schema.recoveryJourneys)
      .where(eq(schema.recoveryJourneys.id, journeyId));
    expect(journey.currentAttempt).toBe(0);
    expect(journey.status).toBe('recovering');
  });

  it('writes an attempt_aborted audit entry when createPaymentLink throws', async () => {
    setClock(new FixedClock('2026-08-21T14:30:00+05:30'));
    const { journeyId } = await seedJourney();

    vi.spyOn(razorpayClient, 'createPaymentLink').mockRejectedValueOnce(new Error('network error'));

    await recoveryCoordinator.processRecoveryAttempt(journeyId);

    const logs = await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.journeyId, journeyId));
    const aborted = logs.filter((l) => l.eventType === 'attempt_aborted');
    expect(aborted.length).toBe(1);
    const eventData = JSON.parse(aborted[0].eventData);
    expect(eventData.reason).toBe('payment_link_unavailable');
  });

  it('the next sweep succeeds and dispatches once the payment-link API recovers', async () => {
    setClock(new FixedClock('2026-08-21T14:30:00+05:30'));
    const { journeyId } = await seedJourney();

    vi.spyOn(razorpayClient, 'createPaymentLink').mockRejectedValueOnce(new Error('transient failure'));
    await recoveryCoordinator.processRecoveryAttempt(journeyId);

    let actions = await db.select().from(schema.recoveryActions).where(eq(schema.recoveryActions.journeyId, journeyId));
    expect(actions.length).toBe(0);

    // Next sweep, API is healthy again (no mock override this time).
    await recoveryCoordinator.processRecoveryAttempt(journeyId);

    actions = await db.select().from(schema.recoveryActions).where(eq(schema.recoveryActions.journeyId, journeyId));
    expect(actions.length).toBe(1);
    expect(actions[0].attemptNumber).toBe(1);

    const [journey] = await db.select().from(schema.recoveryJourneys).where(eq(schema.recoveryJourneys.id, journeyId));
    expect(journey.currentAttempt).toBe(1);
  });
});
