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
 * Sweeps for cart drop-offs and checkout abandonment events that lack active recovery journeys
 * and have passed the abandonment aging threshold (default: 30 minutes).
 * Generates initial conversational outreach (Attempt 1) to recover uncompleted checkouts.
 */
export async function runCheckoutAbandonmentSweep(
  thresholdMinutes: number = 30
): Promise<AbandonmentSweepResult> {
  const clock = getClock();
  const now = clock.now();
  const nowStr = formatIST(now);
  const cutoffTime = new Date(now.getTime() - thresholdMinutes * 60 * 1000);

  // 1. Query for abandonment failures
  const candidateFailures = await db
    .select()
    .from(paymentFailures)
    .where(
      or(
        eq(paymentFailures.errorReason, 'checkout_abandonment'),
        eq(paymentFailures.errorStep, 'payment_initiation')
      )
    );

  const existingJourneys = await db
    .select({ failureId: recoveryJourneys.failureId })
    .from(recoveryJourneys);
  const journeyFailureIds = new Set(existingJourneys.map((j) => j.failureId));

  // 2. Filter unhandled failures past the age threshold
  const unhandledFailures = candidateFailures.filter((f) => {
    if (journeyFailureIds.has(f.id)) return false;
    const failureCreatedAt = new Date(f.createdAt);
    return isNaN(failureCreatedAt.getTime()) || failureCreatedAt <= cutoffTime;
  });

  const createdJourneyIds: string[] = [];

  // 3. Initiate recovery journeys for eligible abandonments
  for (const failure of unhandledFailures) {
    try {
      // startRecoveryJourney initiates the journey and automatically executes Attempt 1
      const journeyId = await recoveryCoordinator.startRecoveryJourney(failure.id);
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
