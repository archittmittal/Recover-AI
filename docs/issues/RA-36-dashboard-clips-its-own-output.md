<!-- labels: medium,ui,demo-integrity -->
# RA-36 — The dashboard clips its own output, and the header contradicts the agent

**Severity:** Medium · **Area:** `src/components/**`, `src/lib/utils/money.ts` · **Est:** 4-6 h

## Summary
The interview round is a live walkthrough of this dashboard. Nine separate places cut text off
mid-word, the header reported a different time from the one the agent was acting on, and the
records table logged 150 React errors per page load. None of these change what the agent does;
all of them are visible on the screen a judge is looking at while it does it.

## Evidence

### 1. The header disagreed with the audit trail (worst of the set)
`src/components/navigation/Navbar.tsx` formatted `new Date()` in the browser. The agent reads
the demo clock. After advancing to 09:30 IST the pill still read **"Outside Contact Hours"**
while the agent was actively dispatching — the header denying the rule the header exists to
demonstrate, on the one criterion the track names explicitly.

### 2. 150 duplicate React keys per page load
`CustomerTable` and `CustomerSelector` keyed rows by `customer.id`. `/api/customers` returns one
row **per journey**, and the batch seeds every customer into all three arms, so each id appeared
two or three times:

```
Encountered two children with the same key, `cust_0000000000000003`.
Non-unique keys may cause children to be duplicated and/or omitted.
```

The same defect made the table read as duplicated customers, with nothing on screen to say the
rows were different experiment arms.

### 3. Money rendered with a dropped digit
`(paise / 100).toLocaleString('en-IN')` drops a trailing zero. 73280 paise rendered **₹732.8**,
in customer-facing WhatsApp and SMS copy, the voice script, and the dashboard — 14 call sites.
Measured against the live Gemini path:

```
"Aapka ₹732.8 ka payment complete nahi ho paya."
```

`README.md` claims monetary amounts are "always read from the database" because "a hallucinated
figure in a payment message is unrecoverable". The figure was not hallucinated; it was malformed.

### 4. Clipped text, nine places
| Symptom | Cause |
| :--- | :--- |
| Navbar wrapped to two lines from 1440px down | no `whitespace-nowrap` on nav labels |
| "Log out" rendered as "Log" at 900px | button clipped rather than collapsed |
| Navbar overflowed its row by 72px at 768px | inline nav shown from `md` with no room for it |
| "21:00 (after hours)" cut to "21:00 (after hour" | 4-column grid at ~130px per cell |
| Y-axis tick "₹1400k" cut off | negative `left` chart margin |
| Channel card overflowed by 50px | flex row with no `min-w-0` |
| "Conversational Dunning" overprinted by its own count | fixed-width label vs non-shrinking count |
| "Dispatched" clipped in the stat columns | 3 cards x 3 sub-stats in a half-width card |
| "Opt-Out Rate (Stopping Rul..." | six KPI cards across at `xl`, ~190px each |

### 5. Unmeasured numbers presented as results
`ChannelComparison` hardcoded **"98% Open Rate"** and "Fastest settlement via 1-click Razorpay
Link". Neither was ever measured. They sat on a dashboard whose entire claim is that every
figure is either computed or a declared estimate, directly beside the banner saying so.

### 6. Emoji as UI chrome
Simulator buttons rendered a lucide icon *and* an emoji for the same concept
(`<CreditCard/> 💳 Pay with Link`). Message templates carried 🙏, 👉 and 👋 while the LLM path
produced none, so the register changed visibly depending on which path served the message.

## Proposed fix
1. Navbar reads `/api/simulator/clock`, and marks the clock `SIM` when the offset is virtual.
2. Key rows by `journeyId`; add an Arm A/B/C badge so three rows per customer read as the
   three-arm design rather than as broken data.
3. One `formatPaise` / `formatRupees` helper; whole rupees stay whole, paise keep both digits.
4. `min-w-0` / `shrink-0` / `whitespace-nowrap` at each clipping site; nav moves to `lg`; KPI
   grid caps at three columns; chart margin corrected and ticks switched to Indian units (₹14.0L).
5. Replace the invented engagement stats with factual labels.
6. Remove every emoji from `src/`, and add a no-emoji rule to the generation prompt so LLM copy
   cannot reintroduce the inconsistency.

## Acceptance criteria
- [ ] Zero clipped elements and no horizontal page scroll at 400px, 1024px and 1440px
- [ ] Zero console errors on every page
- [ ] The contact-hours pill agrees with the agent after the clock is advanced
- [ ] `formatPaise(73280) === '₹732.80'` and `formatPaise(249900) === '₹2,499'`
- [ ] No emoji anywhere under `src/`
- [ ] No number on the dashboard that is not computed or a declared estimate
