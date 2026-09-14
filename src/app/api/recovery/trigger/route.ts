import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { paymentFailures, recoveryJourneys } from '@/lib/db/schema';
import { recoveryCoordinator } from '@/lib/recovery/coordinator';
import { getSimulationSeed, shouldSimulateOutcomes } from '@/lib/config';
import { runSimulatedOutcomes } from '@/lib/simulation/outcomes';
import { getRecoveryConcurrency, mapWithConcurrency } from '@/lib/utils/concurrency';

export const dynamic = 'force-dynamic';

/**
 * The batch is the slowest thing this app does, and the platform default is not generous enough
 * for it. Declared here rather than left to chance, so a slow run is cut off by a number that is
 * written down instead of by whatever the host happens to allow.
 */
export const maxDuration = 300;

export async function POST() {
  try {
    // 1. Fetch all payment failures
    const allFailures = await db.select().from(paymentFailures);
    const existingJourneys = await db.select().from(recoveryJourneys);

    // Index the journeys once. `find` inside the loop made this quadratic — 150 failures against
    // 150 journeys is 22,500 comparisons to answer a question a map answers in one.
    const journeyByFailureId = new Map(existingJourneys.map((j) => [j.failureId, j]));

    // Journeys are independent of one another, so the sequential loop this replaced spent almost
    // all of its time waiting on round trips it could have overlapped. Measured on the deployed
    // demo: 266s for 150 journeys, with no LLM call in any of them.
    //
    // Bounded, not unbounded: `Promise.all` over the whole batch would open 150 concurrent
    // database connections and fan out just as wide to Gemini, which rejects bursts (13 of 15
    // concurrent calls came back 429). The width is a declared number, not an accident.
    //
    // Determinism is unaffected. `decideOutcomes` sorts its own input before drawing, so the
    // order journeys happen to finish in cannot move a single outcome — asserted by
    // tests/simulation-batch-determinism.test.ts.
    const outcomes = await mapWithConcurrency(
      allFailures,
      getRecoveryConcurrency(),
      async (failure) => {
        const existing = journeyByFailureId.get(failure.id);

        if (!existing) {
          return recoveryCoordinator.startRecoveryJourney(failure.id);
        }

        if (existing.status === 'recovering' || existing.status === 'detected') {
          await recoveryCoordinator.processRecoveryAttempt(existing.id);
          return existing.id;
        }

        return null;
      }
    );

    const processedJourneyIds = outcomes.filter((id): id is string => id !== null);

    // 2. Ask the declared response model which of those outreach attempts converted (RA-23).
    //
    // This is the only place the two halves meet. The model decides; the coordinator applies.
    // Neither imports the other, which is what stops the agent from marking its own homework —
    // and it is why this composition lives in the route rather than inside either module.
    //
    // In live mode nothing is drawn: real customers and real Razorpay webhooks decide, and
    // inventing recoveries alongside them would corrupt a real merchant's numbers.
    const simulationSeed = getSimulationSeed();
    const simulatedRecoveries = shouldSimulateOutcomes()
      ? await runSimulatedOutcomes(simulationSeed)
      : [];

    for (const recovery of simulatedRecoveries) {
      await recoveryCoordinator.resolveJourneyWithPayment(
        recovery.journeyId,
        recovery.paymentId,
        recovery.amountRecovered,
        // Name the attempt that converted: with several attempts outstanding, the newest one
        // is not necessarily the one the model drew.
        recovery.actionId
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        processedCount: processedJourneyIds.length,
        journeyIds: processedJourneyIds,
        simulatedRecoveries: simulatedRecoveries.length,
        simulationSeed: shouldSimulateOutcomes() ? simulationSeed : null,
        message:
          `Successfully processed recovery for ${processedJourneyIds.length} failures` +
          (shouldSimulateOutcomes()
            ? `; the response model recovered ${simulatedRecoveries.length} of them (simulated).`
            : '.'),
      },
    });
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : 'Error triggering recovery workflow';
    console.error('[POST /api/recovery/trigger]', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'TRIGGER_ERROR',
          message: errorMsg,
        },
      },
      { status: 500 }
    );
  }
}
