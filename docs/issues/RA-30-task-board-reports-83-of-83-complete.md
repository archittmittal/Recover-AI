<!-- labels: medium,demo-integrity,docs,quality -->
# RA-30 — The task board reports 83/83 complete while at least one completed task is unimplemented

**Severity:** Medium · **Area:** `docs/TASKS.md` · **Est:** 2-3 h

## Summary
`docs/TASKS.md:169` reports **83 of 83 tasks done, 0 in progress, 0 not started**. Task 8.3 — *"Baseline comparison harness (arms A/B/C)"* — is marked ✅ and is the subject of RA-22, where the "harness" is two hardcoded constants in the metrics route.

One verified false ✅ means the board's other 82 entries carry no evidential weight. A reader cannot tell which are real without checking each against the source, which defeats the purpose of the board.

## Location
`docs/TASKS.md:146` (task 8.3) · `docs/TASKS.md:160-169` (progress summary) · `docs/TASKS.md:191-192` (dependencies)

## Evidence
```
| 8.3 | Baseline comparison harness (arms A/B/C) | ✅ | Agent | Arm A (0%), Arm B (31.5% rules dunning), Arm C (RecoverAI measured) |
```
against
```ts
// src/app/api/metrics/route.ts:217
const baselineArmARate = 0;
const baselineArmBRate = 31.5;
```
The row's own detail column states the constants. It reads as complete because the numbers are present, not because anything computes them.

The board also contradicts itself on the same page. Task 8.3 is ✅, but `TASKS.md:191-192` still lists both API credentials as ⬜ *"Need to create Razorpay account & get test keys"* / *"Need to get from Google AI Studio"* — consistent with RA-24, and irreconcilable with Phase 2 (which consumes those keys) being 14/14 done.

`README.md` compounds this by pointing evaluators at the board as a live record:
> so the issue list is always a live, accurate picture of what's actually shipped, not just planned.

## Impact
Lower direct severity than RA-22, RA-24 or RA-29, because a task board is not a product claim and evaluators discount them. It earns a place on the list for two reasons:

1. **It is how the gaps stayed invisible.** A board reading 83/83 is why RA-22, RA-23 and RA-27's unrecorded state went unnoticed until a readiness review. Fixing the board is what stops the next gap hiding.
2. **It is the fourth instance of the same pattern.** RA-22 (README), RA-24 (`.env` vs claims), RA-26 (README), RA-29 (engineering log), and now the task board all assert completion ahead of implementation. Individually each is arguable; together they establish a pattern an evaluator will generalise from. The pattern is the finding.

## Proposed fix
1. Audit all 83 rows against the codebase. For each ✅, name the file or test that demonstrates it — a row with no artifact behind it is not done.
2. Correct 8.3 to ⬜ or 🟡 immediately, and reconcile the credentials rows against Phase 2.
3. Adopt a stricter definition of done: a task is ✅ when the behaviour is reachable in the running application and covered by a test, not when the code exists. Several RA-01..RA-21 findings were exactly this failure — `RA-12 communication layer is dead code` was written, marked done, and unreachable.
4. Consider replacing the hand-maintained progress summary with a count generated from the rows, so the total cannot drift from its own table.
5. Reconcile the board with the open GitHub issues, since the README presents them as the same picture.

## Acceptance criteria
- [ ] Every ✅ row has an identified file, test, or commit demonstrating it
- [ ] Task 8.3 reflects the true state of the baseline harness
- [ ] The credentials dependency rows agree with the Phase 2 status
- [ ] The progress summary totals match the rows they summarise
- [ ] "Done" is defined in the document as reachable-and-tested, not written
- [ ] The board and the open issue list tell the same story

## Related
RA-22 (the specific false ✅), RA-24 (credentials the board contradicts itself on), RA-29 (same pattern in the engineering log), RA-12 (prior instance of code marked done but unreachable)
