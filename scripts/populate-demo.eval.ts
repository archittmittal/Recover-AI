/**
 * Populates a database with a full, real agent run — for recording the demo.
 *
 * Usage:
 *   DATABASE_URL=libsql://… DATABASE_AUTH_TOKEN=… RECOVERAI_MODE=live SIMULATE_OUTCOMES=true \
 *     npm run demo:populate
 *
 * Two reasons this does not go through `POST /api/recovery/trigger`:
 *
 *   1. A live-mode pass makes a real Razorpay payment link and a real Gemini call per journey.
 *      That is minutes of work, far past any serverless request budget.
 *   2. The route dispatches every due journey as fast as the loop runs, which Razorpay's test
 *      environment answers with `429 Too many requests` — observed on the first attempt at this,
 *      where 23 of ~100 dispatches were rejected and the agent (correctly, per RA-14) aborted
 *      those attempts rather than send a dead link. Journeys are therefore paced here.
 *
 * Time is advanced a day at a time so the retry ladder actually plays out: `invoice_reminder`
 * schedules attempts at +24h, +168h and +336h, so a run that never moves the clock measures the
 * window rather than the agent.
 */

import { it } from 'vitest';

const DAYS = Number(process.env.DEMO_DAYS || 1);
const PACE_MS = Number(process.env.DEMO_PACE_MS || 900);
const START = '2026-08-21T14:30:00+05:30';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

it('populates the demo batch', async () => {
  const url = process.env.DATABASE_URL || '';
  if (!url.startsWith('libsql://') && !url.startsWith('https://')) {
    throw new Error(`Point DATABASE_URL at the deployed database first. Got "${url || '(unset)'}".`);
  }

  const { seedDatabase } = await import('../src/lib/db/seed');
  const { db } = await import('../src/lib/db');
  const { recoveryJourneys, recoveryActions, customers, paymentFailures } = await import(
    '../src/lib/db/schema'
  );
  const { setClock, FixedClock, SystemClock } = await import('../src/lib/utils/time');
  const { recoveryCoordinator } = await import('../src/lib/recovery/coordinator');
  const { runSimulatedOutcomes } = await import('../src/lib/simulation/outcomes');
  const { getSimulationSeed, shouldSimulateOutcomes } = await import('../src/lib/config');
  const { sql, inArray, eq } = await import('drizzle-orm');

  const base = Date.parse(START);

  if (process.env.DEMO_RESEED !== 'false') {
    console.log('\nreseeding — this clears whatever is there now');
    setClock(new FixedClock(new Date(base)));
    const seeded = await seedDatabase();
    console.log(`seeded ${seeded} failures across three arms\n`);
  }

  for (let day = 0; day <= DAYS; day++) {
    setClock(new FixedClock(new Date(base + day * 24 * 3600 * 1000)));

    // Arms A and B and C all have failures; arm A's journeys are created and never dispatched,
    // which the coordinator enforces itself.
    const failures = await db.select({ id: paymentFailures.id }).from(paymentFailures);
    const existing = await db
      .select({ id: recoveryJourneys.id, failureId: recoveryJourneys.failureId, status: recoveryJourneys.status })
      .from(recoveryJourneys);
    const byFailure = new Map(existing.map((j) => [j.failureId, j]));

    let dispatched = 0;
    let aborted = 0;

    for (const failure of failures) {
      const journey = byFailure.get(failure.id);
      const before = await db
        .select({ n: sql<number>`COUNT(*)` })
        .from(recoveryActions)
        .where(journey ? eq(recoveryActions.journeyId, journey.id) : inArray(recoveryActions.id, []));

      try {
        if (!journey) {
          await recoveryCoordinator.startRecoveryJourney(failure.id);
        } else if (journey.status === 'recovering' || journey.status === 'detected') {
          await recoveryCoordinator.processRecoveryAttempt(journey.id);
        } else {
          continue;
        }
      } catch (error) {
        aborted += 1;
        console.error(`  ${failure.id}: ${error instanceof Error ? error.message.slice(0, 90) : error}`);
        continue;
      }

      const [{ n: after }] = journey
        ? await db
            .select({ n: sql<number>`COUNT(*)` })
            .from(recoveryActions)
            .where(eq(recoveryActions.journeyId, journey.id))
        : [{ n: 0 }];

      if (after > (before[0]?.n ?? 0)) dispatched += 1;

      // Pace the outbound calls. Razorpay's test environment rejects a burst.
      await sleep(PACE_MS);
    }

    const recoveries = shouldSimulateOutcomes()
      ? await runSimulatedOutcomes(getSimulationSeed())
      : [];
    for (const recovery of recoveries) {
      await recoveryCoordinator.resolveJourneyWithPayment(
        recovery.journeyId,
        recovery.paymentId,
        recovery.amountRecovered,
        recovery.actionId
      );
    }

    console.log(
      `day ${String(day).padStart(2)}  dispatched ${String(dispatched).padStart(3)}` +
        `  aborted ${String(aborted).padStart(3)}  recovered ${String(recoveries.length).padStart(3)}`
    );
  }

  setClock(new SystemClock());

  const [totals] = await db
    .select({
      journeys: sql<number>`COUNT(*)`,
      resolved: sql<number>`SUM(CASE WHEN ${recoveryJourneys.status} = 'resolved' THEN 1 ELSE 0 END)`,
      atRisk: sql<number>`SUM(${recoveryJourneys.amountAtRisk})`,
      recovered: sql<number>`SUM(${recoveryJourneys.amountRecovered})`,
    })
    .from(recoveryJourneys);

  const [actions] = await db
    .select({
      total: sql<number>`COUNT(*)`,
      llm: sql<number>`SUM(CASE WHEN ${recoveryActions.isTemplateFallback} = 0 THEN 1 ELSE 0 END)`,
    })
    .from(recoveryActions);

  const [{ n: customerCount }] = await db.select({ n: sql<number>`COUNT(*)` }).from(customers);

  console.log('\n--- demo database ---');
  console.log(`customers          ${customerCount}`);
  console.log(`journeys           ${totals.journeys}  (${totals.resolved} resolved)`);
  console.log(`outreach actions   ${actions.total}  (${actions.llm} LLM-generated)`);
  console.log(
    `recovered          ₹${Math.round(totals.recovered / 100).toLocaleString('en-IN')} of ` +
      `₹${Math.round(totals.atRisk / 100).toLocaleString('en-IN')} at risk`
  );
}, 2 * 60 * 60 * 1000);
