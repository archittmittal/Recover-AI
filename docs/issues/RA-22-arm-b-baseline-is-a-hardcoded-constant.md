<!-- labels: critical,demo-integrity,dashboard,quality -->
# RA-22 — The three-arm baseline comparison is a hardcoded constant, not a measurement

**Severity:** Critical · **Area:** `src/app/api/metrics/route.ts` · **Est:** 4-6 h

## Summary
The README stakes the project's entire credibility framing on a controlled three-arm experiment. No such experiment exists. Arm A and Arm B are literal constants typed into the metrics route, and the "net AI lift" headline on the dashboard is `measured_C − 31.5`, where `31.5` has no source, no derivation, and no run behind it.

This is the highest-risk item in the repository. Not because it is the worst bug — it is a five-line file — but because the honesty framing is our strongest differentiator with the judges, and one `grep` turns it into the opposite.

## Location
`src/app/api/metrics/route.ts:217-220`, surfaced at `src/components/dashboard/MetricsCards.tsx:69-71` and `src/components/dashboard/RecoveryChart.tsx:38-41`.

## Evidence
```ts
const baselineArmARate = 0;
const baselineArmBRate = 31.5;          // ← no run, no source, no derivation
const armCRate = recoveryRatePct;        // ← the only real number here
const liftOverBaseline = Number((armCRate - baselineArmBRate).toFixed(1));
```

What the README promises, by contrast:

> Every batch therefore runs three arms over identical seeded data.
> **The honest headline is C minus B.** [...] The comparison is built before any numbers exist,
> so the framing cannot be picked after the fact — and if C turns out to be roughly equal to B,
> that gets reported too.

None of that is true as implemented. C cannot come out equal to B, because B is not computed.

`31.5` appears in exactly two other places, both of which assert it as a finding rather than sourcing it:
- `docs/TASKS.md:146` marks task 8.3 "Baseline comparison harness (arms A/B/C)" as **✅ complete**.
- `docs/DEMO_SCRIPT.md:14` instructs the presenter to narrate it live as a *"Controlled scientific baseline comparison"* with *"Net lift **+18.5% incremental recovery**"*.

## Impact
A judge who opens the metrics route finds a fabricated experimental control being presented as a measured result. That is materially worse than having no baseline at all: it converts "we didn't get to the evaluation harness" (a scoping admission every hackathon project makes) into "we asserted a scientific claim we knew was hardcoded." The `demo-integrity` risk contaminates the surrounding honest work — the deterministic/LLM split, the audit trail, the stopping rules — because a judge who catches this stops trusting the rest of the README.

Note also that Arm C is not currently a trustworthy number either — see RA-23. Fixing this issue without RA-23 yields a real subtraction between two arbitrary quantities.

## Proposed fix
Two acceptable outcomes. Pick one and make the docs match it exactly.

**Option 1 — build the harness (preferred, and the code is already shaped for it).**
The strategy engine and the LLM call sites are cleanly separated, so a rules-only arm is a config flag, not a rewrite:
1. Add an `arm: 'A' | 'B' | 'C'` column to `recovery_journeys`, assigned at seed time by deterministic partition of the batch (or run the same seeded batch three times into three tagged cohorts — preferred, since it holds the failure mix identical across arms).
2. Arm A: `detect and record only` — create the journey, never dispatch. Arm B: fixed cadence, template message from `getTemplateFallbackMessage`, no `classifyFailureWithLLM`, no per-failure strategy selection, no channel escalation. Arm C: the current path, unchanged.
3. Compute all three rates in `metrics/route.ts` with the same `SUM(amount_recovered)/SUM(amount_at_risk)` expression already used for `recoveryRatePct`. Delete the constants.
4. Report the delta with its arm sizes (`n=` per arm) so the number is inspectable.

**Option 2 — remove the claim.**
Delete `baselineComparison` from the API response, the Net-Lift card, and the arm chart. Strike the "How the results are measured" section from the README, task 8.3 from `TASKS.md`, and the 3-arm segment from `DEMO_SCRIPT.md`. Replace with a one-paragraph "Evaluation: not yet built" note stating what we would measure and why we ran out of time. This is a weaker submission than Option 1 but a stronger one than the status quo.

Whichever is chosen, `docs/TASKS.md:146` must stop saying ✅ until it is true.

## Acceptance criteria
- [ ] No numeric literal in `src/app/api/metrics/route.ts` stands in for a measured rate
- [ ] Arm A and Arm B rates are either computed from rows in the database, or absent from the API and the UI entirely
- [ ] If built: a test seeds a batch, runs all three arms, and asserts each arm's rate is derived from that arm's own journeys
- [ ] If built: Arm B genuinely makes no LLM call — asserted by a test that fails if `classifyFailureWithLLM` or `generateRecoveryMessage` is reached on an Arm B journey
- [ ] `docs/DEMO_SCRIPT.md` contains no number the code cannot reproduce live
- [ ] `docs/TASKS.md:146` reflects the real state of task 8.3
- [ ] README's "How the results are measured" section describes what the code actually does

## Related
RA-23 (Arm C is not a measured quantity either — fix together, the pair is one story), RA-13 (same class of defect: a dashboard figure pinned to a constant)
