# Simulation Response Model

**Status:** active · **Model version:** 1.0.0 · **Implemented in:** [`src/lib/simulation/response-model.ts`](../src/lib/simulation/response-model.ts) · **Issue:** RA-23

Every recovery figure in this project is a **simulation output against the model described on
this page**. None of it is recovered rupees. The batch is synthetic, the customers are
synthetic, and whether one of them pays is decided here — by a declared function over declared
coefficients, drawn from a fixed seed.

---

## Why this file exists

The README cited this document before it was written. In that state the only route a journey
had to `resolved` was a human clicking **Pay** in the simulator UI, which meant two things:

1. The dashboard's recovery rate was a count of button presses.
2. Nothing the agent did — personalised copy, channel escalation, per-failure strategy
   selection — had any path to influence an outcome. The system's central claim was untestable
   by construction.

The model fixes the second problem, which is the one that matters. A coefficient that responds
to the agent's choices is what turns "the AI helps" into a question with an answer.

## What the model may see

```ts
interface OutreachOutcomeInput {
  errorReason: string;        // the root cause the customer has to overcome
  attemptNumber: number;      // 1-based
  channel: 'whatsapp' | 'sms' | 'email' | 'voice';
  segment: 'b2c' | 'b2b';
  isTemplateFallback: boolean; // true when the deterministic template shipped
}
```

Deliberately narrow. The message text, the strategy name, and the LLM's own reasoning are all
withheld, so the model cannot reward the agent for sounding confident — only for the observable
properties of what it actually sent.

## The function

```
probability = clamp(
    baseRate(errorReason)
  × channelMultiplier(channel)
  × attemptDecay(attemptNumber)
  × personalisation(isTemplateFallback)
  × segmentMultiplier(segment),
  0.01, 0.95)

paid = rng.next() < probability
```

Multiplicative rather than additive, so no single term can carry an outcome on its own: a
personalised third-attempt email to a B2B customer with a dead mandate should be close to
hopeless, and a sum of positive terms would not say so.

---

## Coefficients

> **Every number below is an estimate.** None is fitted to observed recovery data — this project
> has none. They are declared in advance and version-controlled so that the comparison they feed
> cannot be tuned after the results are in. Where a value is a judgement call, the reasoning is
> given rather than a citation we cannot support. Replacing these with figures from a real
> dunning dataset is the single highest-value follow-up to this work.

### Base rate by error reason

Probability a customer completes payment after **one** outreach, before any modifier: WhatsApp,
first attempt, B2C, template copy. Keyed by root cause, because the cause decides how much work
recovery asks of the customer.

| `error_reason` | Base rate | Reasoning (estimated) |
| :--- | ---: | :--- |
| `gateway_technical_error` | 0.55 | Nothing is wrong on the customer's side; a retry usually clears it. |
| `authentication_failed` | 0.45 | Transient — re-entering an OTP costs the customer one tap. |
| `insufficient_funds` | 0.34 | Intent exists; recovery waits on the customer's balance, not their willingness. |
| `payment_cancelled` | 0.30 | Hesitation at checkout. Persuadable, but the doubt is real. |
| `card_declined` | 0.28 | Issuer-side refusal; often needs a different instrument. |
| `checkout_abandonment` | 0.42 | No instrument was ever declined; the customer simply left. |
| `invoice_overdue` | 0.26 | Nothing is broken — the payment is waiting on someone's process. |
| `card_expired` | 0.22 | Requires the customer to fetch and enter a new card. |
| `mandate_inactive` | 0.18 | Re-authorising an e-mandate is a multi-step banking flow. |
| `bank_account_invalid` | 0.12 | The account itself is wrong; nearly always needs support contact. |
| *anything else* | 0.25 | Declared mid-range fallback, so an unseen cause degrades visibly rather than silently. |

### Channel multiplier

WhatsApp is the reference (1.00) because it is the seeded batch's primary channel.

| Channel | Multiplier | Reasoning (estimated) |
| :--- | ---: | :--- |
| `whatsapp` | 1.00 | Reference. |
| `voice` | 0.90 | Highest attention when answered, but many calls are not answered. |
| `sms` | 0.78 | Reliably delivered, easily ignored. |
| `email` | 0.55 | Slowest, and the most likely to be filtered. |

### Attempt decay

| Attempt | Multiplier | Reasoning (estimated) |
| :--- | ---: | :--- |
| 1 | 1.00 | Reference. |
| 2 | 0.62 | A customer who ignored the first message is, by revealed preference, a worse prospect. |
| 3+ | 0.38 | Steeper than fatigue alone; attempts past the declared ladder hold this value. |

### Personalisation delta

| Message source | Multiplier |
| :--- | ---: |
| LLM-generated copy (`is_template_fallback = false`) | **1.18** |
| Deterministic template fallback (`is_template_fallback = true`) | 1.00 |

This is the coefficient that makes "did the LLM help?" a real question, and it is the one to be
most suspicious of, because it is the one this project benefits from. It is set deliberately
modest: a large delta would manufacture our own headline result. A reader who thinks 1.18 is
generous should read every lift number as scaled by their own estimate instead — that is exactly
why the coefficient is a named constant on this page rather than a hidden term.

### Segment multiplier

| Segment | Multiplier | Reasoning (estimated) |
| :--- | ---: | :--- |
| `b2c` | 1.00 | Reference. |
| `b2b` | 0.85 | B2B payments route through approval chains that no message can shorten. |

### Bounds

Clamped to **[0.01, 0.95]**. No outcome is ever certain, and none is ever impossible.

---

## The three arms, and common random numbers

The seeded batch materialises the **same 50 failures into three cohorts** (RA-22), tagged
`payment_failures.arm`:

| Arm | Behaviour | Question it answers |
| :--- | :--- | :--- |
| **A** | Detected and recorded; never contacted. `no_outreach`, `maxAttempts: 0`. | What does doing nothing cost? |
| **B** | Fixed cadence (24h), one channel, one template, no LLM anywhere. `rules_only`. | How much comes from any dunning at all? |
| **C** | Classification, per-failure strategy, personalised copy, channel escalation. | What does the intelligence add? |

Cloning the batch rather than partitioning it holds the failure mix, the amounts and the customer
segments identical across arms by construction. Partitioning 50 failures three ways would have
left ~17 per arm and a mix that matched only approximately.

**Common random numbers.** Every failure carries a `simulation_key` that is the same in all three
cohorts, and the model draws on that key rather than on the row id. So the same synthetic customer
faces the *same* uniform draw in every arm, and the difference between arms is the probability the
agent's choices earned — not which arm got luckier. Without this, at n=50 per arm the sampling
noise (≈7 points) would swamp the effect being measured.

Arm B is enforced, not merely intended: `tests/three-arm-baseline.test.ts` fails if
`classifyFailureWithLLM` or `generateRecoveryMessage` is reached on an Arm B journey. Generating
personalised copy and then discarding it would leave the baseline carrying the agent's cost and
latency, and would make the C − B delta measure nothing.

## Current measured result

Recorded 2026-09-01, seed `20260823`, `RECOVERAI_MODE=mock`, one seeded batch run to exhaustion:

| Arm | Recovery rate (by amount) | n |
| :--- | ---: | ---: |
| A · no agent | 0.0% | 50 |
| B · rules-only dunning | 22.7% | 50 |
| C · full agent | 21.6% | 50 |

**C − B = −1.1 points.** The agent currently measures slightly *worse* than a cron job with one
template. Reported here because the README promises it: *"if C turns out to be roughly equal to B,
that gets reported too."*

Two identified causes, neither of them a defect in the arms:

1. **Mock mode nullifies the personalisation coefficient.** Without a live `GEMINI_API_KEY`
   (RA-24) Arm C ships the same deterministic template as Arm B, so `is_template_fallback` is
   true in both arms and the ×1.18 term — the only coefficient that rewards the agent's messaging
   — never fires in either.
2. **The model's channel term is unconditional, so escalation can only lose.** Arm C moves to SMS
   (×0.78) and voice (×0.90) on attempts 2 and 3 while Arm B stays on WhatsApp (×1.00), and
   `invoice_reminder` opens on email (×0.55) for the ten B2B invoices. The model has no notion of
   an appropriate channel for a context, nor of renewed reach after an ignored message, so a
   channel switch is scored as pure loss.

**The coefficients were not changed after seeing this result**, and this section is the reason to
be suspicious of anyone who does. Cause 2 is a real weakness in the model rather than a finding
about the agent, and fixing it means a channel term that varies by segment and failure type —
declared before the next run, not after it.

## Seeding and reproducibility

- The model's seed is `SIMULATION_SEED` (default `20260823`), read via `getSimulationSeed()`.
- It is **not** the fixture seed (`12345`, in `src/lib/db/seed.ts`). One shared seed would mean
  that adding a name to the synthetic customer list silently moves every recovery outcome.
- Each draw gets its own RNG, seeded by FNV-1a over `SIMULATION_SEED` and the natural key
  `{failure_id}:attempt:{n}`. A single shared stream would make each draw depend on how many
  journeys happened to be processed before it, so adding one failure to the batch would move
  every later outcome.
- Journey and action ids are nanoids and never touch the draw, so a re-seeded batch — new ids,
  same failures — replays to the same outcomes. `tests/simulation-batch-determinism.test.ts`
  asserts exactly this.

## Where it runs, and where it does not

`POST /api/recovery/trigger` dispatches outreach through the coordinator, then asks the model
which of those attempts converted, then hands the recoveries back to the coordinator to resolve.
`POST /api/recovery/sweep` does the same for the outreach its abandonment pass dispatches — a
sweep-only deployment would otherwise accumulate journeys that never resolve.

Each recovery names the attempt that converted, so the conversion is credited to the outreach
that caused it rather than to whichever attempt happens to be newest — the two can differ when
a sweep's attempt 1 and a batch run's attempt 2 are outstanding at the same time.

That composition happens **in the API route**, and this is load-bearing:

- Nothing under `src/lib/simulation/` imports `src/lib/recovery/` or `src/lib/ai/`.
- Nothing under `src/lib/recovery/` or `src/lib/ai/` imports `src/lib/simulation/`.

The agent cannot read the model it is scored against, so it cannot mark its own homework. Both
directions are asserted in `tests/simulation-response-model.test.ts` and the first is also
enforced in CI by the architectural boundary job in `.github/workflows/pr-governance.yml`.

**In `RECOVERAI_MODE=live` no draw is ever taken.** Real customers and real Razorpay webhooks
decide outcomes; inventing recoveries alongside them would corrupt a real merchant's numbers.

The manual **Pay** button in the simulator still works, so the live demo keeps its moment. It is
now additive rather than the only source of outcomes.

`GET /api/metrics` reports which of the two produced its numbers, under `provenance`, and the
dashboard's simulation notice reads that field. Labelling a real recovery as simulated is the
same class of error as the reverse, so the notice is not hardcoded.

## Audit trail

Every draw — including the ones that did not convert — is written to `audit_logs` as
`simulated_response_drawn`, carrying the probability, the raw draw, the model version, the seed,
and each multiplier separately. An evaluation that logs only its successes is not an evaluation,
and the breakdown is recorded so any single outcome can be recomputed by hand from this page.

## Known limitations

1. **The coefficients are estimates, not measurements.** Stated above, repeated here because it
   is the most important sentence on the page.
2. **One draw per outreach, no partial payments.** A converted journey recovers its full
   `amount_at_risk`; real recovery sees part-payments and payment plans.
3. **No time-of-day or day-of-week effect.** Contact hours are enforced by the agent's stopping
   rules, but the model does not treat a 9am message as different from a 6pm one.
4. **No channel appropriateness, and no renewed reach.** The channel multiplier is a single
   unconditional ranking, so email is scored the same for a B2B invoice as for a B2C card
   decline, and switching channel after an ignored message earns nothing for having reached the
   customer somewhere new. This makes escalation strictly costly under the model — see "Current
   measured result".
5. **No cross-journey memory.** A customer who ignored a previous failure's outreach is not
   modelled as less likely to respond to the next one.
6. **In `RECOVERAI_MODE=mock` the personalisation coefficient never fires.** With no
   `GEMINI_API_KEY`, `generateRecoveryMessage` always returns the deterministic template, so
   every action carries `is_template_fallback = true` and every draw uses the 1.00 multiplier.
   A mock-mode run therefore cannot demonstrate LLM lift — it measures the cadence and the
   channel ladder only. Configure a real key (see RA-24) before quoting any personalisation
   result; a batch run without one is not evidence for or against the LLM path.
7. **The response is binary and immediate.** There is no notion of a customer who intends to pay
   later, so `avg recovery time` reflects the agent's cadence rather than customer behaviour.
