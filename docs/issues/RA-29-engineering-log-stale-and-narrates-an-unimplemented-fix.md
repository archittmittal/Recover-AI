<!-- labels: critical,demo-integrity,docs,quality -->
# RA-29 — The engineering log is stale since 2026-08-23 and narrates, in past tense, a remediation that was never implemented

**Severity:** Critical · **Area:** `docs/ENGINEERING_LOG.md` · **Est:** 2-3 h

## Summary
Two defects in the one document `docs/PRD.md:66` identifies as *"the field the organisers say they read first"*:

1. **It describes work that does not exist, in the past tense.** The 2026-08-21 entry correctly identifies the exact problem later filed as RA-23, then states the fix as completed. Both files it names are absent from the repository.
2. **It stops at 2026-08-23.** The last commit is 2026-08-26. The entire RA-01..RA-21 remediation — 21 findings, roughly 30 pull requests, spanning 2026-08-23 to 2026-08-26 — is missing. That is the single strongest build-quality story in the project and it is absent from the document judges read first.

## Location
`docs/ENGINEERING_LOG.md:92-131` (the false entry) · last entry dated 2026-08-23 at line 14.

## Evidence
From the entry *"The recovery rate was going to be a measurement of our own random number generator"*:

> *Declared response model.* Customer pay-probability **moved out** of the seed script into
> `src/lib/simulation/response-model.ts`, with every coefficient sourced from a published benchmark and
> cited in `docs/SIMULATION_MODEL.md`. [...]
>
> *Baseline arms.* [...] Every batch **now runs** three arms over identical seeded data.

```
$ ls src/lib/simulation/
rng.ts                          ← response-model.ts does not exist

$ ls docs/SIMULATION_MODEL.md
ls: docs/SIMULATION_MODEL.md: No such file or directory

$ grep -n "baselineArmBRate" src/app/api/metrics/route.ts
218:    const baselineArmBRate = 31.5;   ← the "three arms" are one hardcoded constant
```

Staleness:
```
$ git log -1 --format=%ai          → 2026-08-26 18:20:54 +0530
$ latest entry in ENGINEERING_LOG  → 2026-08-23
```

## Impact
This is the most damaging item in the readiness review, above RA-22 and RA-23, because of *where* it sits.

The entry is a well-written account of catching a subtle reasoning error — that a synthetic recovery rate measures your own RNG rather than your agent — and resolving it with structural discipline. It closes: *"Be precise about which claim is being made, because conflating them is the fastest way to lose an evaluator's trust."*

An evaluator who reads that paragraph, is impressed, opens `src/lib/simulation/` to see the model, and finds it was never written, does not conclude the team ran out of time. They conclude the log is written to impress rather than to record. Every other entry then becomes suspect, including the three that are accurate. A missing feature costs points in one category; a log that narrates unbuilt work as built costs credibility across all of them — and does so in the document explicitly weighted first.

The staleness compounds it in the opposite direction: the genuinely impressive work of the final four days went unrecorded while the unbuilt work was written up.

## Proposed fix
1. **Correct the 2026-08-21 entry immediately.** Do not delete it — the reasoning in it is genuinely good and worth keeping. Rewrite the resolution in the tense that matches reality: the problem was identified, the design was specified, the implementation was not completed before the deadline. A log entry saying *"we saw this, designed the fix, and ran out of time"* is credible and costs far less than the current text.
2. If RA-22/RA-23 are implemented, rewrite it again in past tense once it is actually true.
3. **Backfill 2026-08-23 to 2026-08-26.** The RA-01..RA-21 remediation deserves entries in its own right: webhook signature failing open, prompt injection able to swap a payment link, opt-out matching wrong in both directions, the communication layer being dead code. Each is a real "what broke and how we got out" story with a commit trail to support it.
4. **Add an entry about this review.** That the project commissioned a partner-integration audit, closed all 21 findings, then ran a pre-submission readiness review that found five more, is itself the strongest possible evidence for the "would you trust it" criterion.
5. Sweep the remaining entries for the same past-tense-vs-reality mismatch before submission. This one was found by chance; there may be others.

## Note on issue dates
This issue was filed 2026-08-31, though the staleness it reports begins 2026-08-26. GitHub stamps issue creation server-side and the Issue Import API that once accepted a custom `created_at` now returns 404, so the filing date cannot reflect when the gap originated. Recording the real dates here rather than adjusting a timestamp — which is the same discipline this issue is about.

## Acceptance criteria
- [ ] No entry in `ENGINEERING_LOG.md` describes unimplemented work in the past tense
- [ ] Every file path named in the log exists, or is explicitly marked as designed-but-not-built
- [ ] Entries cover 2026-08-23 through the submission date, including the RA-01..RA-21 remediation
- [ ] All remaining entries audited against the codebase for the same class of mismatch
- [ ] The log is updated as work lands, not reconstructed before submission

## Related
RA-23 (the unimplemented work this entry claims), RA-22 (the baseline arms it claims run), RA-17 (prior finding of documentation overstating implemented controls — same pattern, and evidence it recurs)
