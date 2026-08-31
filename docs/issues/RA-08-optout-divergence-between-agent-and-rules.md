<!-- labels: compliance,high,ai-safety -->
# RA-08 — The chat agent confirms an unsubscribe that the rules engine never records

**Severity:** High · **Area:** `src/lib/ai/conversation.ts`, `src/lib/recovery/stopping-rules.ts` · **Est:** 2 h

## Summary
Two opt-out keyword lists exist and they disagree. `/api/simulator/reply` calls both — the coordinator for state, the conversation agent for the reply text — so a customer can be told in writing that they are unsubscribed while `dndStatus` stays `'active'` and outreach continues.

## Location
`src/lib/ai/conversation.ts:27-43` vs `src/lib/recovery/stopping-rules.ts:37-43`

`conversation.ts` additionally matches `'cancel'` and `'mat karo'`. `stopping-rules.ts` does not.

## Evidence
Verified by running the project's own code:
```
msg="cancel"                 chat.intent=opt_out  chat.says="You have been unsubscribed…"  rules.ruleFired=null
msg="please cancel my order" chat.intent=opt_out  chat.says="You have been unsubscribed…"  rules.ruleFired=null
msg="mat karo"               chat.intent=opt_out  chat.says="You have been unsubscribed…"  rules.ruleFired=null
```
`handleCustomerResponse` only acts when `stoppingCheck.ruleFired === 'opt_out'`, so DND is never set, journey status stays `'recovering'`, and the next sweep messages them again.

## Impact
The worst failure mode available to a consent rail: an explicit written confirmation of opt-out followed by continued messaging. That is materially harder to defend than never having offered opt-out, because we have created a timestamped record of the promise and a timestamped record of breaking it — both in our own audit log.

## Proposed fix
1. Delete the second list. Export a single matcher from `stopping-rules.ts`:
```ts
export function detectOptOut(text: string): boolean { /* one implementation */ }
```
and have `conversation.ts` import it, so the two can never drift again.
2. Make the state change follow the message: `handleCustomerResponse` should set `dndStatus` and journey status from the same decision that produced the confirmation text, inside one `db.transaction()`.
3. Also honour the model's `intent === 'opt_out'` as authoritative when the deterministic matcher does not fire — we already request that field and currently discard it for state purposes.

## Acceptance criteria
- [ ] Exactly one opt-out matcher exists in the codebase
- [ ] For every message where the agent replies "You have been unsubscribed", `dndStatus` becomes `'opted_out'` and journey status becomes `'opted_out'`
- [ ] Property test: for a list of opt-out phrasings, agent reply and persisted state always agree
- [ ] A subsequent sweep sends nothing to that customer

## Related
RA-11 (the matcher itself is wrong in both directions)
