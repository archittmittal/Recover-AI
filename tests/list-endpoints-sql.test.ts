import { describe, it, expect, afterAll } from 'vitest';
import crypto from 'crypto';
import fs from 'fs';
import { NextRequest } from 'next/server';

// Isolate this suite onto its own on-disk DB file so it never races the
// shared DB used by tests/e2e-smoke.test.ts.
const testDbPath = `./data/test-ra19-${crypto.randomUUID()}.db`;
process.env.DATABASE_URL = `file:${testDbPath}`;

const { db } = await import('../src/lib/db');
const schema = await import('../src/lib/db/schema');
const { generateId } = await import('../src/lib/utils/ids');
const { getClock, formatIST } = await import('../src/lib/utils/time');
const { GET: getCustomers } = await import('../src/app/api/customers/route');
const { GET: getMetrics } = await import('../src/app/api/metrics/route');

async function seedCustomerWithFailure(overrides: {
  withJourney: boolean;
  status?: string;
  strategy?: string;
  channel?: string;
  amount?: number;
  amountRecovered?: number;
  name?: string;
}) {
  const nowStr = formatIST(getClock().now());
  const customerId = generateId('cust');
  const failureId = generateId('fail');
  const amount = overrides.amount ?? 100000;

  await db.insert(schema.customers).values({
    id: customerId,
    name: overrides.name ?? 'List Endpoint Customer',
    email: `ra19-${crypto.randomUUID()}@example.com`,
    phone: '+919800000088',
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
    razorpayPaymentId: 'pay_ra19',
    razorpayOrderId: `order_${crypto.randomUUID()}`,
    amount,
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

  let journeyId: string | null = null;
  if (overrides.withJourney) {
    journeyId = generateId('rj');
    await db.insert(schema.recoveryJourneys).values({
      id: journeyId,
      customerId,
      failureId,
      status: overrides.status ?? 'recovering',
      strategy: overrides.strategy ?? 'payment_link',
      amountAtRisk: amount,
      amountRecovered: overrides.amountRecovered ?? 0,
      maxAttempts: 3,
      currentAttempt: 1,
      currentChannel: overrides.channel ?? 'whatsapp',
      createdAt: nowStr,
      updatedAt: nowStr,
    });

    if (overrides.channel) {
      await db.insert(schema.recoveryActions).values({
        id: generateId('ra'),
        journeyId,
        attemptNumber: 1,
        channel: overrides.channel,
        actionType: 'payment_link',
        messageContent: 'test message',
        deliveryStatus: 'sent',
        customerResponse: null,
        outcome: 'pending',
        scheduledAt: nowStr,
        executedAt: nowStr,
        createdAt: nowStr,
      });
    }
  }

  return { customerId, failureId, journeyId, amount };
}

function buildGetRequest(path: string) {
  return new NextRequest(`http://localhost${path}`);
}

describe('GET /api/customers — SQL-side filters, search, pagination (RA-19)', () => {
  afterAll(() => {
    for (const suffix of ['', '-wal', '-shm']) {
      try {
        fs.unlinkSync(testDbPath + suffix);
      } catch {
        // file may not exist
      }
    }
  });

  it('returns the real failure data for a customer with no journey yet', async () => {
    const { customerId, amount } = await seedCustomerWithFailure({ withJourney: false, name: 'No Journey Customer' });

    const res = await getCustomers(buildGetRequest('/api/customers'));
    const json = await res.json();
    const item = json.data.items.find((i: { id: string }) => i.id === customerId);

    expect(item).toBeDefined();
    expect(item.journeyId).toBeNull();
    expect(item.amountAtRiskPaise).toBe(amount);
    expect(item.errorReason).toBe('insufficient_funds');
  });

  it('applies the status filter in SQL', async () => {
    await seedCustomerWithFailure({ withJourney: true, status: 'resolved', name: 'Resolved Customer' });
    await seedCustomerWithFailure({ withJourney: true, status: 'recovering', name: 'Recovering Customer' });

    const res = await getCustomers(buildGetRequest('/api/customers?status=resolved'));
    const json = await res.json();

    expect(json.data.items.length).toBeGreaterThan(0);
    for (const item of json.data.items) {
      expect(item.journeyStatus).toBe('resolved');
    }
  });

  it('applies the strategy filter in SQL', async () => {
    await seedCustomerWithFailure({ withJourney: true, strategy: 'conversational', name: 'Conversational Customer' });

    const res = await getCustomers(buildGetRequest('/api/customers?strategy=conversational'));
    const json = await res.json();

    expect(json.data.items.length).toBeGreaterThan(0);
    for (const item of json.data.items) {
      expect(item.strategy).toBe('conversational');
    }
  });

  it('applies search across name/email/phone/errorReason/id in SQL', async () => {
    const { customerId } = await seedCustomerWithFailure({ withJourney: false, name: 'Zzyzx Uniquename' });

    const res = await getCustomers(buildGetRequest('/api/customers?search=zzyzx'));
    const json = await res.json();

    expect(json.data.items.length).toBe(1);
    expect(json.data.items[0].id).toBe(customerId);
  });

  it('supports limit/offset pagination while total reflects the full filtered count', async () => {
    for (let i = 0; i < 5; i++) {
      await seedCustomerWithFailure({ withJourney: false, name: `Pagination Customer ${i}` });
    }

    const fullRes = await getCustomers(buildGetRequest('/api/customers'));
    const fullJson = await fullRes.json();
    const fullTotal = fullJson.data.total;

    const pagedRes = await getCustomers(buildGetRequest('/api/customers?limit=2&offset=0'));
    const pagedJson = await pagedRes.json();

    expect(pagedJson.data.items.length).toBe(2);
    expect(pagedJson.data.total).toBe(fullTotal);
  });

  it('reflects the correct recovery_actions count for a journey', async () => {
    const { journeyId } = await seedCustomerWithFailure({ withJourney: true, channel: 'sms', name: 'Actions Count Customer' });

    const res = await getCustomers(buildGetRequest('/api/customers'));
    const json = await res.json();
    const item = json.data.items.find((i: { journeyId: string | null }) => i.journeyId === journeyId);

    expect(item.totalActionsCount).toBe(1);
  });
});

describe('GET /api/metrics — SQL aggregates instead of JS reduction (RA-19)', () => {
  it('computes summary totals via SQL SUM/COUNT', async () => {
    await seedCustomerWithFailure({ withJourney: true, status: 'resolved', amount: 50000, amountRecovered: 50000, name: 'Metrics Resolved' });
    await seedCustomerWithFailure({ withJourney: true, status: 'exhausted', amount: 30000, name: 'Metrics Exhausted' });

    const res = await getMetrics();
    const json = await res.json();

    expect(json.data.summary.totalJourneys).toBeGreaterThan(0);
    expect(json.data.summary.totalRecoveredPaise).toBeGreaterThanOrEqual(50000);
    expect(json.data.summary.resolvedCount).toBeGreaterThan(0);
    expect(json.data.summary.exhaustedCount).toBeGreaterThan(0);
  });

  it('computes channel metrics with counts grouped by channel', async () => {
    await seedCustomerWithFailure({ withJourney: true, channel: 'voice', name: 'Metrics Voice Customer' });

    const res = await getMetrics();
    const json = await res.json();

    const voiceMetric = json.data.channelMetrics.find((c: { channel: string }) => c.channel === 'voice');
    expect(voiceMetric).toBeDefined();
    expect(voiceMetric.totalAttempts).toBeGreaterThan(0);
  });

  it('always returns all four channels, even ones with zero attempts', async () => {
    const res = await getMetrics();
    const json = await res.json();
    const channelNames = json.data.channelMetrics.map((c: { channel: string }) => c.channel);
    expect(channelNames.sort()).toEqual(['email', 'sms', 'voice', 'whatsapp']);
  });
});

describe('Foreign-key indexes exist on the bootstrapped schema (RA-19)', () => {
  it('creates the indexes needed by the list endpoints', async () => {
    const { sql } = await import('drizzle-orm');
    const rows = (await db.all(
      sql`SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%'`
    )) as { name: string }[];
    const indexNames = rows.map((r) => r.name).sort();

    expect(indexNames).toEqual(
      [
        'idx_actions_journey',
        'idx_audit_journey',
        'idx_failures_arm',
        'idx_failures_customer',
        'idx_journeys_arm',
        'idx_journeys_customer',
        'idx_journeys_failure',
      ].sort()
    );
  });
});
