<!-- labels: bug,medium,data-integrity,privacy -->
# RA-16 — Anonymous payments collapse into a single shared customer record

**Severity:** Medium · **Area:** `src/app/api/webhooks/razorpay/route.ts` · **Est:** 2 h

## Summary
Customer identity is resolved by email, with a hardcoded placeholder when the payment carries none. Every payment without an email therefore matches the same record, whose phone number is also a hardcoded literal.

## Location
`src/app/api/webhooks/razorpay/route.ts:68` and `:80`

## Evidence
```ts
.where(eq(customers.email, payment.email || 'customer@example.com'))
…
phone: payment.contact || '+919876543210',
```
Razorpay does not guarantee `email` on a payment entity. There is also no `UNIQUE` index on `customers.email`, so the lookup assumes a uniqueness the schema does not enforce.

## Impact
Unrelated people's failures, journeys and audit history accumulate under one identity, and every one of them is addressed to the same fabricated phone number. Under DPDPA 2023 this is a data-accuracy failure, and once channels go live it is misdirected commercial communication to whoever actually owns `+919876543210`.

## Proposed fix
1. Key identity on `razorpay_customer_id` where present, falling back to a normalised `contact` (E.164).
2. If neither is available, create a distinct unlinked record and mark the journey `uncontactable` rather than inventing contact details. Never fabricate a phone number.
3. Add `UNIQUE` on `customers.email` (nullable) plus an index on the new identity column.

## Acceptance criteria
- [ ] Two failures with no email and different phone numbers create two customers
- [ ] Two failures for the same `razorpay_customer_id` reuse one customer
- [ ] No hardcoded placeholder email or phone number remains in `src/`
- [ ] A failure with no usable contact detail creates an `uncontactable` journey that dispatches nothing
- [ ] Migration adds the unique constraint and identity index

## Related
RA-19 (missing indexes generally)
