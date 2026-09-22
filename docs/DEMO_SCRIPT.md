# RecoverAI — 5-Minute Demo Video & Pitch Script

> **Track:** Razorpay AI Buildathon 2026 — Track 3 (Autonomous Revenue Recovery)
> **Target length:** 4:30 – 5:00
> **Presenter:** Archit Mittal

Razorpay's submission is three things: a public repo, architecture documentation, and a five-minute
video. There is no resume screen — shortlisted builders go straight to a panel interview, so this
video is the filter.

The stated evaluation signals are: working functionality, code quality and execution depth, measured
results, audit trails and explainability, and graceful failure handling. Every one needs a visible
moment on screen. The Track 3 bar is narrower still — *measured money recovered with compliant
escalation and audit documentation*.

---

## Rule zero: read numbers off the screen

Every figure below was measured on 2026-09-05 against the real app, and is recorded here so you know
what to expect — **not so you can quote it.** Seeds, timing and clock position move these. If the
screen and this document disagree, the screen wins and this document is stale.

---

## Pre-flight (do this before recording)

Verified working end to end on 2026-09-05. Follow it exactly; the ordering matters.

**1. Decide the mode, and say which one you are in.**

`.env` currently has `RECOVERAI_MODE=mock`. In mock mode **no Gemini call and no Razorpay call is
made** — copy comes from deterministic templates. That is a legitimate demo, but it means you cannot
claim the LLM is writing the messages you are showing.

- Demoing in **mock**: say "running in mock mode, so message copy is the deterministic template
  fallback" once, early. Do not describe personalised AI copy.
- Demoing in **live**: set `RECOVERAI_MODE=live` and confirm the preflight line names it. Live mode
  refuses to start on placeholder credentials, which is the point of the flag.

Whichever you pick, the three-arm numbers are unaffected — the personalisation coefficient does not
fire in mock mode either way (RA-24).

**2. Build the demo state.** Log in, then on `/simulator`, in this order:

| # | Action | What it produces |
| :--- | :--- | :--- |
| 1 | **Seed 50+ Failures Batch** | 150 failures — the same 50 materialised into arms A, B and C |
| 2 | **21:00 (after hours)**, then **Run AI Recovery Agent** | Zero dispatches. This is the deferral shot. |
| 3 | **09:00 (next morning)**, then **Run AI Recovery Agent** | First WhatsApp wave, first resolutions |
| 4 | **+24 hours** → **Run**, three times | Escalation to SMS then voice; exhaustion; a populated exception list |

Step 4 is not optional. After step 3 only WhatsApp has fired — SMS and voice both sit at zero
attempts, and the escalation ladder is the thing you are claiming. Three more days of simulated time
is what makes attempts 2 and 3 real.

**Measured after the full sequence (2026-09-05):**

- ₹620,646 at risk, ₹140,854 recovered, 22.7%
- Arm A 0% · Arm B 20% · **Arm C 22.7% · net lift +2.7 pts**
- WhatsApp 167 attempts / 33 recovered · SMS 32 / 9 · Voice 18 / 3 · Email 10 / 1
- 24 resolved, 17 exhausted, 1 opted out, 8 still recovering
- 98 `outside_contact_hours` stopping-rule events, 2 `dnd_active`

**3. Verify the suite.** `npm test` → **335 tests across 48 files, ~3 seconds.** Run it once
beforehand so it is warm and finishes on camera.

**4. Pre-open every tab** in order: `/`, `/simulator`, `/customers`, a terminal, and
`docs/ENGINEERING_LOG.md`. Never type a URL on camera.

---

## Shot list

| Time | Scene | Screen | Point being made |
| :--- | :--- | :--- | :--- |
| 0:00–0:35 | Cold open | Dashboard, ₹ at risk | The problem, and that this agent acts rather than alerts |
| 0:35–1:35 | Measurement | Three-arm chart | C − B, and the sign flip. Your strongest card. |
| 1:35–2:45 | Compliance + audit | `/simulator` clock → audit timeline | Deferral is visible, escalation is real, every event logged |
| 2:45–3:35 | Stopping rules | Simulator STOP / Pay | Graceful failure, and the no-guess classifier |
| 3:35–4:25 | Engineering | `npm test`, the `upi://` finding | Depth, and adversarial self-review |
| 4:25–4:50 | Close | Engineering log | Honest record |

---

## Spoken script

### [0:00 – 0:35] Cold open

No greeting. No unsourced market-size number.

> "A payment fails at the issuer. A checkout dies at the OTP screen. A subscription mandate breaks on
> renewal. An invoice goes overdue. Individually, small leaks. Together, that is how Indian merchants
> lose revenue — silently, and nobody is watching.
>
> RecoverAI is an autonomous agent that closes the loop: detect, diagnose, decide, execute, measure.
> Not an alert — it runs the recovery until the money is back or a hard rule stops it. Let me show
> you it running."

---

### [0:35 – 1:35] The measurement

Screen: `/` — metrics cards and the three-arm panel.

> "First, how I know it works — because a recovery rate on its own is unfalsifiable. Recovered versus
> *what?*
>
> Every batch runs three arms over identical seeded data. Arm A: no agent, detected and recorded,
> never contacted. Arm B: rules-only dunning — fixed cadence, one template, no LLM. Arm C: the full
> agent. The honest headline is C minus B, because Arm B is what a cron job and a message template
> would have achieved on their own.
>
> On this batch, that is **[read A, B, C and the lift off the screen]**.
>
> But here is the part I would rather you knew. Under the first version of my response model, the
> same harness measured **minus 7.1 points** — the agent lost. I found the reason, declared the fix
> in an issue before making it, re-measured, and ran an ablation. The ablation says neither change
> alone is significant, and that most of the swing is Arm B *falling* rather than Arm C rising. By
> journey count the edge is under half a journey in fifty.
>
> The customers are synthetic, so I do not get to claim rupees. The response model lives in its own
> file with benchmark-sourced coefficients and a fixed seed, and no agent code is allowed to import
> it — otherwise the agent is marking its own homework."

**Presenter note.** Two different numbers exist and they are not interchangeable. The dashboard shows
**one batch**. `npm run eval:arms` shows **+2.8 points by amount, +0.7 by journeys, positive in 24 of
25 replications**, recorded in `docs/SIMULATION_MODEL.md`. Say which one you are quoting. Conflating
them is the exact failure this project spent an engineering-log entry on.

---

### [1:35 – 2:45] Compliance you can see, and the audit trail

Screen: `/simulator`, simulated clock controls.

> "The compliance story plays out over days, so I move the clock rather than fake the result.
>
> *[Click 21:00 (after hours), then Run AI Recovery Agent]*
> It is past nine at night. The RBI fair-practice contact window closes at seven. The agent
> dispatches nothing — and every deferral is written to the audit log with the rule that fired. It
> did not fail. It declined.
>
> *[Click 09:00 (next morning), then Run AI Recovery Agent]*
> Same queue, same agent, twelve hours later. Now it dispatches — WhatsApp on the first attempt, SMS
> on the second, a voice call on the third.
>
> *[Open Customers → a customer with several attempts → Audit Timeline]*
> This is that customer’s ledger — the agent’s arm, not the control. Every webhook, every classification, every dispatch, every
> stopping rule, in order, with the payload behind each one. On this batch the contact-hours rule
> fired **[read the count]** times.
>
> The clock only moves forward, and each advance is itself recorded as a `clock_advanced` row in
> `audit_logs`, so simulated time cannot be replayed to inflate a number. You are looking at
> simulated time, and the trail says so."

**Presenter note.** The timeline you are pointing at is **arm C**, the agent's own journey. Until
2026-09-05 this page took whichever journey the driver returned first — in practice arm A, the
no-outreach control, the one journey guaranteed to show nothing. If you are working from an older
build, check the arm before you record.

`clock_advanced` rows are written with a null `journey_id` on purpose — a process-wide event does not
belong in one customer's history — and are now merged into the timeline, scoped to that journey's
lifetime and badged **System-wide · not customer-specific**. At an equal timestamp the advance is
ordered before the dispatch it unblocked, so the row reads as cause then effect. You can point at it.

### [2:45 – 3:35] Stopping rules

Screen: `/simulator`, customer panel.

> "Five hard stops. Watch two of them.
>
> *[Send 'STOP']* The customer opts out. Journey marked opted-out, DND set on the record, every
> future attempt skipped with a logged reason.
>
> *[Pay with Link]* Payment lands. Journey resolved, amount recorded, outreach halts mid-sequence.
>
> And when the classifier meets an `error_source` it does not recognise — UPI adds `customer_psp`,
> `network`, `beneficiary_bank` on top of the card values — it does not guess. There is no catch-all
> default. It logs `unclassified_source` and the journey goes to the exception list. A guess produces
> a confident wrong action; the exception list produces an honest, countable one.
>
> *[Customers → Exceptions tab]* **[read the count]** journeys ended here, each with the reason
> recovery failed."

**Presenter note.** Pay and STOP act on the agent's arm, never arm A — a Pay click on the control
would contaminate it, and the route refuses (see `api/simulator/pay`). Worth ten seconds if the
demo is running long enough to fit it; it is a detail judges notice.

---

### [3:35 – 4:25] The engineering

Screen: terminal running `npm test`, then the validator finding.

> "An external audit found 21 defects in this codebase, and my test suite passed cleanly through all
> of them. Four were critical and reachable by an unauthenticated request. The worst: webhook
> signature verification failed open on an unset secret. The HMAC itself was timing-safe and
> correct — only the guard around it was wrong, which is the version that survives review, because
> the part everyone inspects looks right.
>
> Then I attacked my own LLM output validator, the way someone who builds payment systems would. It
> checked that the real payment link was present — but only matched `https?://`. So this went
> straight through: `upi://pay?pa=fraud@okaxis&am=2499`. On Android, that opens a UPI app pre-filled
> to pay an attacker's VPA. No phishing page, no credential capture, just money going to the wrong
> person.
>
> Blocking `upi://` is a blocklist and loses to the next scheme. So I inverted it: strip the
> known-good link out of the message, and reject if anything link-shaped is left behind. Tuned
> deliberately broad, because the costs are not symmetric — a false positive costs one personalised
> message, a false negative sends a customer an attacker's payment target.
>
> *[test run completes]* 331 tests, 47 files, three seconds. Every fix now ships with a test that
> fails without it — which is why the UPI bypass was caught by probing rather than by hoping."

**Claims that are safe to make here, and their exact scope:**

| Say this | Because |
| :--- | :--- |
| "Timing-safe HMAC with a length guard" | `crypto.timingSafeEqual`, verified |
| "Replay protection via a SHA-256 payload hash" | `webhook_events.payload_hash` — true of *webhooks* |
| "Append-only audit log" | Accurate: insert-only, `audit_logs` |
| "335 tests across 48 files" | Measured 2026-09-05 |
| "No PII in prompts" | Data-minimisation is implemented; scope it to prompts |

**Do not say the audit log is cryptographically hashed or tamper-evident.** `audit_logs` has no hash
or chain column — id, journey, actor, event type, payload, timestamp. The SHA-256 hash is on
`webhook_events`, for replay protection, and that is a different claim. A judge who opens
`src/lib/db/schema.ts` will check.

---

### [4:25 – 4:50] Close

Screen: `docs/ENGINEERING_LOG.md`, scrolling.

> "All of this is in the engineering log — append-only, written as it happened, failures left in
> after they are fixed. Including the entry where I caught myself describing unbuilt systems in the
> past tense.
>
> RecoverAI turns silent revenue leaks into measured, auditable, compliant recovery. Repo and
> architecture docs are linked. Thanks."

---

## Recording mechanics

**Capture.** QuickTime is adequate. OBS (free) adds a webcam bubble — a face in frame helps on pitch
videos. Screen Studio (paid) auto-zooms on clicks, which matters here because the audit timeline is
dense.

**Settings.** 1920×1080. Browser zoom 110–125% — judges watch on laptops and the default renders the
timeline unreadable. Bookmarks bar hidden, macOS Focus on, desktop cleared.

**Audio beats video.** Any wired earbud mic beats the laptop built-in. Record in a soft room.

**Method.** Six takes, one per section, stitched in iMovie or CapCut. A single perfect five-minute run
is not worth chasing; energy flattens after the third attempt. Speak about 15% slower than feels
natural — this script is dense.

**Delivery.** Unlisted YouTube, not Drive — Drive permissions break and no judge will email you for
access. Title: `RecoverAI — Razorpay AI Buildathon 2026 — Track 3`. Repo link in the description.

---

## Claims audit

Checked against the running app on 2026-09-05. Kept here so the next revision does not quietly
reintroduce a corrected claim.

| Claim | Status |
| :--- | :--- |
| "21 automated invariant tests" | **Corrected** → 331 tests, 47 files |
| "Audit events cryptographically hashed" | **Removed** — no hash column on `audit_logs`; SHA-256 hash is on `webhook_events` |
| "`clock_advanced` rows visible on the timeline" | **Now true** — merged into the timeline and badged system-wide (was written but surfaced nowhere) |
| "15–20% of GMV lost to declines" | **Removed** — unsourced |
| "100% compliance with Indian financial regulations" | **Removed** — unfalsifiable; describe the specific rules enforced |
| "Personalised Hinglish AI copy" | **Scoped** — requires `RECOVERAI_MODE=live`; mock mode uses templates |
| "The timeline shows the agent's journey" | **Now true** — route prefers arm C (was defaulting to the arm A control) |
| Three-arm chart, clock controls, STOP, Pay, exception list | **Verified present and working** |
