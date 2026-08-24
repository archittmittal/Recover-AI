import { describe, it, expect, afterAll } from 'vitest';
import crypto from 'crypto';
import fs from 'fs';

// Isolate this suite onto its own on-disk DB file so it never races the
// shared DB used by tests/e2e-smoke.test.ts.
const testDbPath = `./data/test-ra17-audit-${crypto.randomUUID()}.db`;
process.env.DATABASE_URL = `file:${testDbPath}`;

const { db } = await import('../src/lib/db');
const schema = await import('../src/lib/db/schema');
const { eq } = await import('drizzle-orm');
const { generateId } = await import('../src/lib/utils/ids');
const { getClock, formatIST } = await import('../src/lib/utils/time');
const { writeAuditLog } = await import('../src/lib/utils/audit');

describe('writeAuditLog masks phone/email in eventData before persisting (RA-17)', () => {
  afterAll(() => {
    for (const suffix of ['', '-wal', '-shm']) {
      try {
        fs.unlinkSync(testDbPath + suffix);
      } catch {
        // file may not exist
      }
    }
  });

  it('stores masked phone/email values, not raw ones', async () => {
    const nowStr = formatIST(getClock().now());
    const customerId = generateId('cust');
    const failureId = generateId('fail');
    const journeyId = generateId('rj');

    await db.insert(schema.customers).values({
      id: customerId,
      name: 'Test Customer',
      email: 'audit-mask@example.com',
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
      razorpayPaymentId: 'pay_x',
      razorpayOrderId: 'order_x',
      amount: 10000,
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
      amountAtRisk: 10000,
      amountRecovered: 0,
      maxAttempts: 3,
      currentAttempt: 0,
      createdAt: nowStr,
      updatedAt: nowStr,
    });

    const logId = await writeAuditLog({
      journeyId,
      actor: 'system',
      eventType: 'test_pii_event',
      eventData: { phone: '+919800000000', email: 'audit-mask@example.com', reason: 'test' },
    });

    const [log] = await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.id, logId));
    const stored = JSON.parse(log.eventData);

    expect(stored.phone).toBe('+91******0000');
    expect(stored.email).toBe('a***@example.com');
    expect(stored.reason).toBe('test');
  });
});
