<!-- labels: security,critical,webhooks,data-integrity -->
# RA-04 — Idempotency keys off a field Razorpay does not send, then falls back to randomness

**Severity:** Critical · **Area:** `src/app/api/webhooks/razorpay/route.ts` · **Est:** 2 h

## Summary
Webhook deduplication is non-functional against real Razorpay traffic. It reads an event id from a body field that Razorpay does not populate, and when that is undefined it generates a random id — guaranteeing the dedup lookup can never match.

## Location
`src/app/api/webhooks/razorpay/route.ts:31-32`

## Evidence
```ts
const eventId = payload.id || `evt_${generateId('audit')}`;   // random fallback
const payloadHash = computePayloadHash(rawBody);              // computed… then never compared
```
Two compounding defects:
1. The Razorpay event body carries `entity`, `account_id`, `event`, `contains`, `payload`, `created_at`. The event identifier arrives in the **`x-razorpay-event-id` header**, not as `payload.id`.
2. When `payload.id` is undefined the code invents a fresh random id, so the `SELECT` at line 38 never finds the prior row. `payloadHash` is stored but no query reads it.

The existing test passes because `tests/webhooks-idempotency.test.ts:44` defines a local `processIncomingEvent` inside the test file and asserts against that re-implementation. It never imports the route, and would pass unchanged if the route did nothing.

## Impact
Every Razorpay retry creates a duplicate customer, duplicate failure row and a duplicate journey with its own outreach ladder — so one failed payment produces several independent message sequences to the same person. Replay protection is also void: a captured signed request can be re-sent indefinitely. `SECURITY.md` §B currently describes behaviour the code does not have.

## Proposed fix
```ts
const eventId = req.headers.get('x-razorpay-event-id');
if (!eventId) {
  return NextResponse.json({ error: 'Missing event id' }, { status: 400 });
}
```
Then make the claim atomic rather than check-then-insert (see RA-10), and add a `UNIQUE` index on `webhook_events.payload_hash` as a second line of defence against bodies replayed under a new event id.

## Acceptance criteria
- [ ] Event id is read from `x-razorpay-event-id`; a missing header is a 400
- [ ] Delivering the same event id twice creates exactly one customer, one failure and one journey
- [ ] Replaying an identical body under a *different* event id is rejected by the payload-hash constraint
- [ ] `tests/webhooks-idempotency.test.ts` is rewritten to call the real route handler
- [ ] `SECURITY.md` §B matches the implemented behaviour

## Related
RA-01, RA-10 (same route), RA-18 (tautological test)
