/**
 * Drives the declared response model over a batch (RA-23).
 *
 * The split in this file is deliberate. `decideOutcomes` is pure: given the same rows and the
 * same seed it returns the same decisions, on any machine, in any order — which is what makes
 * "run the batch twice, get the same result" a property we can test rather than a hope.
 * `runSimulatedOutcomes` is the thin database wrapper around it.
 *
 * What this module does NOT do is resolve journeys. It returns the recoveries it drew and lets
 * the caller hand them to the recovery coordinator, so that no file under `src/lib/simulation/`
 * ever imports the agent and no file under `src/lib/recovery/` ever imports the model. The
 * composition happens one level up, in the API route.
 */

import { db } from '../db';
import { customers, paymentFailures, recoveryActions, recoveryJourneys } from '../db/schema';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { writeAuditLog } from '../utils/audit';
import { SeededRNG } from './rng';
import {
  OutcomeDecision,
  OutreachOutcomeInput,
  SimulationChannel,
  SimulationSegment,
  willPay,
} from './response-model';

/** One dispatched outreach still awaiting a customer response. */
export interface PendingOutreach {
  journeyId: string;
  actionId: string;
  /** Seeded and stable across re-seeds (`fail_0000000000000001`), unlike the nanoid journey id. */
  failureId: string;
  amountAtRisk: number;
  errorReason: string;
  attemptNumber: number;
  channel: SimulationChannel;
  segment: SimulationSegment;
  isTemplateFallback: boolean;
}

export interface SimulatedOutcome extends OutcomeDecision {
  journeyId: string;
  actionId: string;
  /** Deterministic, so the same batch replays to the same payment ids. */
  paymentId: string;
  amountRecovered: number;
}

/**
 * FNV-1a over the batch seed and a stable natural key.
 *
 * A single shared RNG stream would make every draw depend on how many journeys happened to be
 * processed before it, so adding one failure to the batch would move every later outcome.
 * Keying each draw to its own attempt makes the model reproducible per journey instead of per
 * run — the property the acceptance criteria actually need.
 */
export function deriveOutcomeSeed(simulationSeed: number, key: string): number {
  let hash = 0x811c9dc5 ^ (simulationSeed >>> 0);
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** The natural key for one draw: this failure, this attempt. Never the journey's random id. */
export function outcomeKey(row: PendingOutreach): string {
  return `${row.failureId}:attempt:${row.attemptNumber}`;
}

/**
 * Decides every pending outreach.
 *
 * At most one recovery per journey: a customer who paid on attempt 1 cannot pay again on
 * attempt 2, and the lower attempt number wins regardless of the order rows arrive in.
 */
export function decideOutcomes(
  rows: PendingOutreach[],
  simulationSeed: number
): { paid: SimulatedOutcome[]; ignored: SimulatedOutcome[] } {
  const ordered = [...rows].sort((a, b) =>
    a.journeyId === b.journeyId
      ? a.attemptNumber - b.attemptNumber
      : a.journeyId.localeCompare(b.journeyId)
  );

  const paid: SimulatedOutcome[] = [];
  const ignored: SimulatedOutcome[] = [];
  const settledJourneys = new Set<string>();

  for (const row of ordered) {
    const input: OutreachOutcomeInput = {
      errorReason: row.errorReason,
      attemptNumber: row.attemptNumber,
      channel: row.channel,
      segment: row.segment,
      isTemplateFallback: row.isTemplateFallback,
    };

    const decision = willPay(input, new SeededRNG(deriveOutcomeSeed(simulationSeed, outcomeKey(row))));
    const outcome: SimulatedOutcome = {
      ...decision,
      journeyId: row.journeyId,
      actionId: row.actionId,
      paymentId: `pay_sim_${row.failureId}_a${row.attemptNumber}`,
      amountRecovered: row.amountAtRisk,
    };

    if (decision.paid && !settledJourneys.has(row.journeyId)) {
      settledJourneys.add(row.journeyId);
      paid.push(outcome);
    } else {
      // A draw that landed short, or one on a journey already settled by an earlier attempt:
      // either way this particular outreach did not convert.
      ignored.push({ ...outcome, paid: false });
    }
  }

  return { paid, ignored };
}

/** Reads every dispatched-but-unanswered outreach on a still-open journey. */
export async function collectPendingOutreach(): Promise<PendingOutreach[]> {
  const rows = await db
    .select({
      journeyId: recoveryJourneys.id,
      actionId: recoveryActions.id,
      failureId: paymentFailures.id,
      amountAtRisk: recoveryJourneys.amountAtRisk,
      errorReason: paymentFailures.errorReason,
      attemptNumber: recoveryActions.attemptNumber,
      channel: recoveryActions.channel,
      segment: customers.segment,
      isTemplateFallback: recoveryActions.isTemplateFallback,
      journeyStatus: recoveryJourneys.status,
    })
    .from(recoveryActions)
    .innerJoin(recoveryJourneys, eq(recoveryActions.journeyId, recoveryJourneys.id))
    .innerJoin(paymentFailures, eq(recoveryJourneys.failureId, paymentFailures.id))
    .innerJoin(customers, eq(recoveryJourneys.customerId, customers.id))
    .where(
      and(
        eq(recoveryActions.outcome, 'pending'),
        // Outreach the agent sent and nobody has answered yet. The conversational reply the
        // agent writes back inside the chat simulator already carries the customer's message
        // in customerResponse, and drawing an outcome for it would score the agent twice on
        // one exchange.
        isNull(recoveryActions.customerResponse),
        inArray(recoveryJourneys.status, ['recovering', 'escalating', 'exhausted'])
      )
    );

  return rows.map((r) => ({
    journeyId: r.journeyId,
    actionId: r.actionId,
    failureId: r.failureId,
    amountAtRisk: r.amountAtRisk,
    errorReason: r.errorReason,
    attemptNumber: r.attemptNumber,
    channel: r.channel as SimulationChannel,
    segment: (r.segment === 'b2b' ? 'b2b' : 'b2c') as SimulationSegment,
    isTemplateFallback: Boolean(r.isTemplateFallback),
  }));
}

/**
 * Runs the model over the batch and records what it decided.
 *
 * Every draw is audited — the ones that did not convert too. An evaluation that only logs its
 * successes is not an evaluation, and the breakdown is written alongside so any single outcome
 * can be recomputed by hand from `docs/SIMULATION_MODEL.md`.
 *
 * Returns the recoveries for the caller to apply; this function never marks a journey resolved.
 */
export async function runSimulatedOutcomes(simulationSeed: number): Promise<SimulatedOutcome[]> {
  const pending = await collectPendingOutreach();
  if (pending.length === 0) return [];

  const { paid, ignored } = decideOutcomes(pending, simulationSeed);

  for (const outcome of ignored) {
    await db
      .update(recoveryActions)
      .set({ outcome: 'ignored' })
      .where(eq(recoveryActions.id, outcome.actionId));
  }

  for (const outcome of [...paid, ...ignored]) {
    await writeAuditLog({
      journeyId: outcome.journeyId,
      actionId: outcome.actionId,
      actor: 'system',
      eventType: 'simulated_response_drawn',
      eventData: {
        paid: outcome.paid,
        probability: outcome.probability,
        draw: outcome.draw,
        modelVersion: outcome.modelVersion,
        simulationSeed,
        baseRate: outcome.baseRate,
        channelMultiplier: outcome.channelMultiplier,
        attemptMultiplier: outcome.attemptMultiplier,
        personalisationMultiplier: outcome.personalisationMultiplier,
        segmentMultiplier: outcome.segmentMultiplier,
        note: 'Simulation output against docs/SIMULATION_MODEL.md — not a real payment.',
      },
    });
  }

  return paid;
}
