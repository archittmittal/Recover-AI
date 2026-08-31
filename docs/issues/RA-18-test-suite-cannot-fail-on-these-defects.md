<!-- labels: testing,low,quality -->
# RA-18 — The test suite cannot fail on any defect in this audit

**Severity:** Low · **Area:** `tests/` · **Est:** 3-4 h

## Summary
49 tests pass and `tsc --noEmit` is clean, yet none of the 21 findings would break the build. No test constructs a `Request` and calls a route handler, so authentication, signature verification and idempotency are entirely untested.

## Evidence
- No test in `tests/` imports a file from `src/app/api/`.
- `tests/webhooks-idempotency.test.ts:44` defines a local `processIncomingEvent` **inside the test file** and asserts against that re-implementation. It never imports the route and would pass unchanged if the route did nothing.
- `tests/contact-hours.test.ts` thoroughly covers `isWithinContactHours` — which production never invokes, because RA-06 disables it.

The pure-logic coverage that does exist (classifier, strategies, stopping rules) is correct and worth keeping. The gap is integration.

## Impact
Green CI provides false assurance, and every fix in this audit can silently regress.

## Proposed fix
Add a route-handler test harness (`new Request(url, { method, headers, body })` passed directly to the exported `POST`/`GET`) and, at minimum, these three:

1. POST an unsigned body to the webhook handler → assert 4xx (**RA-01**)
2. Run `processRecoveryAttempt` under a 03:00 IST `FixedClock` → assert zero `recovery_actions` rows (**RA-06**)
3. Call `resolveJourneyWithPayment` twice → assert `totalRecoveredAmount` unchanged on the second (**RA-09**)

Then extend to one test per fixed finding as each lands.

## Acceptance criteria
- [ ] Route handlers are callable from tests with a helper
- [ ] The three tests above exist and fail against current `main`
- [ ] `tests/webhooks-idempotency.test.ts` imports and exercises the real route
- [ ] Each merged fix from this audit ships with a regression test
- [ ] CI runs the full suite on every PR

## Related
Every other issue — this is the one that keeps them fixed
