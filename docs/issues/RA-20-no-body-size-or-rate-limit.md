<!-- labels: security,low,api,reliability -->
# RA-20 — Webhook accepts unbounded bodies at unbounded rate

**Severity:** Low · **Area:** `src/app/api/webhooks/razorpay/route.ts`, all routes · **Est:** 2 h

## Summary
`await req.text()` reads the request body with no size cap, and no route has a rate limit.

## Location
`src/app/api/webhooks/razorpay/route.ts:15` · all of `src/app/api/`

## Impact
Combined with RA-01, a single client can drive unlimited Gemini calls and Razorpay API calls through the recovery coordinator — a cost-amplification attack as much as an availability one. Large bodies are also hashed and JSON-parsed before any validation happens.

## Proposed fix
Fold both into the middleware introduced by RA-05:
```ts
const MAX_BODY = 64 * 1024;
const len = Number(req.headers.get('content-length') ?? 0);
if (len > MAX_BODY) {
  return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
}
```
Plus a per-IP token bucket (in-memory is sufficient at this scale; Redis if the app is ever horizontally scaled). Reject before parsing, not after.

## Acceptance criteria
- [ ] Bodies over 64 KB rejected with 413 before parsing
- [ ] Per-IP rate limit on `/api/*` with a documented ceiling
- [ ] Rate-limited responses return 429 with `Retry-After`
- [ ] Legitimate Razorpay webhook volume is unaffected

## Related
RA-05 (same middleware), RA-01 (amplification path)
