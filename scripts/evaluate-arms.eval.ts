/**
 * Replicated three-arm evaluation (RA-22).
 *
 * One batch gives one number, and one number from a stochastic model is not a result. This
 * script re-runs the whole experiment across many simulation seeds and reports the spread, so
 * the C − B delta arrives with an interval instead of a decimal point of false precision.
 *
 * Two things it fixes about reading a single run:
 *   1. A single batch has to be run long enough to exhaust every declared cadence.
 *      `invoice_reminder` schedules attempts at +24h, +168h and +336h — 22 days — so a one-week
 *      window silently truncates the ladder and reports rates far below their converged values.
 *   2. The rupee-weighted rate is heavy-tailed: ten B2B invoices of up to ₹75,000 dominate it.
 *      Both weightings are reported; they disagree in magnitude and that disagreement matters.
 *
 * Usage: npm run eval:arms          (25 replications)
 *        EVAL_REPLICATIONS=50 npm run eval:arms
 *
 * It runs under Vitest — with its own config, so it never joins the normal suite — because the
 * application's modules use the `@/` path alias and extensionless imports that only the project
 * toolchain resolves. Reimplementing that resolution for a bare `node` run would be a second
 * source of truth for how this code loads.
 */

import { it } from 'vitest';
import { eq, sql } from 'drizzle-orm';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'file:./data/eval-arms.db';

const { db } = await import('../src/lib/db');
const { recoveryJourneys, recoveryActions } = await import('../src/lib/db/schema');
const { seedDatabase } = await import('../src/lib/db/seed');
const { setClock, FixedClock } = await import('../src/lib/utils/time');
const { POST: triggerRecovery } = await import('../src/app/api/recovery/trigger/route');

/** Daytime IST, so the RBI contact-hours rule never defers an attempt. */
const START = '2026-08-21T14:30:00+05:30';
/** Past the longest declared ladder (24h + 168h + 336h). */
const DAYS = 24;

interface ArmResult {
  byAmountPct: number;
  byCountPct: number;
  attemptsPerJourney: number;
}

async function runBatch(simulationSeed: number): Promise<Record<'A' | 'B' | 'C', ArmResult>> {
  process.env.SIMULATION_SEED = String(simulationSeed);
  const base = Date.parse(START);

  setClock(new FixedClock(new Date(base)));
  await seedDatabase();

  // 24h-aligned passes hold the time of day fixed, so every attempt lands inside the window.
  for (let day = 0; day <= DAYS; day++) {
    setClock(new FixedClock(new Date(base + day * 24 * 3600 * 1000)));
    await triggerRecovery();
  }

  const journeys = await db
    .select({
      arm: recoveryJourneys.arm,
      journeyCount: sql<number>`COUNT(*)`,
      resolved: sql<number>`SUM(CASE WHEN ${recoveryJourneys.status} = 'resolved' THEN 1 ELSE 0 END)`,
      atRisk: sql<number>`SUM(${recoveryJourneys.amountAtRisk})`,
      recovered: sql<number>`SUM(${recoveryJourneys.amountRecovered})`,
    })
    .from(recoveryJourneys)
    .groupBy(recoveryJourneys.arm);

  const actions = await db
    .select({ arm: recoveryJourneys.arm, count: sql<number>`COUNT(*)` })
    .from(recoveryActions)
    .innerJoin(recoveryJourneys, eq(recoveryActions.journeyId, recoveryJourneys.id))
    .groupBy(recoveryJourneys.arm);

  const result = {} as Record<'A' | 'B' | 'C', ArmResult>;
  for (const arm of ['A', 'B', 'C'] as const) {
    const row = journeys.find((j) => j.arm === arm);
    const acts = actions.find((a) => a.arm === arm)?.count ?? 0;
    result[arm] = {
      byAmountPct: row && row.atRisk > 0 ? (row.recovered / row.atRisk) * 100 : 0,
      byCountPct: row && row.journeyCount > 0 ? (row.resolved / row.journeyCount) * 100 : 0,
      attemptsPerJourney: row && row.journeyCount > 0 ? acts / row.journeyCount : 0,
    };
  }
  return result;
}

function describe(values: number[]): { mean: number; sd: number; se: number; lo: number; hi: number } {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sd =
    values.length > 1
      ? Math.sqrt(values.reduce((s, x) => s + (x - mean) ** 2, 0) / (values.length - 1))
      : 0;
  const sorted = [...values].sort((a, b) => a - b);
  return { mean, sd, se: sd / Math.sqrt(values.length), lo: sorted[0], hi: sorted[sorted.length - 1] };
}

it('replicates the three-arm comparison across seeds', async () => {
  const replications = Number(process.env.EVAL_REPLICATIONS || 25);
  const runs: Record<'A' | 'B' | 'C', ArmResult>[] = [];

  for (let i = 0; i < replications; i++) {
    // Seeds spaced by a prime so consecutive replications do not share hash neighbourhoods.
    runs.push(await runBatch(20260823 + i * 7919));
    process.stdout.write(`\rrun ${i + 1}/${replications}`);
  }
  process.stdout.write('\n\n');

  const fmt = (n: number) => n.toFixed(1).padStart(6);
  console.log(`Replications: ${replications}   Batch: 50 failures per arm   Window: ${DAYS} days\n`);
  console.log('Arm                     by amount            by journeys      attempts/journey');
  for (const arm of ['A', 'B', 'C'] as const) {
    const amount = describe(runs.map((r) => r[arm].byAmountPct));
    const count = describe(runs.map((r) => r[arm].byCountPct));
    const attempts = describe(runs.map((r) => r[arm].attemptsPerJourney));
    console.log(
      `${arm}   ${fmt(amount.mean)}% ± ${amount.sd.toFixed(1)}   ` +
        `${fmt(count.mean)}% ± ${count.sd.toFixed(1)}   ${attempts.mean.toFixed(2)}`
    );
  }

  const deltaAmount = describe(runs.map((r) => r.C.byAmountPct - r.B.byAmountPct));
  const deltaCount = describe(runs.map((r) => r.C.byCountPct - r.B.byCountPct));
  const negative = runs.filter((r) => r.C.byAmountPct < r.B.byAmountPct).length;

  console.log('\nC − B (percentage points)');
  console.log(
    `  by amount   ${deltaAmount.mean.toFixed(2)}  se ${deltaAmount.se.toFixed(2)}  ` +
      `range [${deltaAmount.lo.toFixed(1)}, ${deltaAmount.hi.toFixed(1)}]  t=${(deltaAmount.mean / deltaAmount.se).toFixed(1)}`
  );
  console.log(
    `  by journeys ${deltaCount.mean.toFixed(2)}  se ${deltaCount.se.toFixed(2)}  ` +
      `range [${deltaCount.lo.toFixed(1)}, ${deltaCount.hi.toFixed(1)}]  t=${(deltaCount.mean / deltaCount.se).toFixed(1)}`
  );
  console.log(`  negative in ${negative}/${replications} replications`);
}, 30 * 60 * 1000);
