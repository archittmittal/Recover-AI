<!-- labels: critical,demo-integrity,quality,testing -->
# RA-23 — The declared simulation response model does not exist; recovery outcomes come from demo clicks

**Severity:** Critical · **Area:** `src/lib/simulation/`, `src/app/api/simulator/pay/route.ts` · **Est:** 3-4 h

## Summary
The README cites `docs/SIMULATION_MODEL.md` for *"a declared response model with benchmark-sourced coefficients... driven by a fixed seed."* That file does not exist, and neither does the model. `SeededRNG` is used only to generate the failure *fixtures*; nothing anywhere decides whether a simulated customer pays. The only way a journey reaches `resolved` is a human clicking "Pay" in the simulator UI, or a webhook arriving.

Consequence: the recovery rate on the dashboard — Arm C, the one number in the three-arm comparison that is supposedly real — is a count of how many times the presenter clicked a button.

## Location
- `src/lib/simulation/rng.ts` — the whole simulation module; a seeded PRNG and nothing else
- `src/lib/db/seed.ts:23` — the only consumer: `new SeededRNG(12345)`, used for fixture generation
- `src/app/api/simulator/pay/route.ts:43` — the sole path to `resolved`, driven by a UI click
- `README.md` — cites `docs/SIMULATION_MODEL.md` twice; the file is absent from `docs/`

## Evidence
Every use of the seeded RNG is fixture generation — customer names, amounts, error codes. Grepping the source for any behavioural model returns nothing:

```
$ grep -rniE "probab|responseRate|willPay|payProbability" src/
src/app/api/metrics/route.ts:15:  conversionRatePct: number;      ← a reporting field, not a model
src/lib/recovery/coordinator.ts:525: // Attribute the conversion to the most recent outreach action
```

And the resolution path takes no model input at all:
```ts
// src/app/api/simulator/pay/route.ts
const amountToRecover = journey.amountAtRisk;
await recoveryCoordinator.resolveJourneyWithPayment(journey.id, payId, amountToRecover);
```
A click, a full-amount recovery. No channel effect, no message-quality effect, no attempt-number decay, no seed.

## Impact
1. **Arm C is not a measurement.** Combined with RA-22's hardcoded Arm B, the headline "+18.5% net AI lift" is a subtraction between a constant and a click-count. Neither operand is evidence.
2. **The agent's intelligence is unfalsifiable.** If message personalisation, channel escalation, and per-failure strategy selection have no path to influence an outcome, then nothing in the system can demonstrate that they work. The whole thesis of the project is currently untestable by construction.
3. **The README's most careful-sounding paragraph is the least true one.** The passage about not letting the agent "mark its own homework" describes a discipline that was never implemented, which reads worse than never having raised the concern.

## Proposed fix
Write the response model the README already promises, and keep it strictly outside the agent's reach.

1. **Create `src/lib/simulation/response-model.ts`.** A pure function:
   `willPay(journey, action, rng) -> boolean`, with the probability assembled from declared, individually-cited coefficients:
   - base rate by `failure_type` (a soft card decline should convert far better than an expired mandate)
   - channel multiplier (WhatsApp > SMS > voice)
   - attempt-number decay
   - a personalisation delta applied *only* when the message came from the LLM path rather than the template fallback — this is the coefficient that makes Arm C vs Arm B a real question
   - customer `segment` multiplier
2. **Seed it independently.** `new SeededRNG(SIM_SEED)` distinct from the fixture seed, so changing fixture generation does not silently move outcomes.
3. **Enforce the separation the README claims.** The model imports nothing from `src/lib/recovery/` or `src/lib/ai/`; the agent imports nothing from `src/lib/simulation/response-model.ts`. Add a test asserting both directions — this is what makes "the agent cannot import that model" a fact rather than an intention.
4. **Drive the batch run from it.** `POST /api/recovery/trigger` advances journeys and consults the model for each dispatched action. Keep the manual "Pay" button for the live demo moment, but it must be additive, not the only source of outcomes.
5. **Write `docs/SIMULATION_MODEL.md`.** Every coefficient, its source, and the honest caveat: these are simulation outputs against a declared model, not recovered rupees. If a coefficient is a guess, label it a guess — a documented guess is defensible, an undocumented one is not.
6. **Label the UI.** Dashboard figures read "simulated" wherever they derive from the model.

If time runs out, the fallback is the same as RA-22's Option 2: delete the claim from the README rather than leave it pointing at a file that was never written.

## Acceptance criteria
- [ ] `docs/SIMULATION_MODEL.md` exists and documents every coefficient with a source or an explicit "estimated"
- [ ] Running a batch twice with the same seed produces identical recovery outcomes
- [ ] Changing only the simulation seed changes outcomes; changing only agent code does not change the *model*
- [ ] A test asserts no module under `src/lib/recovery/` or `src/lib/ai/` imports the response model, and vice versa
- [ ] Arm B and Arm C (RA-22) diverge only through coefficients the model declares
- [ ] Every dashboard number sourced from the model is labelled as simulation output
- [ ] README no longer references a file that does not exist

## Related
RA-22 (the other half of this story — the two must land together or the comparison stays meaningless), RA-13 (channel metrics have nothing real to report until outcomes vary by channel)
