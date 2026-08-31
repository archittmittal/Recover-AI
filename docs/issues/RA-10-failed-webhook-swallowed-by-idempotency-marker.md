<!-- labels: bug,high,webhooks,reliability -->
# RA-10 — A failed webhook is permanently swallowed by its own idempotency marker

**Severity:** High · **Area:** `src/app/api/webhooks/razorpay/route.ts` · **Est:** 2-3 h

## Summary
The route marks an event `'processing'` before doing the work. If anything downstream throws, the row is left at `'processing'` forever and every subsequent Razorpay retry is treated as a duplicate and answered with 200. The retry mechanism that exists to heal the failure is what guarantees the event is lost.

## Location
`src/app/api/webhooks/razorpay/route.ts:35-57` and `127-134`

## Evidence
```ts
// 1. check
const existingEvent = await db.select().from(webhookEvents).where(eq(webhookEvents.id, eventId));
if (existingEvent.length > 0) {
  return NextResponse.json({ success: true, data: { message: 'Duplicate webhook event ignored' } });
}
// 2. claim
await db.insert(webhookEvents).values({ processingStatus: 'processing', … });
// 3. work — classifyFailureWithLLM (Gemini) and createPaymentLink (Razorpay) can both throw
…
} catch (error) {
  return NextResponse.json({ … }, { status: 500 });   // row stays 'processing' forever
}
```
Two defects: the terminal-state check treats `'processing'` as done, and check-then-insert is a race — two concurrent deliveries both pass the `select` and one hits the primary-key violation and 500s.

## Impact
Silent, permanent loss of failed-payment events under exactly the transient conditions retries exist for (Gemini timeout, Razorpay 5xx). Revenue never enters recovery and nothing surfaces the gap — the endpoint reports success.

## Proposed fix
Claim atomically, and only treat terminal states as duplicates:
```ts
const claimed = await db.insert(webhookEvents)
  .values({ id: eventId, processingStatus: 'processing', … })
  .onConflictDoNothing().returning();

if (claimed.length === 0) {
  const [prior] = await db.select().from(webhookEvents).where(eq(webhookEvents.id, eventId));
  if (prior.processingStatus === 'processed') return ok('duplicate');
  return NextResponse.json({ error: 'retry' }, { status: 503 });  // let Razorpay retry
}
```
In the catch block, set `processingStatus: 'failed'` with `errorMessage` before returning 500. Wrap the customer / failure / journey inserts in `db.transaction()` so a mid-flight throw does not leave a customer with no failure row.

## Acceptance criteria
- [ ] A throw during processing leaves the row at `'failed'`, not `'processing'`
- [ ] A retry of a `'failed'` event reprocesses it successfully
- [ ] A retry of a `'processed'` event returns 200 without side effects
- [ ] Two concurrent deliveries of the same event produce one journey and no 500
- [ ] Customer, failure and journey inserts are transactional

## Related
RA-04 (same route, event identity), RA-01 (same route)
