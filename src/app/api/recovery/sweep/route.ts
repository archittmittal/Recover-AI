import { NextResponse } from 'next/server';
import { runCheckoutAbandonmentSweep } from '@/lib/recovery/abandonment-sweep';
import { findUnprocessedWebhookEvents } from '@/lib/recovery/webhook-reconciliation';
import { recoveryCoordinator } from '@/lib/recovery/coordinator';
import { getSimulationSeed, isLive } from '@/lib/config';
import { runSimulatedOutcomes } from '@/lib/simulation/outcomes';

export const dynamic = 'force-dynamic';

// Authorization (dashboard session or cron secret, failing closed if the
// secret is unconfigured) is enforced in src/proxy.ts before this handler
// ever runs — see RA-05.
export async function POST() {
  try {
    const result = await runCheckoutAbandonmentSweep();

    // The sweep dispatches attempt 1 exactly as a batch run does, so its outreach gets its
    // outcomes drawn here too (RA-23). Leaving that to whenever someone next hits
    // /api/recovery/trigger would let a sweep-only deployment accumulate journeys that can
    // never resolve, and would misattribute the conversion when the batch run finally arrived
    // and a second attempt was already outstanding.
    const simulationSeed = getSimulationSeed();
    const simulatedRecoveries = isLive() ? [] : await runSimulatedOutcomes(simulationSeed);

    for (const recovery of simulatedRecoveries) {
      await recoveryCoordinator.resolveJourneyWithPayment(
        recovery.journeyId,
        recovery.paymentId,
        recovery.amountRecovered,
        recovery.actionId
      );
    }

    // Webhook deliveries whose processing never finished. Since #188 acknowledges before doing
    // the agent's work, a failure after the response cannot be signalled to Razorpay, so their
    // retry can never reclaim it — this sweep is the only thing that surfaces those rows.
    const unprocessedWebhooks = await findUnprocessedWebhookEvents();

    return NextResponse.json({
      success: true,
      data: {
        ...result,
        simulatedRecoveries: simulatedRecoveries.length,
        simulationSeed: isLive() ? null : simulationSeed,
        unprocessedWebhooks: {
          failed: unprocessedWebhooks.failed.length,
          stuck: unprocessedWebhooks.stuck.length,
          events: [...unprocessedWebhooks.failed, ...unprocessedWebhooks.stuck],
        },
      },
    });
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : 'Error executing abandonment sweep';
    console.error('[POST /api/recovery/sweep]', error);
    return NextResponse.json(
      { success: false, error: { code: 'SWEEP_ERROR', message: errorMsg } },
      { status: 500 }
    );
  }
}
