import { NextRequest, NextResponse } from 'next/server';
import { runCheckoutAbandonmentSweep } from '@/lib/recovery/abandonment-sweep';
import { recoveryCoordinator } from '@/lib/recovery/coordinator';
import { getSimulationSeed, isLive } from '@/lib/config';
import { runSimulatedOutcomes } from '@/lib/simulation/outcomes';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    // Optional cron/shared-secret check if configured in environment
    const configuredSecret = process.env.RECOVERY_SWEEP_SECRET || process.env.CRON_SECRET;
    if (configuredSecret) {
      const authHeader = req.headers.get('authorization');
      const secretHeader = req.headers.get('x-recovery-secret');
      const token = authHeader?.replace(/^Bearer\s+/i, '') || secretHeader;

      if (!token || token !== configuredSecret) {
        return NextResponse.json(
          { success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid or missing sweep secret' } },
          { status: 401 }
        );
      }
    }

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

    return NextResponse.json({
      success: true,
      data: {
        ...result,
        simulatedRecoveries: simulatedRecoveries.length,
        simulationSeed: isLive() ? null : simulationSeed,
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
