<!-- labels: bug,medium,recovery-engine,demo-integrity -->
# RA-12 — The entire communication layer is unreachable code

**Severity:** Medium · **Area:** `src/lib/communication/` · **Est:** 2-3 h

## Summary
`communicationManager` is defined and never imported. The coordinator never dispatches — it writes the action row and hardcodes `deliveryStatus: 'sent'`. The multi-channel escalation ladder is recorded but never executed.

## Location
`src/lib/communication/{manager,whatsapp,sms,voice}.ts` · `src/lib/recovery/coordinator.ts:235`

## Evidence
```
$ grep -rn "communicationManager" src tests
src/lib/communication/manager.ts:65:export const communicationManager = new CommunicationManager();
→ defined once, imported nowhere
```
```ts
await db.insert(recoveryActions).values({
  channel,                    // whatsapp / sms / voice — recorded
  deliveryStatus: 'sent',     // asserted, never attempted
});
```
Note also `src/lib/communication/whatsapp.ts:36` returns a hardcoded `deliveryStatus: 'read'`, so wiring it up as-is would fabricate read receipts rather than fix the problem.

## Impact
Simulated transport is a reasonable choice for a buildathon, but the channel-escalation ladder is presented as a working capability and right now the only difference between the WhatsApp path and the voice path is the string stored in a column. It also blocks RA-13: no real delivery state means no real channel metrics.

## Proposed fix
1. Call the manager from `processRecoveryAttempt` and persist what it returns:
```ts
const dispatch = await communicationManager.dispatch({
  channel, toPhone: customer.phone, toEmail: customer.email,
  customerName: customer.name, messageText: messageResult.message,
  paymentLinkUrl: paymentUrl, amount: journey.amountAtRisk,
  language: customer.preferredLanguage,
});
// …
deliveryStatus: dispatch.deliveryStatus,
```
2. Change the stub providers to return a genuine `'sent'`, and let `'delivered'` / `'read'` arrive later through a status-callback path — so the column means what it says even while the transport is simulated.
3. Record the provider `messageId` on the action row for traceability.

## Acceptance criteria
- [ ] `communicationManager.dispatch` is called for every outreach attempt
- [ ] `deliveryStatus` comes from the dispatch result, never a literal
- [ ] No provider returns `'read'` at send time
- [ ] Provider `messageId` persisted on `recovery_actions`
- [ ] A dispatch failure marks the action `'failed'` and does not consume the attempt (see RA-14)

## Related
RA-13 (depends on this for real delivery data), RA-14 (attempt accounting on failure)
