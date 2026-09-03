# Simulation Response Model

**Status:** active · **Model version:** 1.1.0 · **Implemented in:** [`src/lib/simulation/response-model.ts`](../src/lib/simulation/response-model.ts) · **Issue:** RA-23

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
  previousChannel: 'whatsapp' | 'sms' | 'email' | 'voice' | null;
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
  × channelFit(channel, segment)
  × repeatedChannel(channel, previousChannel)
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

### Channel fit, by segment

How well a channel fits the person being contacted. Until v1.1.0 this was a single unconditional
ranking, which asserted that email is a poor channel for everyone — so routing a B2B overdue
invoice to email, which is simply how businesses pay invoices, scored as a mistake (RA-32).

| Channel | B2C | B2B | Reasoning (estimated) |
| :--- | ---: | ---: | :--- |
| `whatsapp` | 1.00 | 0.85 | B2C reference. Reaches a business *person*, but not the accounts inbox that pays. |
| `voice` | 0.90 | 0.80 | Highest attention when answered; many calls are not answered. A B2B call still has to be routed internally. |
| `sms` | 0.78 | 0.60 | Reliably delivered, easily ignored. Effectively a consumer channel. |
| `email` | 0.55 | **1.00** | Slow and filterable for a consumer; where invoices live, and the only channel with a paper trail a finance team accepts. |

**The B2C column is unchanged from v1.0.0.** Only the B2B column is new.

### Repeated-channel decay

| Situation | Multiplier |
| :--- | ---: |
| First attempt, or a different channel from the previous attempt | 1.00 |
| Same channel as the immediately preceding attempt | **0.85** |

Expressed as a penalty for repeating rather than a bonus for switching, deliberately: a switch
bonus would credit the agent for the act of escalating, while this says only that an identical
message reaches someone who already ignored one less well.

*Double-counting caveat, recorded rather than resolved:* `ATTEMPT_DECAY` already models a
customer's willingness decaying with each attempt. This term models reach and attention instead —
related, and not perfectly separable. 0.85 is modest for that reason.

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
segments identical across arms by construction. Only the seeded cohorts enter the comparison: a
failure arriving from a live webhook is stamped arm `C` so the agent handles it and the dashboard
counts it, but it has no counterpart in arms A and B, and letting it in would destroy the very
property this design exists for. Seeded rows carry a `simulation_key`; ingested ones do not, which
is what the metrics query filters on. Partitioning 50 failures three ways would have
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

Reproduce with `npm run eval:arms` — 25 replications, seeds from `20260823` in steps of 7919,
24-day window, `RECOVERAI_MODE=mock`. Recorded 2026-09-01, model v1.1.0.

| Arm | By amount | By journeys | Attempts / journey |
| :--- | ---: | ---: | ---: |
| A · no agent | 0.0% ± 0.0 | 0.0% ± 0.0 | 0.00 |
| B · rules-only dunning | 35.1% ± 12.7 | 43.5% ± 6.9 | 2.26 |
| C · full agent | 37.9% ± 11.5 | 44.2% ± 7.1 | 2.25 |

| C − B | Mean | SE | Range | t |
| :--- | ---: | ---: | :--- | ---: |
| by amount | **+2.82 pts** | 0.80 | [−0.2, 11.8] | 3.5 |
| by journeys | **+0.72 pts** | 0.26 | [−2.0, 4.0] | 2.8 |

Positive in 24 of 25 replications.

### Read this before quoting the number above

**The sign of this result changed when v1.1.0 landed, and v1.1.0 was written after v1.0.0
produced a result unfavourable to the agent.** That is the exact pattern a reader should be
suspicious of, so here is the full accounting.

Under v1.0.0 the same harness measured **C − B = −7.07 pts** (t = −5.4, negative in 20/25). The
two v1.1.0 coefficients were declared in advance in RA-32 — the issue was filed with the numbers
in it before the model was touched — but they were still chosen with the −7.07 already known.
What defends them is not neutrality; it is that v1.0.0's channel term embedded an assumption
("switching channels is pure loss; email is bad for everyone") that was never argued for and is
less defensible than this one. A reader who disagrees can rescale: the B2B email cell and the
0.85 repeat term are the only two numbers that moved.

**Ablation** — each term measured alone, 25 replications, by amount:

| Configuration | Arm B | Arm C | C − B | t |
| :--- | ---: | ---: | ---: | ---: |
| v1.0.0 — neither term | 42.4% | 35.3% | −7.07 | −5.4 |
| Channel fit only | 37.7% | 37.9% | +0.25 | 0.4 |
| Repeat decay only | 37.9% | 35.3% | −2.56 | −1.7 |
| v1.1.0 — both | 35.1% | 37.9% | **+2.82** | 3.5 |

Three things follow, and all three belong next to the headline:

1. **Neither term alone produces a significant result.** Fit alone lands at +0.25 (t = 0.4);
   repeat decay alone stays negative at −2.56. Only the combination clears significance.
2. **Most of the movement is Arm B falling, not Arm C rising.** Across the ~10-point swing, Arm B
   drops 7.3 points (42.4 → 35.1) while Arm C gains 2.6 (35.3 → 37.9). The agent did not get
   better; the baseline stopped being flattered by a model that ignored channel repetition.
3. **By journey count the advantage is small.** +0.72 points is under half a journey in 50. The
   rupee-weighted +2.82 comes mostly from the ten B2B invoices — the largest amounts in the
   batch — being routed to email. The honest one-line summary is: *under this model, the agent's
   measurable edge is that it sends invoices by email.*

The personalisation coefficient still never fires in mock mode, so this remains a measurement of
routing and cadence, not of the LLM. Nothing here is evidence for or against personalised copy —
that needs RA-24.

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
4. **Channel fit is coarse, and repetition decay may double-count.** As of v1.1.0 the channel
   term varies by segment and a repeated channel decays (RA-32), but fit still ignores failure
   type — an expired card and an overdue invoice route the same way for the same segment — and
   the repeat term overlaps conceptually with `ATTEMPT_DECAY`. See the caveat under
   "Repeated-channel decay".
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
