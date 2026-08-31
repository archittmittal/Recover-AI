<!-- labels: compliance,high,recovery-engine -->
# RA-06 — The contact-hours rule is switched off in the only path that sends messages

**Severity:** High · **Area:** `src/lib/recovery/coordinator.ts` · **Est:** 1 h

## Summary
The 8 AM – 7 PM IST contact window is implemented correctly, wired into the stopping-rules engine as rule 5, and covered by a dedicated test file with exact boundary cases — then disabled at the one call site that actually dispatches outreach.

## Location
`src/lib/recovery/coordinator.ts:148-154`

## Evidence
```ts
const stoppingCheck = evaluateStoppingRules({
  journeyStatus: journey.status,
  currentAttempt: journey.currentAttempt,
  maxAttempts: journey.maxAttempts,
  customerDndStatus: customer.dndStatus,
  checkContactHours: false,  // hardcoded — never true anywhere in src/
});
```
The inline comment reads *"In batch simulation/tests we simulate scheduled execution."* A test-mode convenience became the production default. `grep -rn "checkContactHours: true" src` returns nothing.

`calculateNextScheduledTime` does compute a correctly deferred 8 AM slot, but its output is written to a column nobody reads — see RA-07.

## Impact
A failure webhook arriving at 03:00 IST triggers immediate outreach. That is a TRAI commercial-communication violation, and it makes the strongest claim in `docs/ETHICAL_AI_FRAMEWORK.md` false in the deployed path.

## Proposed fix
Set `checkContactHours: true` and let tests inject a daytime clock — the `Clock` abstraction exists precisely for this, and `tests/e2e-smoke.test.ts:19` already uses `FixedClock`.

## Acceptance criteria
- [ ] `checkContactHours: true` in `processRecoveryAttempt`
- [ ] Existing tests updated to set a daytime `FixedClock` rather than relying on the rule being off
- [ ] New test: `processRecoveryAttempt` under a 03:00 IST `FixedClock` inserts **zero** rows into `recovery_actions`
- [ ] New test: the same journey at 10:00 IST does dispatch
- [ ] An `outside_contact_hours` audit entry is written when the rule defers an attempt

## Related
RA-07 (scheduling is likewise unenforced), RA-17 (docs overstate this control)
