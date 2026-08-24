import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'crypto';
import fs from 'fs';

// Isolate this suite onto its own on-disk DB file so it never races the
// shared DB used by tests/e2e-smoke.test.ts (which truncates all tables in
// its own beforeAll under Vitest's parallel-by-default file execution).
const dbFile = `./data/test-ra09-${crypto.randomUUID()}.db`;
process.env.DATABASE_URL = `file:${dbFile}`;

let db: typeof import('../src/lib/db')['db'];
let schema: typeof import('../src/lib/db/schema');
let recoveryCoordinator: typeof import('../src/lib/recovery/coordinator')['recoveryCoordinator'];
let generateId: typeof import('../src/lib/utils/ids')['generateId'];
let getClock: typeof import('../src/lib/utils/time')['getClock'];
let setClock: typeof import('../src/lib/utils/time')['setClock'];
let FixedClock: typeof import('../src/lib/utils/time')['FixedClock'];
let formatIST: typeof import('../src/lib/utils/time')['formatIST'];
let eq: typeof import('drizzle-orm')['eq'];

async function seedJourney(amountAtRisk: number) {
  const nowStr = formatIST(getClock().now());
  const customerId = generateId('cust');
  const failureId = generateId('fail');
  const journeyId = generateId('rj');
  const actionId = generateId('ra');

  await db.insert(schema.customers).values({
    id: customerId,
    name: 'Priya Desai',
    email: `priya-${customerId}@example.com`,
    phone: '+919800000000',
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
    razorpayPaymentId: 'pay_fail_1',
    razorpayOrderId: 'order_1',
    amount: amountAtRisk,
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
    amountAtRisk,
    amountRecovered: 0,
    maxAttempts: 3,
    currentAttempt: 1,
    currentChannel: 'whatsapp',
    createdAt: nowStr,
    updatedAt: nowStr,
  });

  await db.insert(schema.recoveryActions).values({
    id: actionId,
    journeyId,
    attemptNumber: 1,
    channel: 'whatsapp',
    actionType: 'payment_link',
    messageContent: 'Please complete your payment.',
    deliveryStatus: 'sent',
    customerResponse: null,
    outcome: 'pending',
    scheduledAt: nowStr,
    executedAt: nowStr,
    createdAt: nowStr,
  });

  return { customerId, journeyId, actionId };
}

describe('resolveJourneyWithPayment — resolution idempotency & channel attribution (RA-09 / RA-13)', () => {
  beforeAll(async () => {
    ({ db } = await import('../src/lib/db'));
    schema = await import('../src/lib/db/schema');
    ({ recoveryCoordinator } = await import('../src/lib/recovery/coordinator'));
    ({ generateId } = await import('../src/lib/utils/ids'));
    ({ getClock, setClock, FixedClock, formatIST } = await import('../src/lib/utils/time'));
    ({ eq } = await import('drizzle-orm'));
    setClock(new FixedClock('2026-08-21T14:30:00+05:30'));
  });

  afterAll(() => {
    for (const suffix of ['', '-wal', '-shm']) {
      try {
        fs.unlinkSync(`${dbFile}${suffix}`);
      } catch {
        // file may not exist
      }
    }
  });

  it('does not double-count the customer lifetime total when called twice', async () => {
    const { customerId, journeyId } = await seedJourney(500000);

    await recoveryCoordinator.resolveJourneyWithPayment(journeyId, 'pay_resolved_1', 500000);
    await recoveryCoordinator.resolveJourneyWithPayment(journeyId, 'pay_resolved_1', 500000);

    const [customer] = await db.select().from(schema.customers).where(eq(schema.customers.id, customerId));
    expect(customer.totalRecoveredAmount).toBe(500000);

    const [journey] = await db.select().from(schema.recoveryJourneys).where(eq(schema.recoveryJourneys.id, journeyId));
    expect(journey.amountRecovered).toBe(500000);
  });

  it('writes exactly one payment_recovered audit entry across two calls', async () => {
    const { journeyId } = await seedJourney(300000);

    await recoveryCoordinator.resolveJourneyWithPayment(journeyId, 'pay_resolved_2', 300000);
    await recoveryCoordinator.resolveJourneyWithPayment(journeyId, 'pay_resolved_2', 300000);

    const logs = await db
      .select()
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.journeyId, journeyId));
    const recoveredLogs = logs.filter((l) => l.eventType === 'payment_recovered');
    expect(recoveredLogs.length).toBe(1);
  });

  it('sets outcome payment_completed on the most recent action, lighting up channel attribution', async () => {
    const { journeyId, actionId } = await seedJourney(200000);

    await recoveryCoordinator.resolveJourneyWithPayment(journeyId, 'pay_resolved_3', 200000);

    const [action] = await db.select().from(schema.recoveryActions).where(eq(schema.recoveryActions.id, actionId));
    expect(action.outcome).toBe('payment_completed');
  });

  it('keeps totalRecoveredAmount equal to the sum of that customer journeys amountRecovered', async () => {
    const nowStr = formatIST(getClock().now());
    const customerId = generateId('cust');

    await db.insert(schema.customers).values({
      id: customerId,
      name: 'Rohan Iyer',
      email: 'rohan@example.com',
      phone: '+919811111111',
      preferredLanguage: 'en',
      segment: 'b2c',
      totalFailures: 2,
      totalRecoveredAmount: 0,
      dndStatus: 'active',
      createdAt: nowStr,
      updatedAt: nowStr,
    });

    async function seedJourneyForCustomer(amount: number) {
      const failureId = generateId('fail');
      const journeyId = generateId('rj');
      await db.insert(schema.paymentFailures).values({
        id: failureId,
        customerId,
        razorpayPaymentId: 'pay_fail_x',
        razorpayOrderId: 'order_x',
        amount,
        currency: 'INR',
        paymentMethod: 'upi',
        failureType: 'one_time',
        errorCode: 'GATEWAY_ERROR',
        errorSource: 'gateway',
        errorStep: 'authorization',
        errorReason: 'timeout',
        errorDescription: 'Gateway timeout',
        createdAt: nowStr,
      });
      await db.insert(schema.recoveryJourneys).values({
        id: journeyId,
        customerId,
        failureId,
        status: 'recovering',
        strategy: 'payment_link',
        amountAtRisk: amount,
        amountRecovered: 0,
        maxAttempts: 3,
        currentAttempt: 1,
        createdAt: nowStr,
        updatedAt: nowStr,
      });
      return journeyId;
    }

    const journeyA = await seedJourneyForCustomer(100000);
    const journeyB = await seedJourneyForCustomer(250000);

    await recoveryCoordinator.resolveJourneyWithPayment(journeyA, 'pay_a', 100000);
    await recoveryCoordinator.resolveJourneyWithPayment(journeyB, 'pay_b', 250000);

    const [customer] = await db.select().from(schema.customers).where(eq(schema.customers.id, customerId));
    const journeys = await db.select().from(schema.recoveryJourneys).where(eq(schema.recoveryJourneys.customerId, customerId));
    const expectedTotal = journeys.reduce((sum, j) => sum + j.amountRecovered, 0);

    expect(customer.totalRecoveredAmount).toBe(expectedTotal);
    expect(customer.totalRecoveredAmount).toBe(350000);
  });
});
