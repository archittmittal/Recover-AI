<!-- labels: security,critical,webhooks -->
# RA-01 — Webhook signature verification fails open when the secret is missing

**Severity:** Critical · **Area:** `src/app/api/webhooks/razorpay/route.ts` · **Est:** 30 min

## Summary
Razorpay webhook signature verification is wrapped in a condition that skips it entirely when `RAZORPAY_WEBHOOK_SECRET` is unset or still holds the `XXXXXXXX` placeholder. A missing env var on deploy silently converts the webhook into an unauthenticated write endpoint.

## Location
`src/app/api/webhooks/razorpay/route.ts:17-28`

## Evidence
```ts
const secret = process.env.RAZORPAY_WEBHOOK_SECRET || '';

if (secret && !secret.includes('XXXXXXXX')) {   // ← no secret ⇒ no check at all
  const isValid = verifyWebhookSignature(rawBody, signature, secret);
  if (!isValid) return 400;
}
```
The verification function itself (`src/lib/razorpay/webhooks.ts`) is correct — HMAC-SHA256, length pre-check, `timingSafeEqual`. Only the guard is wrong.

## Impact
Any unauthenticated caller can POST a forged `payment.failed` event. This inserts an attacker-authored customer row (name, email, phone all attacker-chosen) and immediately calls `startRecoveryJourney`, dispatching outreach. It is also the delivery vehicle for the prompt injection in RA-03.

## Proposed fix
Fail closed:
```ts
if (!secret || secret.includes('XXXXXXXX')) {
  console.error('[webhook] RAZORPAY_WEBHOOK_SECRET not configured — rejecting');
  return NextResponse.json(
    { success: false, error: { code: 'NOT_CONFIGURED' } },
    { status: 503 }
  );
}
if (!verifyWebhookSignature(rawBody, signature, secret)) {
  return NextResponse.json(
    { success: false, error: { code: 'INVALID_SIGNATURE' } },
    { status: 400 }
  );
}
```
Also replace the `XXXXXXXX` placeholder-sniffing convention (it recurs in `razorpay/client.ts:29` and `ai/gemini.ts:10`) with one explicit `RECOVERAI_MODE=mock|live` flag. Mock-vs-live is a deployment decision and should not be inferred from the shape of a credential in three separate files.

## Acceptance criteria
- [ ] Request with no `x-razorpay-signature` header → 400
- [ ] Request with a wrong signature → 400
- [ ] Request with a valid signature → 200 and processes normally
- [ ] Server with `RAZORPAY_WEBHOOK_SECRET` unset → 503 on every webhook, with an error log
- [ ] Test exists that POSTs an unsigned body to the route handler and asserts a 4xx

## Related
RA-03 (injection reached through this hole), RA-04 (same route), RA-10 (same route)
