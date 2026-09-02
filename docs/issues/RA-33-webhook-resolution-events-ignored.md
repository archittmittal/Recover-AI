<!-- labels: high,demo-integrity,api,quality -->
# RA-33 — Four of the five documented webhook events are recorded and then ignored

**Severity:** High · **Area:** `src/app/api/webhooks/razorpay/route.ts` · **Est:** 2-3 h

## Summary
`payload.event` is tested exactly once in the 262-line webhook handler, for `payment.failed`. Every other event is signature-verified, written to `webhook_events`, marked `processed`, and then dropped.

`docs/DEPLOYMENT.md` meanwhile instructs the operator to subscribe to five events and describes what each one does — including *"`payment_link.paid` (resolves recovery journeys)"*. It does not.

## Impact
The consequence is the one that matters most for the demo: **a customer who actually pays through a recovery link does not resolve their journey.** The only paths to `resolved` are the simulator's Pay button and the simulation response model, so on a live deployment taking real test-mode payments the dashboard's recovered figure never moves for a genuine recovery.

Razorpay's own delivery log shows `200` for these events, so the integration looks wider and healthier than it is from both sides.

## Proposed fix
1. Handle `payment_link.paid` and `payment.captured` by resolving the matching journey through `recoveryCoordinator.resolveJourneyWithPayment`, which is already idempotent (RA-09).
2. Attribute deliberately. Match only on identifiers this system created — the stored `payment_link_id`, or the `recov_<journeyId>_att<n>` reference the coordinator stamps on every link. A payment carrying neither must be recorded and left alone; guessing which open journey it belonged to would fabricate a recovery, which is the failure RA-22 and RA-23 already cost us.
3. Record the attribution used in the audit trail so a recovered rupee traces back to the outreach that earned it.
4. Leave the subscription events unhandled, and say so in the deployment guide rather than describing behaviour that does not exist.

## Acceptance criteria
- [ ] A `payment_link.paid` carrying our reference resolves the journey
- [ ] A payment carrying no identifier of ours resolves nothing and leaves open journeys untouched
- [ ] A redelivered event does not double-count the recovery
- [ ] `docs/DEPLOYMENT.md` lists only events the handler acts on

## Related
RA-09 (idempotent resolution, which this depends on), RA-28 (a live deployment is what makes this reachable)
