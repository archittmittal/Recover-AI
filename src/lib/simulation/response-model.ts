/**
 * The declared response model (RA-23).
 *
 * Before this file existed, a simulated customer paid only when a human clicked "Pay" in the
 * simulator UI. That made the dashboard's recovery rate a count of button presses, and it made
 * the agent's intelligence unfalsifiable: personalisation, channel escalation and per-failure
 * strategy selection had no path to influence an outcome, so nothing in the system could
 * demonstrate that any of them work.
 *
 * This module decides whether a simulated customer pays, from declared coefficients that are
 * visible, versioned, and documented one-for-one in `docs/SIMULATION_MODEL.md`.
 *
 * Two rules keep it honest, and both are enforced by `tests/simulation-boundary.test.ts`:
 *
 *   1. This file imports nothing from `src/lib/recovery/` or `src/lib/ai/`. The agent's own
 *      judgment must never be an input to the outcome it is judged on.
 *   2. Nothing under `src/lib/recovery/` or `src/lib/ai/` imports this file. The agent cannot
 *      read the model it is being scored against, so it cannot mark its own homework.
 *
 * Every number here is an ESTIMATE. None is fitted to observed recovery data — we have none.
 * They are declared in advance so the comparison they feed cannot be tuned after the fact.
 */

import { SeededRNG } from './rng';

/** Bumped whenever any coefficient below changes, so a recorded outcome names its model. */
export const RESPONSE_MODEL_VERSION = '1.0.0';

/** Local copies of the channel/segment unions: importing the agent's types would couple to it. */
export type SimulationChannel = 'whatsapp' | 'sms' | 'email' | 'voice';
export type SimulationSegment = 'b2c' | 'b2b';

/**
 * Everything the model is allowed to see. Deliberately narrow: the message text, the strategy
 * name and the LLM's reasoning are all withheld, so the model cannot reward the agent for
 * sounding confident — only for the observable properties of what it actually sent.
 */
export interface OutreachOutcomeInput {
  /** `payment_failures.error_reason` — the root cause the customer has to overcome. */
  errorReason: string;
  /** 1-based; the same journey's second message is a second ask, not a fresh one. */
  attemptNumber: number;
  channel: SimulationChannel;
  segment: SimulationSegment;
  /** True when the deterministic template shipped because the LLM path was unavailable or rejected. */
  isTemplateFallback: boolean;
}

/**
 * Probability that a customer completes payment after ONE outreach, before any modifier:
 * WhatsApp, first attempt, B2C, template copy. Keyed by root cause, because the cause decides
 * how much work recovery asks of the customer — re-entering an OTP is a tap, replacing an
 * expired card is an errand, and a dead bank mandate is a trip to the bank.
 */
export const BASE_RATE_BY_ERROR_REASON: Readonly<Record<string, number>> = {
  gateway_technical_error: 0.55, // nothing is wrong on the customer's side; a retry usually clears
  authentication_failed: 0.45, // transient: re-entering an OTP costs the customer one tap
  insufficient_funds: 0.34, // intent exists; recovery waits on the customer's balance, not their will
  payment_cancelled: 0.3, // hesitation at checkout — persuadable, but the doubt is real
  card_declined: 0.28, // issuer-side refusal; often needs a different instrument
  checkout_abandonment: 0.42, // no instrument was ever declined; the customer simply left
  card_expired: 0.22, // requires the customer to fetch and enter a new card
  invoice_overdue: 0.26, // nothing is broken — the payment is waiting on someone's process
  mandate_inactive: 0.18, // re-authorising an e-mandate is a multi-step banking flow
  bank_account_invalid: 0.12, // the account itself is wrong; nearly always needs support contact
};

/** Applied when `errorReason` is not one of the eight seeded causes. Mid-range, on purpose. */
export const BASE_RATE_FALLBACK = 0.25;

/**
 * Channel reach and immediacy. WhatsApp is the reference (1.00) because it is the seeded
 * batch's primary channel; the others are expressed relative to it.
 */
export const CHANNEL_MULTIPLIER: Readonly<Record<SimulationChannel, number>> = {
  whatsapp: 1.0,
  voice: 0.9, // highest attention when answered, but many calls are not answered
  sms: 0.78, // reliably delivered, easily ignored
  email: 0.55, // slowest, and the one most likely to be filtered
};

/**
 * Per-attempt decay. A customer who ignored the first message is, by revealed preference, a
 * worse prospect for the second — the decay is steep for that reason, not merely for fatigue.
 * Index 0 is attempt 1; attempts beyond the table use the last value.
 */
export const ATTEMPT_DECAY = [1.0, 0.62, 0.38] as const;

/**
 * The personalisation delta — the single coefficient that makes "did the LLM help?" a real
 * question. It applies only when the message came from the LLM path; a template-fallback
 * message gets exactly 1.00. Set deliberately modest: a large delta would manufacture the
 * project's own headline result.
 */
export const PERSONALISATION_MULTIPLIER = 1.18;
export const TEMPLATE_MULTIPLIER = 1.0;

/** B2B payments route through approval chains that no message can shorten. */
export const SEGMENT_MULTIPLIER: Readonly<Record<SimulationSegment, number>> = {
  b2c: 1.0,
  b2b: 0.85,
};

/** No outcome is ever certain, and none is ever impossible. */
export const PROBABILITY_FLOOR = 0.01;
export const PROBABILITY_CEILING = 0.95;

export interface ProbabilityBreakdown {
  baseRate: number;
  channelMultiplier: number;
  attemptMultiplier: number;
  personalisationMultiplier: number;
  segmentMultiplier: number;
  /** The product, before clamping — reported so a clamped result is visible as clamped. */
  rawProbability: number;
  probability: number;
  modelVersion: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * The model itself: a product of declared multipliers over a cause-specific base rate.
 *
 * Multiplicative rather than additive so that no single term can carry a probability on its
 * own — a personalised third-attempt email to a B2B customer with a dead mandate should be
 * close to hopeless, and a sum of positive terms would not say so.
 */
export function computePayProbability(input: OutreachOutcomeInput): ProbabilityBreakdown {
  const baseRate = BASE_RATE_BY_ERROR_REASON[input.errorReason] ?? BASE_RATE_FALLBACK;
  const channelMultiplier = CHANNEL_MULTIPLIER[input.channel] ?? CHANNEL_MULTIPLIER.sms;

  const decayIndex = clamp(input.attemptNumber - 1, 0, ATTEMPT_DECAY.length - 1);
  const attemptMultiplier = ATTEMPT_DECAY[decayIndex];

  const personalisationMultiplier = input.isTemplateFallback
    ? TEMPLATE_MULTIPLIER
    : PERSONALISATION_MULTIPLIER;

  const segmentMultiplier = SEGMENT_MULTIPLIER[input.segment] ?? SEGMENT_MULTIPLIER.b2c;

  const rawProbability =
    baseRate *
    channelMultiplier *
    attemptMultiplier *
    personalisationMultiplier *
    segmentMultiplier;

  return {
    baseRate,
    channelMultiplier,
    attemptMultiplier,
    personalisationMultiplier,
    segmentMultiplier,
    rawProbability,
    probability: clamp(rawProbability, PROBABILITY_FLOOR, PROBABILITY_CEILING),
    modelVersion: RESPONSE_MODEL_VERSION,
  };
}

export interface OutcomeDecision extends ProbabilityBreakdown {
  paid: boolean;
  /** The draw that produced the decision, recorded so any outcome can be re-checked by hand. */
  draw: number;
}

/**
 * Draws one outcome. The RNG is passed in rather than created here so the caller owns
 * reproducibility — see `deriveOutcomeSeed` for how a draw is pinned to a specific attempt.
 */
export function willPay(input: OutreachOutcomeInput, rng: SeededRNG): OutcomeDecision {
  const breakdown = computePayProbability(input);
  const draw = rng.next();
  return { ...breakdown, paid: draw < breakdown.probability, draw };
}
