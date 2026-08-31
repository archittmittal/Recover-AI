<!-- labels: bug,medium,recovery-engine -->
# RA-15 — Strategy configuration is defined per strategy, then overridden with constants

**Severity:** Medium · **Area:** `src/lib/recovery/coordinator.ts` · **Est:** 1 h

## Summary
`STRATEGY_CONFIGS` is a well-designed table that the coordinator only partially consults. `maxAttempts` is hardcoded to 3 and the discount is hardcoded to 10%, ignoring the per-strategy values.

## Location
`src/lib/recovery/coordinator.ts:86` and `:211`

## Evidence
```ts
maxAttempts: 3,   // ignores STRATEGY_CONFIGS[strategy].maxAttempts

const discount = nextAttempt > 1 && strategyConfig.allowDiscount ? 10 : 0;
              // ignores strategyConfig.maxDiscountPercentage
```
`merchant_alert` declares `maxAttempts: 1` because it escalates a merchant-side configuration error — nothing the customer can act on. It currently gets three. `allowDiscount` is honoured but its cap is not, so the concession is a fixed 10% regardless of what the strategy permits.

## Impact
Customers receive outreach for failures they cannot resolve. More importantly, a discount is a financial concession being granted autonomously by an AI agent against a limit the code does not read — the governance control exists in the config table but not in the execution path.

## Proposed fix
Read both from config at journey creation and at dispatch:
```ts
const cfg = STRATEGY_CONFIGS[selectedStrategy];
// journey creation
maxAttempts: cfg.maxAttempts,
// dispatch
const discount = nextAttempt > 1 && cfg.allowDiscount ? cfg.maxDiscountPercentage : 0;
```
Write the authorising cap into the `outreach_dispatched` audit entry alongside the applied discount, so every concession is traceable to the policy that permitted it.

## Acceptance criteria
- [ ] `recovery_journeys.max_attempts` matches the strategy's configured value
- [ ] A `merchant_alert` journey sends exactly one message
- [ ] Applied discount never exceeds `maxDiscountPercentage` for the strategy
- [ ] `outreach_dispatched` audit entries record both the applied discount and the authorising cap
- [ ] Test covering each strategy's attempt count and discount ceiling

## Related
RA-07 (`retryIntervalsHours`, the third ignored config field)
