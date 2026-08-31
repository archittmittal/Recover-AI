<!-- labels: security,high,api -->
# RA-05 — No route in the application has an authenticated caller

**Severity:** High · **Area:** all of `src/app/api/` · **Est:** 3-4 h

## Summary
There is no `middleware.ts`, no session and no API key on any of the eight routes. One route gestures at it — `/api/recovery/sweep` checks a shared secret, but only `if (configuredSecret)`, so it too fails open when the env var is unset.

## Exposure

| Route | Auth | What an anonymous caller gets |
|---|---|---|
| `GET /api/customers` | none | Full PII dump — every customer's name, email, phone, segment, DND status, amounts |
| `GET /api/customers/[id]` | none | One customer's full record plus complete journey and audit history |
| `GET /api/metrics` | none | Whole-book revenue-at-risk and recovery figures |
| `POST /api/recovery/trigger` | none | Forces an outreach attempt on *every* open journey |
| `POST /api/simulator/seed` | none | Truncates all six tables (RA-02) |
| `POST /api/simulator/pay` | none | Marks any journey recovered for its full amount (RA-09) |
| `POST /api/simulator/reply` | none | Injects arbitrary customer replies; can force opt-out on any journey |
| `POST /api/recovery/sweep` | optional | Unprotected unless the secret env var happens to be set |

## Impact
Under DPDPA 2023 the customer-list endpoints alone constitute a reportable personal-data breach. Operationally the more expensive one is `/api/recovery/trigger`: an unauthenticated button that makes the system message real people and, once channels are live, spend real money doing it.

## Proposed fix
One `src/middleware.ts` covering `/api/:path*`, with three tiers:
- **Read endpoints** (`/api/customers*`, `/api/metrics`) behind a session or dashboard API key.
- **`/api/recovery/*`** behind a cron secret that is **required**, not optional, and compared with `crypto.timingSafeEqual`.
- **`/api/simulator/*`** returns 404 unless `RECOVERAI_MODE === 'demo'`.

Fold the body-size cap and rate limit from RA-20 into the same file.

## Acceptance criteria
- [ ] `src/middleware.ts` exists with a matcher covering `/api/:path*`
- [ ] Every route in the table above returns 401/404 to an unauthenticated caller in non-demo mode
- [ ] `/api/recovery/sweep` returns 503 (not 200) when its secret is unconfigured
- [ ] Secret comparison uses `timingSafeEqual`
- [ ] The dashboard still works end to end in demo mode

## Related
RA-02, RA-09, RA-20 (all reachable because of this)
