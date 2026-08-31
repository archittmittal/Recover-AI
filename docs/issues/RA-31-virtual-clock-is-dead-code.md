<!-- labels: high,demo-integrity,recovery-engine,quality -->
# RA-31 — The virtual clock is dead code, so two of the four strategies remain undemonstrable

**Severity:** High · **Area:** `src/lib/utils/time.ts`, simulator · **Est:** 3-4 h

## Summary
`docs/TASKS.md` marks task 8.1 "Virtual clock" ✅ and names it on the **critical path**, with the justification: *"Without it, `smart_retry` and contact-hours deferral are undemonstrable — two of the four strategies and the best compliance evidence."*

`VirtualClock` is defined in `src/lib/utils/time.ts` and referenced by nothing. There is no route that advances time, no simulator control, and no `clock_advanced` audit event. Both things the task exists to make demonstrable are still undemonstrable.

## Location
`src/lib/utils/time.ts:27` (`VirtualClock`) · `docs/TASKS.md` task 8.1 and the critical-path table · `docs/ENGINEERING_LOG.md`, 2026-08-21 retry entry

## Evidence
```
$ grep -rn "VirtualClock" src/ tests/
src/lib/utils/time.ts:27:export class VirtualClock implements Clock {
                                    ← the definition, and nothing else

$ ls src/app/api/
customers  metrics  recovery  simulator  webhooks      ← no time/clock route

$ grep -rhoE "eventType: '[a-z_]+'" src/ | sort -u
attempt_aborted, conversational_reply_sent, customer_opted_out, customer_replied,
dispatch_failed, journey_started, journey_uncontactable, outreach_dispatched,
payment_recovered, stopping_rule_triggered        ← no clock_advanced
```

The injectable `Clock` abstraction itself is real and load-bearing — `SystemClock` in production, `FixedClock` pinned to a constant in `contact-hours-enforcement.test.ts` and `retry-backoff-enforcement.test.ts`, so the 07:59 / 08:00 / 19:01 IST boundaries are deterministic. Only the demo-facing half is missing. The hard part is done; the exposed part is not.

## Impact
1. **The best compliance evidence in the project cannot be shown.** Contact-hours deferral and the retry ladder are among the most defensible things built, and an evaluator watching a five-minute demo sees neither. The retry cadence is T+1h/T+24h/T+72h against a five-minute demo.
2. **A false ✅ on the critical path.** The board asserts this is done, with a note explaining precisely why it must not be cut. Related to RA-30, but listed separately because this one is load-bearing for the demo rather than merely inaccurate.
3. **The engineering log described the unbuilt half in past tense**, including a `clock_advanced` audit event that does not exist. Corrected under RA-29.

## Proposed fix
1. Wire `VirtualClock` behind `setClock()` when `RECOVERAI_DEMO_MODE` is on.
2. Add `POST /api/simulator/clock` accepting an absolute instant or a relative advance. Guard it exactly as the other simulator routes are (see RA-28 on public exposure).
3. Write a `clock_advanced` audit event on every advance — actor, from, to — so an evaluator scrubbing the timeline can see where time moved and confirm no stopping rule was skipped. This is what separates a demo aid from a way to fake results.
4. Refuse to move the clock backwards while a demo is running, so scheduled actions cannot replay.
5. Add a simulator control for it, and a test asserting a journey deferred outside contact hours resumes after an advance to 09:00 IST.
6. Update `DEMO_SCRIPT.md` to actually use it — jump to 21:00 IST, show every queued outreach defer with a logged reason, jump to 09:00, watch it resume.

## Acceptance criteria
- [ ] Advancing the clock changes agent behaviour observably in the running app
- [ ] Every advance writes a `clock_advanced` audit row
- [ ] The clock cannot move backwards during a demo
- [ ] A test covers defer-then-resume across a contact-hours boundary via an advance
- [ ] `smart_retry` can be demonstrated inside a five-minute demo
- [ ] `docs/TASKS.md` 8.1 reflects reality until this is true

## Related
RA-30 (the board reporting 83/83 is how this stayed invisible), RA-29 (the log described this in past tense), RA-27 (the demo script needs this to show the compliance story)
