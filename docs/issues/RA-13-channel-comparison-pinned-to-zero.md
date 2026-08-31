<!-- labels: bug,medium,dashboard,demo-integrity -->
# RA-13 — Channel comparison is structurally pinned to zero

**Severity:** Medium · **Area:** `src/app/api/metrics/route.ts` · **Est:** 1 h

## Summary
The channel-effectiveness panel filters on two values that are never written to `recovery_actions`, so every channel reports 0.0% conversion in every possible state of the database.

## Location
`src/app/api/metrics/route.ts:104-116`

## Evidence
```ts
const recoveredActions = actionsForChan.filter(a => a.outcome === 'payment_completed');
const readCount        = actionsForChan.filter(a => a.deliveryStatus === 'read').length;
```
```
$ grep -rn "payment_completed" src
src/app/api/metrics/route.ts:104     ← the only read
src/lib/db/schema.ts:65              ← a comment
→ nothing ever writes it
```
`outcome` is only ever set to `'pending'` (coordinator) or `'opted_out'` (reply route). `resolveJourneyWithPayment` updates the journey without touching the action that earned the conversion. `deliveryStatus` is only ever `'sent'` or `'delivered'`.

Therefore, always and for every channel: `recoveredCount = 0`, `recoveredPaise = 0`, `conversionRatePct = 0.0`, `readCount = 0`. `deliveredCount` counts only conversational replies, never outreach.

## Impact
The panel that answers *"which channel actually recovers money"* — arguably the most valuable output of the product and a centrepiece of the demo — reads 0.0% for WhatsApp, SMS, voice and email under all conditions. Only the cost column is live, so the dashboard shows spend with no return against it.

## Proposed fix
In `resolveJourneyWithPayment`, attribute the conversion to the action that produced it:
```ts
const [lastAction] = await db.select().from(recoveryActions)
  .where(eq(recoveryActions.journeyId, journeyId))
  .orderBy(desc(recoveryActions.attemptNumber)).limit(1);

if (lastAction) {
  await db.update(recoveryActions)
    .set({ outcome: 'payment_completed' })
    .where(eq(recoveryActions.id, lastAction.id));
}
```
That single write lights up the whole panel. Real `'read'` state depends on RA-12.

## Acceptance criteria
- [ ] Resolving a journey sets `outcome: 'payment_completed'` on its most recent action
- [ ] `conversionRatePct` is non-zero for a channel that has recovered a payment
- [ ] `recoveredPaise` per channel sums to total recovered across channels
- [ ] `deliveredCount` reflects outreach, not only replies
- [ ] Test asserting the metrics endpoint reports a non-zero channel conversion after one recovery

## Related
RA-09 (same function), RA-12 (needed for real read/delivered state)
