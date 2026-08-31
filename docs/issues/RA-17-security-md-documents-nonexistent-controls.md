<!-- labels: docs,medium,compliance,privacy -->
# RA-17 — SECURITY.md documents PII protections that do not exist in the source

**Severity:** Medium · **Area:** `SECURITY.md`, `src/lib/utils/audit.ts`, `src/lib/ai/` · **Est:** 2-4 h

## Summary
`SECURITY.md` §C claims phone numbers are masked in audit logs and that no PII reaches Gemini prompts. Neither holds. §B (idempotency) and the contact-hours claim in `docs/ETHICAL_AI_FRAMEWORK.md` have the same problem.

## Evidence
```
$ grep -rni "mask\|redact\|anonymi" src
→ no matches (only substring hits on "recoveredActions")
```
- Customer names are sent to Gemini in every `generateRecoveryMessage` and `processCustomerConversation` call.
- `writeAuditLog` stores `eventData` verbatim, including full outbound message bodies (name, amount, payment link) and the customer's raw reply text.

**What does hold up:** no card numbers, CVVs or expiry data are stored or transmitted anywhere. That narrow claim is true and is the important one.

## Impact
A security policy that overstates controls is worse than a modest one, because it is the document a reviewer or regulator audits against. For a buildathon this is also a scoring risk — a judge who greps for `mask` finds nothing.

## Proposed fix
Make the code true rather than the document weaker — it is roughly 30 lines:
```ts
// src/lib/utils/pii.ts
export const maskPhone = (p: string) => p.replace(/^(\+\d{2})\d+(\d{4})$/, '$1******$2');
export const maskEmail = (e: string) => e.replace(/^(.).*(@.*)$/, '$1***$2');
```
Apply in `writeAuditLog` before persisting `eventData`, and pass only a first name to Gemini (`customerName.split(' ')[0]`) — the templates already do exactly this at `messenger.ts:26`.

Then re-verify each claim in `SECURITY.md` and amend §B to match the behaviour delivered by RA-04.

## Acceptance criteria
- [ ] `maskPhone` / `maskEmail` exist and are applied in `writeAuditLog`
- [ ] Only a first name is sent to any LLM prompt
- [ ] `grep -rn "mask" src` shows the controls the document describes
- [ ] Every claim in `SECURITY.md` §A-§E has a corresponding test or code reference
- [ ] `docs/ETHICAL_AI_FRAMEWORK.md` contact-hours claim matches reality after RA-06

## Related
RA-04 (§B), RA-06 (ethics doc), RA-02 (append-only claim)
