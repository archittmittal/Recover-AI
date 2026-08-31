<!-- labels: bug,high,recovery-engine -->
# RA-07 — Retry backoff is configured, written to the database, and never enforced

**Severity:** High · **Area:** `src/lib/recovery/coordinator.ts`, `src/lib/recovery/strategies.ts` · **Est:** 2-3 h

## Summary
`retryIntervalsHours` is carefully specified per strategy and then never used. The offset passed to the scheduler is hardcoded to `0`, and the resulting `scheduledAt` column is persisted but never read as an execution gate.

## Location
`src/lib/recovery/coordinator.ts:224` · `src/lib/recovery/strategies.ts:23,32,41,50`

## Evidence
```ts
// strategies.ts — carefully specified per strategy
retryIntervalsHours: [1, 24, 72],

// coordinator.ts:224 — the only caller
const scheduleInfo = calculateNextScheduledTime(0);   // always now
```
`processRecoveryAttempt` reads the journey, checks stopping rules and dispatches. Nothing asks whether the next attempt is due yet.

## Impact
Attempts 1, 2 and 3 fire as fast as the caller loops. A cron hitting `/api/recovery/trigger` every minute exhausts a customer's entire three-message ladder in three minutes instead of across four days. Combined with RA-05, an anonymous caller does it in three seconds. This is both a customer-experience failure and a TRAI frequency concern.

## Proposed fix
Two halves — the second is the one that actually enforces pacing:

1. Compute the offset from config:
```ts
const intervals = strategyConfig.retryIntervalsHours;
const offset = intervals[nextAttempt - 1] ?? 24;
const scheduleInfo = calculateNextScheduledTime(offset);
```
2. Gate execution at the top of `processRecoveryAttempt`:
```ts
const [latest] = await db.select().from(recoveryActions)
  .where(eq(recoveryActions.journeyId, journeyId))
  .orderBy(desc(recoveryActions.attemptNumber)).limit(1);

if (latest && new Date(latest.scheduledAt) > getClock().now()) {
  return; // not due yet
}
```

## Acceptance criteria
- [ ] `scheduledAt` on attempt N reflects `retryIntervalsHours[N-1]`, deferred into contact hours
- [ ] Calling `processRecoveryAttempt` twice in a row produces exactly one action row
- [ ] Advancing a `FixedClock` past `scheduledAt` allows the next attempt through
- [ ] `merchant_alert` (empty `retryIntervalsHours`) is handled without throwing
- [ ] Test: three consecutive trigger calls within a minute yield one message, not three

## Related
RA-06 (same scheduling machinery), RA-15 (other ignored strategy config)
