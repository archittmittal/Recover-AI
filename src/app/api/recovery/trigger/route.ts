import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { paymentFailures, recoveryJourneys } from '@/lib/db/schema';
import { recoveryCoordinator } from '@/lib/recovery/coordinator';
import { getSimulationSeed, shouldSimulateOutcomes } from '@/lib/config';
import { runSimulatedOutcomes } from '@/lib/simulation/outcomes';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    // 1. Fetch all payment failures
    const allFailures = await db.select().from(paymentFailures);
    const existingJourneys = await db.select().from(recoveryJourneys);

    const processedJourneyIds: string[] = [];

    for (const failure of allFailures) {
      const existing = existingJourneys.find((j) => j.failureId === failure.id);

      if (!existing) {
        // Start new journey
        const jId = await recoveryCoordinator.startRecoveryJourney(failure.id);
        processedJourneyIds.push(jId);
      } else if (existing.status === 'recovering' || existing.status === 'detected') {
        // Continue existing journey attempt
        await recoveryCoordinator.processRecoveryAttempt(existing.id);
        processedJourneyIds.push(existing.id);
      }
    }

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
