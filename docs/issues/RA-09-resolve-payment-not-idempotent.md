<!-- labels: bug,high,data-integrity -->
# RA-09 — Recovery resolution is not idempotent, so recovered revenue double-counts

**Severity:** High · **Area:** `src/lib/recovery/coordinator.ts` · **Est:** 1 h

## Summary
`resolveJourneyWithPayment` increments the customer's lifetime recovered total without any guard against being called twice for the same payment. The journey update is a set (idempotent); the customer update is an increment (not).

## Location
`src/lib/recovery/coordinator.ts:342-385`

## Evidence
```ts
async resolveJourneyWithPayment(journeyId, paymentId, amountPaid) {
  // no guard on journey.status === 'resolved'
  await db.update(recoveryJourneys).set({ status: 'resolved', amountRecovered: amountPaid })…
  await db.update(customers).set({
    totalRecoveredAmount: (customer.totalRecoveredAmount || 0) + amountPaid  // accumulates every call
  })…
```
Reached from `/api/simulator/pay`, which is unauthenticated (RA-05) and imposes no cooldown. It will also be reached from the webhook once `payment.captured` / `payment_link.paid` handling is added, where retries are routine.

## Impact
Unbounded inflation of the headline recovery figure by anyone who can send an HTTP request. For a product whose pitch is a recovery-rate number, the number is arbitrarily forgeable.

## Proposed fix
```ts
if (journey.status === 'resolved') return;   // already settled
```
and derive the lifetime total rather than maintaining a running counter:
```sql
SELECT SUM(amount_recovered) FROM recovery_journeys WHERE customer_id = ?
```
A derived total cannot drift.

While here, write the conversion back to the action row so channel attribution works — see RA-13.

## Acceptance criteria
- [ ] Calling `resolveJourneyWithPayment` twice leaves `totalRecoveredAmount` unchanged on the second call
- [ ] `totalRecoveredAmount` equals `SUM(amount_recovered)` over that customer's journeys at all times
- [ ] Second call writes no duplicate `payment_recovered` audit entry
- [ ] Test covering the double-call case

## Related
RA-05 (reachability), RA-13 (the write that should happen here)
