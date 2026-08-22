import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { paymentFailures, recoveryJourneys } from '@/lib/db/schema';
import { recoveryCoordinator } from '@/lib/recovery/coordinator';

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

    return NextResponse.json({
      success: true,
      data: {
        processedCount: processedJourneyIds.length,
        journeyIds: processedJourneyIds,
        message: `Successfully processed recovery for ${processedJourneyIds.length} failures.`,
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
