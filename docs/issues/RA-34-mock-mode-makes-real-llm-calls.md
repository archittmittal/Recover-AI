<!-- labels: medium,demo-integrity,ai-safety,quality -->
# RA-34 — `RECOVERAI_MODE=mock` still makes real Gemini calls

**Severity:** Medium · **Area:** `src/lib/config.ts` · **Est:** 30 min

## Summary
`.env.example` documents the mode as *"mock (default) — no outbound calls; payment links and LLM copy are simulated."* That is not what the code does:

```ts
export function requireCredential(name: string): string | undefined {
  const value = process.env[name];
  if (!isLive()) return isPlaceholder(value) ? undefined : value;   // ← hands back a real key
```

In mock mode a configured `GEMINI_API_KEY` is returned, so `GeminiClient` initialises and every journey makes a live LLM call.

## Evidence
- A mock-mode batch run through `POST /api/recovery/trigger` took **120 seconds** of real API traffic for 150 journeys.
- On the deployment, each webhook delivery spent several seconds inside a Gemini call while the declared mode says it makes none.

## Impact
1. **The declared mode is not the operating mode.** RA-24 established that the whole point of `RECOVERAI_MODE` is that behaviour is declared rather than inferred from whether a credential happens to look real. This is the same defect that fix was written to remove, surviving in the credential accessor.
2. **It quietly undermines the arms comparison.** Whether the personalisation coefficient fires depends on whether a key is present in the environment, not on the declared configuration — so two runs of the same declared setup can measure different things (RA-22, RA-23).
3. **Cost and latency arrive unannounced**, on a path documented as offline.

## Proposed fix
`requireCredential` returns nothing in mock mode, so the deterministic fallbacks run exactly as documented. `readCredential` must stay as it is — webhook signature verification has to work in either mode and already fails closed on a missing secret (RA-01).

Using the models then requires declaring it: `RECOVERAI_MODE=live`.

## Acceptance criteria
- [ ] A mock-mode run makes no outbound Gemini or Razorpay call, whatever is in the environment
- [ ] Live mode is verified to work against real credentials
- [ ] The deployment's intended mode is documented, since running mock means running no AI

## Related
RA-24 (declared vs inferred mode), RA-22 / RA-23 (the measurement this silently affects)
