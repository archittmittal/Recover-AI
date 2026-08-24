import { describe, it, expect, afterAll } from 'vitest';
import crypto from 'crypto';
import fs from 'fs';

// Isolate this suite onto its own on-disk DB file so it never races the
// shared DB used by tests/e2e-smoke.test.ts.
const testDbPath = `./data/test-ra12-${crypto.randomUUID()}.db`;
process.env.DATABASE_URL = `file:${testDbPath}`;

const { db } = await import('../src/lib/db');
const schema = await import('../src/lib/db/schema');
const { eq } = await import('drizzle-orm');
const { generateId } = await import('../src/lib/utils/ids');
const { getClock, setClock, FixedClock, formatIST, SystemClock } = await import('../src/lib/utils/time');
const { recoveryCoordinator } = await import('../src/lib/recovery/coordinator');
const { sendWhatsAppMessage } = await import('../src/lib/communication/whatsapp');
const { sendSmsMessage } = await import('../src/lib/communication/sms');
const { normalizeDispatchResult } = await import('../src/lib/communication/manager');

async function seedJourney(channelHint: 'whatsapp' | 'sms' = 'whatsapp') {
  const nowStr = formatIST(getClock().now());
  const customerId = generateId('cust');
  const failureId = generateId('fail');
  const journeyId = generateId('rj');

  await db.insert(schema.customers).values({
    id: customerId,
    name: 'Kavya Nair',
    email: `ra12-${crypto.randomUUID()}@example.com`,
    phone: '+919800000099',
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
    razorpayPaymentId: 'pay_ra12',
    razorpayOrderId: `order_ra12_${crypto.randomUUID()}`,
    amount: 250000,
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
    strategy: channelHint === 'sms' ? 'smart_retry' : 'payment_link',
    amountAtRisk: 250000,
    amountRecovered: 0,
    maxAttempts: 3,
    currentAttempt: 0,
    createdAt: nowStr,
    updatedAt: nowStr,
  });

  return { customerId, journeyId };
}

describe('communicationManager.dispatch — wired into the coordinator (RA-12)', () => {
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

  it('persists a real deliveryStatus and providerMessageId from the dispatch result, not a literal', async () => {
    setClock(new FixedClock('2026-08-21T14:30:00+05:30'));
    const { journeyId } = await seedJourney();

    await recoveryCoordinator.processRecoveryAttempt(journeyId);

    const [action] = await db
      .select()
      .from(schema.recoveryActions)
      .where(eq(schema.recoveryActions.journeyId, journeyId));

    expect(action).toBeDefined();
    expect(['sent', 'delivered']).toContain(action.deliveryStatus);
    expect(action.providerMessageId).toBeTruthy();
    expect(action.outcome).toBe('pending');
  });

  it('advances currentAttempt when dispatch succeeds', async () => {
    setClock(new FixedClock('2026-08-21T14:30:00+05:30'));
    const { journeyId } = await seedJourney();

    await recoveryCoordinator.processRecoveryAttempt(journeyId);

    const [journey] = await db
      .select()
      .from(schema.recoveryJourneys)
      .where(eq(schema.recoveryJourneys.id, journeyId));
    expect(journey.currentAttempt).toBe(1);
  });
});

describe('Provider stubs report genuine send-time state (RA-12)', () => {
  it('sendWhatsAppMessage never reports "read" at dispatch time', async () => {
    const result = await sendWhatsAppMessage({
      toPhone: '+919800000000',
      customerName: 'Test Customer',
      messageText: 'hello',
      paymentLinkUrl: 'https://rzp.io/i/test',
    });
    expect(result.deliveryStatus).toBe('sent');
  });

  it('sendSmsMessage never reports "delivered" at dispatch time', async () => {
    const result = await sendSmsMessage({
      toPhone: '+919800000000',
      messageText: 'hello',
    });
    expect(result.deliveryStatus).toBe('sent');
  });
});

describe('normalizeDispatchResult (RA-12)', () => {
  it('maps a failed provider status to deliveryStatus "failed" and succeeded=false', () => {
    const normalized = normalizeDispatchResult({
      channel: 'sms',
      messageId: 'sms_msg_x',
      deliveryStatus: 'sent',
      deliveredAt: new Date().toISOString(),
      senderId: 'RCVRAI',
      dltEntityId: '123',
      status: 'failed',
    });
    expect(normalized.deliveryStatus).toBe('failed');
    expect(normalized.succeeded).toBe(false);
  });

  it('maps a completed voice call to deliveryStatus "delivered" using callId as providerMessageId', () => {
    const normalized = normalizeDispatchResult({
      channel: 'voice',
      callId: 'call_x',
      callStatus: 'completed',
      callDurationSeconds: 30,
      transcriptSnippet: '...',
      customerAction: 'promised_to_pay',
      executedAt: new Date().toISOString(),
    });
    expect(normalized.deliveryStatus).toBe('delivered');
    expect(normalized.providerMessageId).toBe('call_x');
    expect(normalized.succeeded).toBe(true);
  });

  it('maps a no_answer voice call to deliveryStatus "failed"', () => {
    const normalized = normalizeDispatchResult({
      channel: 'voice',
      callId: 'call_y',
      callStatus: 'no_answer',
      callDurationSeconds: 0,
      transcriptSnippet: '',
      customerAction: 'hung_up',
      executedAt: new Date().toISOString(),
    });
    expect(normalized.deliveryStatus).toBe('failed');
    expect(normalized.succeeded).toBe(false);
  });
});
