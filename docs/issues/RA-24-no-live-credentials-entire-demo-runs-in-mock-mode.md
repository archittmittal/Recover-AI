<!-- labels: critical,demo-integrity,ai-safety,api -->
# RA-24 — No live credentials are configured: the AI never runs and no Razorpay call leaves the process

**Severity:** Critical · **Area:** `.env`, `src/lib/ai/gemini.ts`, `src/lib/razorpay/client.ts` · **Est:** 30 min + 1 h verification

## Summary
`.env` still holds `XXXXXXXX` placeholders for `GEMINI_API_KEY` and `RAZORPAY_KEY_SECRET`. Both clients detect the placeholder and silently degrade: Gemini never initialises, so every message is a deterministic template and every classification is the lookup path; `RazorpayClient.isMockMode()` returns true, so no request reaches `api.razorpay.com`.

In its current state the project demonstrates **zero AI inference and zero live Razorpay traffic** — in an AI buildathon, on a payments sponsor's track. The fallbacks are good enough that nothing visibly breaks, which is exactly why this can go unnoticed until a judge asks.

## Location
- `.env` — `GEMINI_API_KEY=XXXXXX…`, `RAZORPAY_KEY_SECRET=XXXXXX…`, `RAZORPAY_WEBHOOK_SECRET=XXXXXX…`
- `src/lib/ai/gemini.ts:10` — placeholder check gates client construction
- `src/lib/razorpay/client.ts:24-31` — `isMockMode()`

## Evidence
```ts
// src/lib/ai/gemini.ts:8-19
this.apiKey = process.env.GEMINI_API_KEY || '';
if (this.apiKey && !this.apiKey.includes('XXXXXXXX') && !this.apiKey.includes('mock')) {
  this.client = new GoogleGenerativeAI(this.apiKey);
  this.model = this.client.getGenerativeModel({ model: 'gemini-2.5-flash' });
}
// placeholder ⇒ this.model stays null ⇒ isAvailable() === false ⇒ every call takes the fallback
```

```ts
// src/lib/razorpay/client.ts:24
private isMockMode(): boolean {
  return !this.keyId || !this.keySecret
      || this.keyId.includes('XXXXXXXX') || this.keyId.includes('mock');
}
```

Downstream, the degradation is invisible by design — `src/lib/ai/messenger.ts:65` builds the template before attempting Gemini and returns it on any failure, and `classifier.ts:15` short-circuits to the deterministic taxonomy. Those fallbacks are correct engineering (see the "deliberately no LLM" section of the README, which is one of our strongest assets). The problem is solely that nothing currently exercises the other branch.

Note `RAZORPAY_KEY_ID` *is* a real `rzp_test_…` value while the secret is not, so the pair cannot authenticate — this looks like a partially-completed setup rather than a deliberate choice.

## Impact
- The single most important claim of the submission — that an LLM does the language work while deterministic code does the money work — is unexercised. A judge asking "show me a Gemini-generated message" gets a template, and there is no way to tell them apart from the UI.
- No Razorpay Payment Link is ever really created, so the sponsor-API integration that Track 3 exists to showcase is unproven end to end.
- Every prompt-injection, PII-minimisation, and fallback control we built for the LLM path (RA-03, and the sanitisation in `src/lib/ai/sanitize.ts`) is currently dead code in practice — we cannot claim they work without having run them once.

## Proposed fix
1. Provision real credentials into `.env` (never committed — confirm `.gitignore` covers `.env` before adding them): a Google AI Studio key for Gemini, and the matching `rzp_test_` secret and webhook secret for the existing key ID.
2. Run the full demo path end to end against live services and confirm, in the audit log, at least one journey where `llm_reasoning` came from Gemini rather than the `'Deterministic template applied after LLM validation fallback.'` string.
3. Create one real Payment Link in Razorpay test mode and confirm the `short_url` resolves in a browser.
4. **Make the degradation visible instead of silent.** The three separate `XXXXXXXX` sniffs (`gemini.ts:10`, `razorpay/client.ts:29`, and the webhook guard in RA-01) each infer a deployment mode from the shape of a credential. Replace with one explicit `RECOVERAI_MODE=mock|live` flag, and:
   - in `live` mode, a missing or placeholder credential is a startup error, not a silent downgrade
   - surface the active mode in the UI and stamp it on every audit row, so a template-vs-LLM message is distinguishable after the fact
5. Add a startup preflight that logs which integrations are live, so this state can never again be discovered by reading source.

## Acceptance criteria
- [ ] A real Gemini response is observable in the audit trail for at least one seeded journey
- [ ] A real Razorpay test-mode Payment Link is created and its `short_url` opens
- [ ] `RECOVERAI_MODE=live` with a placeholder or absent credential fails loudly at startup
- [ ] Mock vs live is determined by one flag, not by three independent placeholder string-matches
- [ ] Each audit row records whether its message came from the LLM or the template
- [ ] The dashboard or console shows the active mode at a glance
- [ ] `.env` is confirmed gitignored and no real key is committed

## Related
RA-01 (same placeholder-sniffing anti-pattern, in the webhook guard — fix the mode flag once and both close), RA-03 (prompt-injection controls unverified until the LLM path actually runs), RA-17 (docs describing controls that do not execute)
