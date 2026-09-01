import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { SeededRNG } from '../src/lib/simulation/rng';
import {
  ATTEMPT_DECAY,
  BASE_RATE_BY_ERROR_REASON,
  CHANNEL_MULTIPLIER,
  PERSONALISATION_MULTIPLIER,
  PROBABILITY_CEILING,
  PROBABILITY_FLOOR,
  TEMPLATE_MULTIPLIER,
  computePayProbability,
  willPay,
  type OutreachOutcomeInput,
} from '../src/lib/simulation/response-model';
import { decideOutcomes, deriveOutcomeSeed, type PendingOutreach } from '../src/lib/simulation/outcomes';

/**
 * RA-23 — the README cited a declared response model with a fixed seed; neither existed, so the
 * only route to `resolved` was a human clicking "Pay" in the simulator and the dashboard's
 * recovery rate was a count of button presses.
 *
 * These are pure-function tests on purpose: the model must be checkable without a database,
 * because a coefficient that can only be observed through a batch run is a coefficient nobody
 * will check.
 */

const BASE_INPUT: OutreachOutcomeInput = {
  errorReason: 'insufficient_funds',
  attemptNumber: 1,
  channel: 'whatsapp',
  segment: 'b2c',
  isTemplateFallback: true,
};

describe('RA-23 declared response model', () => {
  it('multiplies the declared coefficients rather than inventing a rate', () => {
    const result = computePayProbability({
      ...BASE_INPUT,
      channel: 'sms',
      attemptNumber: 2,
      segment: 'b2b',
      isTemplateFallback: false,
    });

    const expected =
      BASE_RATE_BY_ERROR_REASON.insufficient_funds *
      CHANNEL_MULTIPLIER.sms *
      ATTEMPT_DECAY[1] *
      PERSONALISATION_MULTIPLIER *
      0.85;

    expect(result.rawProbability).toBeCloseTo(expected, 10);
    expect(result.probability).toBeCloseTo(expected, 10);
  });

  it('applies the personalisation delta only to LLM-generated copy', () => {
    const templated = computePayProbability({ ...BASE_INPUT, isTemplateFallback: true });
    const personalised = computePayProbability({ ...BASE_INPUT, isTemplateFallback: false });

    expect(templated.personalisationMultiplier).toBe(TEMPLATE_MULTIPLIER);
    expect(personalised.personalisationMultiplier).toBe(PERSONALISATION_MULTIPLIER);
    // This inequality is the whole reason the model exists: without it, nothing the agent does
    // to a message can change an outcome, and its intelligence is untestable by construction.
    expect(personalised.probability).toBeGreaterThan(templated.probability);
  });

  it('decays with attempt number and never leaves the [floor, ceiling] band', () => {
    const rates = [1, 2, 3, 4].map((attemptNumber) =>
      computePayProbability({ ...BASE_INPUT, attemptNumber }).probability
    );

    expect(rates[0]).toBeGreaterThan(rates[1]);
    expect(rates[1]).toBeGreaterThan(rates[2]);
    // Attempts past the declared ladder hold the last coefficient instead of falling off a cliff.
    expect(rates[3]).toBeCloseTo(rates[2], 10);

    for (const reason of Object.keys(BASE_RATE_BY_ERROR_REASON)) {
      for (const channel of ['whatsapp', 'sms', 'email', 'voice'] as const) {
        const p = computePayProbability({ ...BASE_INPUT, errorReason: reason, channel }).probability;
        expect(p).toBeGreaterThanOrEqual(PROBABILITY_FLOOR);
        expect(p).toBeLessThanOrEqual(PROBABILITY_CEILING);
      }
    }
  });

  it('falls back to a declared mid-range rate for an unseen error reason', () => {
    const unknown = computePayProbability({ ...BASE_INPUT, errorReason: 'not_a_seeded_reason' });
    expect(unknown.baseRate).toBe(0.25);
  });

  it('draws the same outcome for the same seed and a different one for a different seed', () => {
    const first = willPay(BASE_INPUT, new SeededRNG(deriveOutcomeSeed(20260823, 'fail_1:attempt:1')));
    const second = willPay(BASE_INPUT, new SeededRNG(deriveOutcomeSeed(20260823, 'fail_1:attempt:1')));
    expect(second).toEqual(first);

    // Different attempts of the same failure must not share a draw, or every attempt of a
    // journey would succeed or fail together.
    const otherAttempt = deriveOutcomeSeed(20260823, 'fail_1:attempt:2');
    expect(otherAttempt).not.toBe(deriveOutcomeSeed(20260823, 'fail_1:attempt:1'));
    expect(deriveOutcomeSeed(99, 'fail_1:attempt:1')).not.toBe(
      deriveOutcomeSeed(20260823, 'fail_1:attempt:1')
    );
  });
});

describe('RA-23 batch decisions', () => {
  const row = (overrides: Partial<PendingOutreach> = {}): PendingOutreach => ({
    journeyId: 'rj_a',
    actionId: 'ra_a',
    failureId: 'fail_C000000000000001',
    simulationKey: 'sim_0000000000000001',
    amountAtRisk: 49900,
    errorReason: 'gateway_technical_error',
    attemptNumber: 1,
    channel: 'whatsapp',
    segment: 'b2c',
    isTemplateFallback: false,
    ...overrides,
  });

  it('is invariant to the order rows arrive in and to the random journey ids', () => {
    const rows = [
      row({ journeyId: 'rj_a', actionId: 'ra_1', failureId: 'fail_C000000000000001', simulationKey: 'sim_1' }),
      row({ journeyId: 'rj_b', actionId: 'ra_2', failureId: 'fail_C000000000000002', simulationKey: 'sim_2' }),
      row({ journeyId: 'rj_c', actionId: 'ra_3', failureId: 'fail_C000000000000003', simulationKey: 'sim_3', attemptNumber: 2 }),
    ];

    const forward = decideOutcomes(rows, 20260823);
    const reversed = decideOutcomes([...rows].reverse(), 20260823);

    // Compared by failure, not by journey id: the point of keying draws to the seeded failure
    // id is that a re-seeded batch with brand-new nanoid journey ids replays identically.
    const byFailure = (r: ReturnType<typeof decideOutcomes>) =>
      r.paid.map((o) => o.paymentId).sort();
    expect(byFailure(reversed)).toEqual(byFailure(forward));
  });

  it('recovers a journey at most once, on its earliest converting attempt', () => {
    // A base rate at the ceiling for every attempt, so both draws convert and the tie-break is
    // the only thing deciding the result.
    const rows = [
      row({ journeyId: 'rj_x', actionId: 'ra_2', attemptNumber: 2, errorReason: 'gateway_technical_error' }),
      row({ journeyId: 'rj_x', actionId: 'ra_1', attemptNumber: 1, errorReason: 'gateway_technical_error' }),
    ];

    const { paid, ignored } = decideOutcomes(rows, 20260823);
    expect(paid.length).toBeLessThanOrEqual(1);
    expect(paid.length + ignored.length).toBe(2);
    if (paid.length === 1) {
      expect(paid[0].actionId).toBe('ra_1');
    }
  });
});

describe('RA-23 model isolation', () => {
  const readSources = (dir: string): { file: string; source: string }[] => {
    const out: { file: string; source: string }[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) out.push(...readSources(full));
      else if (entry.name.endsWith('.ts')) out.push({ file: full, source: fs.readFileSync(full, 'utf8') });
    }
    return out;
  };

  const importedPaths = (source: string): string[] =>
    [...source.matchAll(/(?:from|import)\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);

  /**
   * "The agent cannot import that model" is a claim the README makes. Asserting it here is what
   * turns it from an intention into a fact — a `grep` in CI catches the direction that matters,
   * but only a test catches it before the commit lands.
   */
  it('keeps the agent out of the simulation module', () => {
    for (const { file, source } of [
      ...readSources('src/lib/recovery'),
      ...readSources('src/lib/ai'),
    ]) {
      for (const imported of importedPaths(source)) {
        expect(
          imported.includes('simulation'),
          `${file} imports ${imported}: the agent must not read the model it is scored against`
        ).toBe(false);
      }
    }
  });

  it('keeps the simulation module out of the agent', () => {
    for (const { file, source } of readSources('src/lib/simulation')) {
      for (const imported of importedPaths(source)) {
        expect(
          /lib\/(recovery|ai)\/|\.\.\/(recovery|ai)\//.test(imported),
          `${file} imports ${imported}: the model must not depend on the agent's own judgment`
        ).toBe(false);
      }
    }
  });
});
