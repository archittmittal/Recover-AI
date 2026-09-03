import { db } from '../db';
import { webhookEvents } from '../db/schema';
import { and, eq, lt } from 'drizzle-orm';
import { getClock, formatIST } from '../utils/time';

export interface StaleWebhookEvent {
  id: string;
  eventType: string;
  processingStatus: string;
  errorMessage: string | null;
  receivedAt: string;
}

export interface ReconciliationResult {
  failed: StaleWebhookEvent[];
  stuck: StaleWebhookEvent[];
  timestamp: string;
}

/**
 * How long an event may sit in `processing` before it counts as stuck rather than in flight.
 * Deferred processing takes seconds, not minutes; anything past this lost its invocation.
 */
const STUCK_AFTER_MINUTES = 15;

/**
 * Finds webhook deliveries whose processing never completed.
 *
 * Acknowledging a delivery before doing the agent's work (#188) bought a fast 2xx at a real cost:
 * a failure after the response can no longer be signalled to Razorpay, so their retry — the
 * mechanism RA-10's reclaim path was built around — can never fire for it. The failure is
 * recorded faithfully in `webhook_events`, but until now nothing ever looked at those rows.
 *
 * Two shapes of casualty:
 *   - `failed` — processing ran and threw. The error message says why.
 *   - `processing`, older than the threshold — the invocation died mid-flight (a serverless
 *     timeout, a deploy landing between the claim and the work), so nothing ever wrote an
 *     outcome. These are the invisible ones: no error, no journey, no trace anywhere else.
 *
 * This function only reports. Re-driving a payment event automatically would mean replaying
 * money movement on rows we know something already went wrong with, and the honest first step is
 * making them visible rather than guessing at a repair.
 */
export async function findUnprocessedWebhookEvents(
  stuckAfterMinutes: number = STUCK_AFTER_MINUTES
): Promise<ReconciliationResult> {
  const now = getClock().now();
  const cutoff = formatIST(new Date(now.getTime() - stuckAfterMinutes * 60 * 1000));

  const failed = await db
    .select({
      id: webhookEvents.id,
      eventType: webhookEvents.eventType,
      processingStatus: webhookEvents.processingStatus,
      errorMessage: webhookEvents.errorMessage,
      receivedAt: webhookEvents.receivedAt,
    })
    .from(webhookEvents)
    .where(eq(webhookEvents.processingStatus, 'failed'));

  // Timestamps are ISO 8601 with a fixed +05:30 offset, so lexical ordering is chronological.
  const stuck = await db
    .select({
      id: webhookEvents.id,
      eventType: webhookEvents.eventType,
      processingStatus: webhookEvents.processingStatus,
      errorMessage: webhookEvents.errorMessage,
      receivedAt: webhookEvents.receivedAt,
    })
    .from(webhookEvents)
    .where(
      and(eq(webhookEvents.processingStatus, 'processing'), lt(webhookEvents.receivedAt, cutoff))
    );

  if (failed.length > 0 || stuck.length > 0) {
    console.warn(
      `[reconciliation] ${failed.length} failed and ${stuck.length} stuck webhook events ` +
        'need attention — see /api/recovery/sweep output.'
    );
  }

  return { failed, stuck, timestamp: formatIST(now) };
}
