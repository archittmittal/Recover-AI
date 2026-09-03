import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import crypto from 'crypto';
import { eq } from 'drizzle-orm';

/**
 * Arm A answers "what does doing nothing cost?" — it is the control the whole three-arm
 * comparison rests on, and nothing in it may ever recover.
 *
 * The simulator's Pay button selected a journey with an unqualified `limit(1)` on customer id.
 * Since the seeded batch gives every customer one journey per arm, that picked arm A in
 * practice. Observed on the deployment: a single click resolved `rj_KYyKnpXrdUk33Cgx`, put
 * ₹6,173 into the no-agent arm, and made the dashboard report a control that recovered money —
 * incoherent in front of anyone reading carefully, and invisible unless someone went looking.
 */

const { db } = await import('../src/lib/db');
const { customers, paymentFailures, recoveryJourneys } = await import('../src/lib/db/schema');
const { POST: pay } = await import('../src/app/api/simulator/pay/route');
const { setClock, FixedClock, SystemClock } = await import('../src/lib/utils/time');

const NOW = '2026-08-21T14:30:00+05:30';
let customerId: string;
const journeyIds: Record<string, string> = {};

beforeEach(async () => {
  setClock(new FixedClock(NOW));

  const suffix = crypto.randomUUID();
  customerId = `cust_arms_${suffix}`;

  await db.insert(customers).values({
    id: customerId,
    name: 'Three Arm Customer',
    email: `arms-${suffix}@example.com`,
    phone: '+919876500777',
    preferredLanguage: 'en',
    segment: 'b2c',
    totalFailures: 3,
    totalRecoveredAmount: 0,
    dndStatus: 'active',
    createdAt: NOW,
    updatedAt: NOW,
  });

  // One failure and one journey per arm, exactly as the seeded batch produces.
  for (const arm of ['A', 'B', 'C'] as const) {
    const failureId = `fail_${arm}_${suffix}`;
    await db.insert(paymentFailures).values({
      id: failureId,
      customerId,
      razorpayPaymentId: `pay_${arm}_${suffix}`,
      razorpayOrderId: `order_${arm}_${suffix}`,
      amount: 249900,
      currency: 'INR',
      paymentMethod: 'card',
      failureType: 'one_time',
      errorCode: 'BAD_REQUEST_ERROR',
      errorSource: 'customer',
      errorStep: 'authorization',
      errorReason: 'insufficient_funds',
      errorDescription: 'Arm fixture.',
      arm,
      simulationKey: `sim_${suffix}`,
      createdAt: NOW,
    });

    journeyIds[arm] = `rj_${arm}_${suffix}`;
    await db.insert(recoveryJourneys).values({
      id: journeyIds[arm],
      customerId,
      failureId,
      status: arm === 'A' ? 'detected' : 'recovering',
      strategy: arm === 'A' ? 'no_outreach' : 'payment_link',
      arm,
      amountAtRisk: 249900,
      amountRecovered: 0,
      maxAttempts: arm === 'A' ? 0 : 3,
      currentAttempt: arm === 'A' ? 0 : 1,
      currentChannel: arm === 'A' ? null : 'whatsapp',
      createdAt: NOW,
      updatedAt: NOW,
    });
  }
});

afterAll(() => setClock(new SystemClock()));

const post = (body: unknown) =>
  pay(
    new Request('http://localhost/api/simulator/pay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }) as never
  );

describe('simulator Pay button and the control arm', () => {
  it('picks the agent arm when given only a customer', async () => {
    const res = await post({ customerId });
    expect(res.status).toBe(200);

    const [armA] = await db
      .select()
      .from(recoveryJourneys)
      .where(eq(recoveryJourneys.id, journeyIds.A));
    expect(armA.status).toBe('detected');
    expect(armA.amountRecovered).toBe(0);

    const [armC] = await db
      .select()
      .from(recoveryJourneys)
      .where(eq(recoveryJourneys.id, journeyIds.C));
    expect(armC.status).toBe('resolved');
  });

  it('refuses an explicit request to pay a control journey', async () => {
    const res = await post({ journeyId: journeyIds.A });

    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe('CONTROL_ARM');

    const [armA] = await db
      .select()
      .from(recoveryJourneys)
      .where(eq(recoveryJourneys.id, journeyIds.A));
    expect(armA.amountRecovered).toBe(0);
  });

  it('still pays a named arm B journey — only the control is off limits', async () => {
    const res = await post({ journeyId: journeyIds.B });
    expect(res.status).toBe(200);

    const [armB] = await db
      .select()
      .from(recoveryJourneys)
      .where(eq(recoveryJourneys.id, journeyIds.B));
    expect(armB.status).toBe('resolved');
  });
});
