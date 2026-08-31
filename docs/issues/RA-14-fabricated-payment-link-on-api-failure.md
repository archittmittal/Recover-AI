<!-- labels: bug,medium,recovery-engine,customer-impact -->
# RA-14 — Outreach continues after a payment-link failure using a fabricated URL

**Severity:** Medium · **Area:** `src/lib/recovery/coordinator.ts` · **Est:** 1 h

## Summary
When the Razorpay payment-link API fails, the coordinator logs a warning and proceeds to send a message pointing at an `rzp.io` URL constructed from an internal journey id. It resolves to nothing.

## Location
`src/lib/recovery/coordinator.ts:188-207` · the same literal appears at `src/app/api/simulator/reply/route.ts:49`

## Evidence
```ts
let paymentUrl = `https://rzp.io/i/recov_${journey.id}`;   // not a real link
try   { const plink = await razorpayClient.createPaymentLink(…); paymentUrl = plink.short_url; }
catch { console.warn('[RecoveryCoordinator] Payment link generation fallback:', error); }
// …falls through and dispatches anyway
```

## Impact
The customer receives a payment request with a dead link, burning one of three attempts and the goodwill with it. Sending a broken `rzp.io` URL also puts a Razorpay-branded 404 in front of a cardholder, which is a partner-facing problem as much as a product one.

## Proposed fix
Abort the attempt instead of degrading it. Do not increment `currentAttempt`, do not insert the action row; log the failure, write an audit entry, and let the next sweep retry. A skipped attempt is recoverable; a spent attempt carrying a dead link is not.

```ts
let plink;
try {
  plink = await razorpayClient.createPaymentLink(…);
} catch (error) {
  await writeAuditLog({ journeyId, actor: 'system',
    eventType: 'attempt_aborted', eventData: { reason: 'payment_link_unavailable' } });
  return;   // attempt not consumed
}
```
Also remove the hardcoded fabricated URL in `simulator/reply/route.ts:49` — it should read `journey.paymentLinkId` and resolve the real short URL.

## Acceptance criteria
- [ ] A `createPaymentLink` failure inserts no `recovery_actions` row
- [ ] `currentAttempt` is unchanged after an aborted attempt
- [ ] An `attempt_aborted` audit entry is written
- [ ] The next sweep retries the attempt
- [ ] No hardcoded `rzp.io/i/recov_*` literal remains in `src/`

## Related
RA-12 (dispatch failures need the same treatment)
