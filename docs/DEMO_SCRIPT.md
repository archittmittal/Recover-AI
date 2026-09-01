# RecoverAI: 5-Minute Demo Video & Pitch Script

> **Track**: Razorpay Buildathon 2026 — Track 3 (Autonomous Revenue Recovery Agent)  
> **Target Length**: 4:30 – 5:00 minutes  
> **Presenter**: Archit Mittal

---

## 🎬 Video Production Overview

| Time | Scene | On-Screen Action | Key Talking Points |
| :--- | :--- | :--- | :--- |
| **0:00 – 0:45** | **Hook & The Problem** | Title slide / Hero Dashboard with ₹ at Risk | Razorpay merchants lose 15–20% of GMV to avoidable declines. Static dunning has low conversion; non-compliant outreach risks heavy penalties. |
| **0:45 – 1:45** | **Executive Dashboard & 3-Arm Lift** | Navigate `/` → Highlight Metrics Cards & 3-Arm Chart | 6 Real-time KPIs. Three-arm comparison over one seeded batch, every rate measured from that arm's own journeys. **Read the lift off the screen — do not quote a number from this script.** |
| **1:45 – 2:45** | **Multi-Channel Escalation, Contact Hours & Audit** | `/simulator` → advance the clock to 21:00 IST, run the agent, advance to 09:00 → "Customers" → Audit Timeline | WhatsApp (Attempt 1) → SMS (Attempt 2) → AI Voice (Attempt 3). Outreach **defers** after 19:00 IST with a logged reason, then resumes in the morning. Immutable audit logs, including the `clock_advanced` rows. |
| **2:45 – 3:45** | **Interactive Sandbox & Stopping Rules** | Navigate `/simulator` → Select customer → Trigger "Pay Now" & "STOP" | Dual-panel testbed. Live payment link settlement; instant STOP opt-out compliance (Stopping Rule #2); live IST RBI contact hours clock (8AM–7PM). |
| **3:45 – 4:30** | **OpenSSF Security & Architecture** | Show test suite (`npm test`) & CI workflows | Timing-safe HMAC verification (`crypto.timingSafeEqual`), DPDPA zero PII in prompts, append-only audit trail, 21/21 automated invariant tests. |
| **4:30 – 5:00** | **Summary & Business ROI** | Return to Overview Dashboard | RecoverAI turns failed payments into settled revenue without risking customer trust or compliance. |

---

## 🎙️ Spoken Script (Word-for-Word)

### [0:00 – 0:45] The Revenue Leakage Crisis
> *"Hello judges! For Indian internet businesses processing crores on Razorpay, payment failures represent a silent 15 to 20% revenue leakage. When an authorization fails—whether due to 3DS timeouts, daily limits, or expired cards—standard dunning is blunt: generic emails that go to spam, or aggressive phone calls that violate RBI guidelines.*
> 
> *Welcome to **RecoverAI**, an autonomous, compliance-first revenue recovery agent built specifically for Razorpay's ecosystem. RecoverAI diagnoses the exact failure root-cause, orchestrates intelligent multi-channel failover, and speaks to customers in natural Hinglish—all while enforcing strict regulatory stopping rules."*

---

### [0:45 – 1:45] Command Center & Scientific 3-Arm Evaluation
> *(Screen shows `http://localhost:3000`)*
> *"Here in the Executive Command Center, merchants have full visibility into revenue at risk versus recovered. 
> 
> Rather than making ungrounded claims, RecoverAI evaluates itself through a **three-arm comparison** over one seeded batch, materialised into three identical cohorts:
> - **Arm A**: no agent — detected and recorded, never contacted.
> - **Arm B**: rules-only dunning — fixed cadence, one template, no LLM.
> - **Arm C**: the full agent.
> 
> The metric that matters is the **Net Lift (C minus B)**, and every one of those three rates is computed from that arm's own journeys — there is no constant anywhere in the metrics route."*

> **Presenter note — read the number off the screen, and say where it came from.**
> Over 25 replications (`npm run eval:arms`, recorded in `docs/SIMULATION_MODEL.md`), C − B is
> **+2.8 points by amount and +0.7 by journeys** — positive in 24 of 25 runs. Do not stop there,
> because the interesting part is the history:
>
> - Under response model **v1.0.0** the same harness measured **−7.1 points**. The agent lost.
> - **v1.1.0** changed two coefficients — email fits a B2B invoice, and a message repeated on the
>   channel that was just ignored decays — and the sign flipped.
> - The ablation says **neither change alone is significant**, and that most of the swing is Arm B
>   *falling* rather than Arm C rising.
> - By journey count the edge is under half a journey in fifty. In plain terms: under this model
>   the agent's measurable advantage is mostly that it sends invoices by email.
>
> Say that out loud. A judge who hears "we measured −7, we found the reason, we declared the fix
> in an issue before we made it, we re-measured at +2.8 and here is the ablation showing how much
> of that is the baseline moving" learns far more about this team than one who hears a headline
> percentage. And the personalisation coefficient still never fires in mock mode, so none of this
> is evidence for or against the LLM copy — that needs a live key (RA-24)."*

---

### [1:45 – 2:45] Contact Hours, Escalation & the Immutable Audit Ledger
> *(Start on `/simulator`. Use the **Simulated Clock** controls — RA-31.)*
>
> *"The compliance story is the part you cannot see in a five-minute demo, because it plays out
> over days. So we move the clock instead of faking the result.*
>
> **1. Jump to 21:00 IST** — click *21:00 (after hours)*, then *Run AI Recovery Agent*.
> *"It is now past nine at night. The RBI Fair Practices contact window closes at 7pm, so the
> agent dispatches nothing. Every deferral is logged with the rule that fired — it did not fail,
> it declined."*
>
> **2. Jump to 09:00 the next morning** — click *09:00 (next morning)*, then *Run AI Recovery Agent*.
> *"Same queue, same agent, twelve hours later. Now it dispatches — WhatsApp first, then SMS on
> the second attempt, then a voice call on the third."*
>
> **3. Open the audit trail** — *(Click "Customers & Audit" → "Audit Timeline" on Aarav Sharma)*
> *"Every jump I just made is in the ledger as a `clock_advanced` row — who moved time, from
> when, to when. The clock only moves forward, so nothing can be replayed to inflate a number,
> and the only way back to real time is reseeding, which deletes the journeys first. You are
> looking at simulated time, and the trail says so."*
> *"Every customer journey follows an escalation ladder:
> 1. **Attempt 1**: WhatsApp Interactive Message with a direct Razorpay payment link.
> 2. **Attempt 2**: Personalized SMS with regional language support.
> 3. **Attempt 3**: AI-driven Voice Call in Hinglish.
> 
> Notice our **Immutable Audit Ledger**. Every webhook received, Gemini reasoning step, message dispatched, and customer reply is cryptographically hashed and permanently logged. Click any event to inspect the raw JSON payload."*

---

### [2:45 – 3:45] Live Interactive Sandbox & Regulatory Stopping Rules
> *(Navigate to `/simulator`)*
> *"Let’s test the engine in the **Interactive Simulation Sandbox**.
> 
> When we simulate a customer clicking **'Pay with Razorpay Link'**, the recovery engine immediately settles the amount, updates our dashboard, and moves the journey to `Resolved`.
> 
> Now watch what happens when a customer replies **'STOP'**. Under RBI guidelines and DPDPA, all outreach must halt immediately. RecoverAI detects the opt-out keyword, updates the customer to DND status, and aborts any future scheduled attempts.
> 
> Notice the top-right clock: RecoverAI strictly enforces the **8:00 AM to 7:00 PM IST contact window**, automatically deferring night-time actions."*

---

### [3:45 – 4:30] OpenSSF Security & Correctness
> *(Show terminal running `npm test`)*
> *"RecoverAI is built following OpenSSF Best Practices:
> - **Timing-Safe HMAC**: Webhooks use `crypto.timingSafeEqual` to prevent side-channel timing attacks.
> - **Zero PII Exposure**: Card numbers, phones, and bank details are stripped before LLM prompting.
> - **Deterministic Guardrails**: 21 automated invariant tests verify stopping rules, contact hours boundaries, and idempotency."*

---

### [4:30 – 5:00] Conclusion
> *"RecoverAI bridges the gap between payment failure and revenue settlement. It protects merchant revenue, respects consumer privacy, and maintains 100% compliance with Indian financial regulations.
> 
> Thank you!"*
