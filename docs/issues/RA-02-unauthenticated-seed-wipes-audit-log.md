<!-- labels: security,critical,data-integrity -->
# RA-02 — Unauthenticated POST erases the append-only audit log

**Severity:** Critical · **Area:** `src/app/api/simulator/seed/route.ts` · **Est:** 1 h

## Summary
`POST /api/simulator/seed` has no authentication, no env guard and no confirmation. It truncates all six tables, including `audit_logs`, which the project documents as the append-only regulatory evidence trail.

## Location
`src/app/api/simulator/seed/route.ts` → `src/lib/db/seed.ts:28-33`

## Evidence
```ts
// POST /api/simulator/seed — no auth, no env guard, no confirmation
await db.delete(auditLogs);        // ← the compliance record
await db.delete(recoveryActions);
await db.delete(recoveryJourneys);
await db.delete(paymentFailures);
await db.delete(customers);
await db.delete(webhookEvents);
```
There is no `NODE_ENV` check, so the route ships in the production bundle exactly as it does in dev.

## Impact
Total destruction of transaction history and the compliance record, plus a trivially repeatable denial of service. It also erases the evidence of any prior attack. A table a public endpoint can `DELETE FROM` is not append-only in any sense a regulator would accept.

## Proposed fix
1. Gate the whole `/api/simulator/*` tree at the edge — see RA-05 for the shared middleware:
```ts
// src/middleware.ts
export function middleware(req: NextRequest) {
  if (process.env.RECOVERAI_MODE !== 'demo') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}
export const config = { matcher: '/api/simulator/:path*' };
```
2. Enforce append-only at the schema level so the claim is structural rather than aspirational:
```sql
CREATE TRIGGER audit_logs_no_delete BEFORE DELETE ON audit_logs
BEGIN SELECT RAISE(ABORT, 'audit_logs is append-only'); END;
```
Seeding then needs an explicit maintenance path that drops and recreates the trigger, which is the point — it becomes a deliberate act.

## Acceptance criteria
- [ ] `POST /api/simulator/seed` returns 404 when `RECOVERAI_MODE !== 'demo'`
- [ ] Same for `/api/simulator/pay` and `/api/simulator/reply`
- [ ] A direct `DELETE FROM audit_logs` raises at the DB level
- [ ] Seeding still works in demo mode

## Related
RA-05 (shares the middleware), RA-17 (documentation claims append-only)
