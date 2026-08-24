import { describe, it, expect, afterAll } from 'vitest';
import crypto from 'crypto';
import fs from 'fs';
import { buildJsonRequest } from './helpers/request';

/**
 * RA-18 baseline probes.
 *
 * These three tests exercise real route handlers / coordinator methods
 * directly, the way `tests/webhooks-idempotency.test.ts` used to NOT do
 * (it asserted against a re-implementation defined inside the test file
 * itself, so it would have passed unchanged even if the real route did
 * nothing).
 *
 * They intentionally mirror three specific findings from this audit
 * (RA-01, RA-06, RA-09) and are expected to FAIL on `main` alone, proving
 * the harness actually catches real defects. They turn green once the
 * corresponding fix branches (RA-01's webhook fail-closed check, RA-06's
 * contact-hours enforcement, RA-09's resolution idempotency guard) merge.
 * See the RA-18 PR description for the exact branches/PRs this depends on.
 */

// Isolate this suite onto its own on-disk DB file so it never races the
// shared DB used by tests/e2e-smoke.test.ts.
const testDbPath = `./data/test-ra18-baseline-${crypto.randomUUID()}.db`;
process.env.DATABASE_URL = `file:${testDbPath}`;

const { db } = await import('../src/lib/db');
const schema = await import('../src/lib/db/schema');
const { eq } = await import('drizzle-orm');
const { generateId } = await import('../src/lib/utils/ids');
const { getClock, setClock, FixedClock, formatIST, SystemClock } = await import('../src/lib/utils/time');
const { recoveryCoordinator } = await import('../src/lib/recovery/coordinator');
const { POST } = await import('../src/app/api/webhooks/razorpay/route');

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

describe('RA-01 baseline: unsigned webhook requests must be rejected', () => {
  it('rejects a webhook POST with no signature header (4xx)', async () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = 'a-real-test-secret';
    const payload = {
      entity: 'event',
      event: 'payment.failed',
      id: `evt_ra01_baseline_${crypto.randomUUID()}`,
      payload: { payment: { entity: { id: 'pay_x', amount: 49900, order_id: 'order_x' } } },
    };

    const res = await POST(buildJsonRequest('http://localhost/api/webhooks/razorpay', payload));
    expect(res.status).toBe(400);
  });
});

describe('RA-06 baseline: recovery attempts must not dispatch outside contact hours', () => {
  it('dispatches zero recovery_actions when run at 03:00 IST — xfail until RA-06 merges', async () => {
    setClock(new FixedClock('2026-08-21T03:00:00+05:30'));
    const nowStr = formatIST(getClock().now());

    const customerId = generateId('cust');
    const failureId = generateId('fail');
    const journeyId = generateId('rj');

    await db.insert(schema.customers).values({
      id: customerId,
      name: 'Baseline Customer',
      email: `ra06-baseline-${crypto.randomUUID()}@example.com`,
      phone: '+919800000001',
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
      razorpayPaymentId: 'pay_ra06_baseline',
      razorpayOrderId: 'order_ra06_baseline',
      amount: 100000,
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
      amountAtRisk: 100000,
      amountRecovered: 0,
      maxAttempts: 3,
      currentAttempt: 0,
      createdAt: nowStr,
      updatedAt: nowStr,
    });

    await recoveryCoordinator.processRecoveryAttempt(journeyId);

    const actions = await db
      .select()
      .from(schema.recoveryActions)
      .where(eq(schema.recoveryActions.journeyId, journeyId));
    expect(actions.length).toBe(0);
  });
});

describe('RA-09 baseline: resolving a journey twice must not double-count revenue', () => {
  it('leaves totalRecoveredAmount unchanged on the second resolveJourneyWithPayment call — xfail until RA-09 merges', async () => {
    setClock(new FixedClock('2026-08-21T14:30:00+05:30'));
    const nowStr = formatIST(getClock().now());

    const customerId = generateId('cust');
    const failureId = generateId('fail');
    const journeyId = generateId('rj');

    await db.insert(schema.customers).values({
      id: customerId,
      name: 'Baseline Customer 2',
      email: `ra09-baseline-${crypto.randomUUID()}@example.com`,
      phone: '+919800000002',
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
      razorpayPaymentId: 'pay_ra09_baseline',
      razorpayOrderId: 'order_ra09_baseline',
      amount: 400000,
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
      amountAtRisk: 400000,
      amountRecovered: 0,
      maxAttempts: 3,
      currentAttempt: 1,
      createdAt: nowStr,
      updatedAt: nowStr,
    });

    await recoveryCoordinator.resolveJourneyWithPayment(journeyId, 'pay_ra09_baseline_resolved', 400000);
    await recoveryCoordinator.resolveJourneyWithPayment(journeyId, 'pay_ra09_baseline_resolved', 400000);

    const [customer] = await db.select().from(schema.customers).where(eq(schema.customers.id, customerId));
    expect(customer.totalRecoveredAmount).toBe(400000);
  });
});
