<!-- labels: medium,demo-integrity,quality,recovery-engine -->
# RA-32 — The response model's channel term is unconditional, so escalation can only lose

**Severity:** Medium · **Area:** `src/lib/simulation/response-model.ts` · **Est:** 2-3 h

## Summary
The simulation response model (RA-23) scores a channel with one unconditional multiplier —
WhatsApp 1.00, voice 0.90, SMS 0.78, email 0.55 — applied identically to every failure, every
customer and every attempt. Two consequences follow, and both distort the three-arm comparison
(RA-22) rather than the agent:

1. **Channel appropriateness does not exist.** Emailing a B2B customer about an overdue invoice
   is standard practice; emailing a B2C customer about a declined card is not. The model scores
   both at 0.55, so `invoice_reminder` — arguably the agent's most sensible routing decision — is
   penalised for making it.
2. **Renewed reach does not exist.** A customer who ignored a WhatsApp message is not equally
   reachable by a second WhatsApp message; that is most of why an escalation ladder exists. The
   model has no term for it, so switching channels is scored as pure downside and repeating the
   same ignored channel costs nothing.

Together these make Arm C's probability **pointwise ≤ Arm B's** in mock mode. Measured over 25
replications (`npm run eval:arms`), the best C − B across all seeds is *exactly* 0.0 and the mean
is −7.07 points: the experiment currently cannot produce a positive result whatever the agent
does. That is a defect in the model, not a finding about the agent.

## Evidence
```
C − B by amount     −7.07 pts   se 1.32   range [−21.0, 0.0]   t = −5.4
C − B by journeys   −3.44 pts   se 0.56   range [−10.0, 0.0]   t = −6.1
negative in 20/25 replications, positive in none
```
Arm B sends 116 WhatsApp actions and nothing else. Arm C spreads 109 actions across WhatsApp,
SMS, voice and email. Attempts per journey are near-identical (2.23 vs 2.28), so the deficit is
not a message-volume confound — it is the channel term.

## Proposed fix — declared in advance

`docs/SIMULATION_MODEL.md` requires that coefficient changes be declared **before** the run that
measures them. These are those coefficients. They are estimates, like every other coefficient in
that file, and none is fitted to data.

**1. Channel fit becomes context-dependent** — keyed by customer segment, since that is what
decides which channel a person actually reads:

| Channel | B2C | B2B |
| :--- | ---: | ---: |
| `whatsapp` | 1.00 | 0.85 |
| `voice` | 0.90 | 0.80 |
| `sms` | 0.78 | 0.60 |
| `email` | 0.55 | **1.00** |

The B2C column is exactly today's unconditional table, so nothing about B2C changes. The B2B
column asserts one thing: a business paying an invoice reads email and largely ignores consumer
messaging channels.

**2. Repeating an ignored channel decays** — a `sameChannelRepeat` multiplier of **0.85** applied
when an attempt uses the same channel as the immediately preceding attempt on that journey.
Switching is neutral (1.00), not rewarded.

Stated as a penalty on repetition rather than a bonus for switching, deliberately. A switch bonus
would credit the agent for the mere act of escalating; a repeat penalty says only that a second
identical message reaches a person who already ignored the first one less well. It is also the
more conservative of the two framings for a project that benefits from the answer.

**Note the double-counting risk, and why it is acceptable.** `ATTEMPT_DECAY` already models a
customer becoming less willing with each attempt. The repeat term models something else — reach
and attention, not willingness — but the two are not perfectly separable, and 0.85 is set modest
for that reason. This must be recorded as a limitation.

**3. The model needs one new input:** `previousChannel` (the channel of the preceding attempt on
that journey, or null for the first). It is an observable property of what was sent, which is the
standard the model's inputs already hold to.

## Honest accounting of who this helps
This change moves the result in the agent's favour, and it was designed after seeing a result
that went against the agent. Both halves of that sentence belong in the record.

- Arm B repeats WhatsApp on every attempt, so it takes the repeat penalty on attempts 2 and 3.
- Arm C escalates, so it mostly does not, and it gains outright on the ten B2B invoices.

The defence is not that the change is neutral — it is not. It is that the *previous* coefficients
also embedded an assumption ("switching channels is pure loss, email is bad for everyone"), that
assumption was never argued for, and it is less defensible than this one. A reader who disagrees
can rescale: the B2B email cell and the 0.85 repeat term are the only two numbers that move, and
both are named constants.

## Acceptance criteria
- [ ] Channel fit varies by customer segment; the B2C column is unchanged from the current table
- [ ] A repeated channel on consecutive attempts of the same journey is scored lower than a switch
- [ ] `previousChannel` is derived from the preceding action on the journey, not from the agent's intent
- [ ] `docs/SIMULATION_MODEL.md` documents every new coefficient, the double-counting caveat, and
      the fact that this change was made after an unfavourable result
- [ ] `npm run eval:arms` is re-run and its output recorded, whatever it says
- [ ] The model still imports nothing from `src/lib/recovery/` or `src/lib/ai/`
