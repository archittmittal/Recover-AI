<!-- labels: performance,low,scalability,api -->
# RA-19 — List endpoints load every table and join in application memory

**Severity:** Low · **Area:** `src/app/api/customers/route.ts`, `src/app/api/metrics/route.ts` · **Est:** 3-4 h

## Summary
Both list endpoints `SELECT *` from four or five tables with no filter, then join them with nested `Array.find()` — quadratic in customer count. Declared query filters are applied in JavaScript after the full load. No index exists on any foreign key.

## Location
`src/app/api/customers/route.ts:41-47` · `src/app/api/metrics/route.ts:37-45`

## Evidence
```ts
const allCustomers = await db.select().from(customers);
const allFailures  = await db.select().from(paymentFailures);
const allJourneys  = await db.select().from(recoveryJourneys);
const allActions   = await db.select().from(recoveryActions);

const journey = allJourneys.find(j => j.customerId === cust.id);   // O(n) inside O(n)
```
The `status`, `strategy`, `channel` and `search` parameters are all applied post-load. `src/lib/db/index.ts` creates no index on `recovery_journeys.customer_id`, `recovery_actions.journey_id`, `audit_logs.journey_id`, or `customers.email` — the last of which the webhook hot path queries on every single event.

## Impact
Fine at the 50 seeded customers; it degrades sharply well before 50,000. Since scalability is an explicit judging criterion for the buildathon, this is worth closing even though nothing is currently broken.

## Proposed fix
1. Push joins and filters into Drizzle — `leftJoin` plus `where` on the requested filters, with `limit`/`offset` pagination.
2. Add indexes in the migration:
```sql
CREATE INDEX idx_journeys_customer   ON recovery_journeys(customer_id);
CREATE INDEX idx_journeys_failure    ON recovery_journeys(failure_id);
CREATE INDEX idx_actions_journey     ON recovery_actions(journey_id);
CREATE INDEX idx_audit_journey       ON audit_logs(journey_id);
CREATE UNIQUE INDEX idx_customers_email ON customers(email);
```
3. Compute metrics aggregates with SQL `SUM`/`COUNT` rather than looping in JS.

## Acceptance criteria
- [ ] `/api/customers` issues a bounded number of queries independent of row count
- [ ] Filters and search are applied in SQL
- [ ] Pagination supported (`limit`, `offset`)
- [ ] Indexes added via migration, `drizzle-kit check` passes
- [ ] Response shape unchanged so the dashboard needs no edits

## Related
RA-16 (needs the unique index on email)
