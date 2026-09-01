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
4. **No cross-journey memory.** A customer who ignored a previous failure's outreach is not
   modelled as less likely to respond to the next one.
5. **In `RECOVERAI_MODE=mock` the personalisation coefficient never fires.** With no
   `GEMINI_API_KEY`, `generateRecoveryMessage` always returns the deterministic template, so
   every action carries `is_template_fallback = true` and every draw uses the 1.00 multiplier.
   A mock-mode run therefore cannot demonstrate LLM lift — it measures the cadence and the
   channel ladder only. Configure a real key (see RA-24) before quoting any personalisation
   result; a batch run without one is not evidence for or against the LLM path.
6. **The response is binary and immediate.** There is no notion of a customer who intends to pay
   later, so `avg recovery time` reflects the agent's cadence rather than customer behaviour.
