import { db } from '../db';
import { paymentFailures, recoveryJourneys } from '../db/schema';
import { eq, or } from 'drizzle-orm';
import { recoveryCoordinator } from './coordinator';
import { getClock, formatIST } from '../utils/time';

export interface AbandonmentSweepResult {
  sweptCount: number;
  initiatedCount: number;
  journeyIds: string[];
  timestamp: string;
}

/**
 * Sweeps for cart drop-offs and checkout abandonment events that lack active recovery journeys.
 * Generates initial conversational outreach to recover uncompleted checkouts.
 */
export async function runCheckoutAbandonmentSweep(): Promise<AbandonmentSweepResult> {
  const clock = getClock();
  const nowStr = formatIST(clock.now());

  // 1. Query for abandonment failures
  const candidateFailures = await db
    .select()
    .from(paymentFailures)
    .where(
      or(
        eq(paymentFailures.failureType, 'abandonment'),
        eq(paymentFailures.errorReason, 'checkout_abandonment')
      )
    );

  const existingJourneys = await db.select({ failureId: recoveryJourneys.failureId }).from(recoveryJourneys);
  const journeyFailureIds = new Set(existingJourneys.map((j) => j.failureId));

  const unhandledFailures = candidateFailures.filter((f) => !journeyFailureIds.has(f.id));

  const createdJourneyIds: string[] = [];

  for (const failure of unhandledFailures) {
    try {
      const journeyId = await recoveryCoordinator.startRecoveryJourney(failure.id);
      await recoveryCoordinator.processRecoveryAttempt(journeyId);
      createdJourneyIds.push(journeyId);
    } catch (err) {
      console.error(`[Abandonment Sweep] Failed to initiate journey for failure ${failure.id}:`, err);
    }
  }

  return {
    sweptCount: candidateFailures.length,
    initiatedCount: createdJourneyIds.length,
    journeyIds: createdJourneyIds,
    timestamp: nowStr,
  };
}
