# RecoverAI — Engineering Log

**What broke, and how we got out.**

The Razorpay Buildathon application asks for this specifically, and says it is the answer they read
first. This log is therefore written **as things happen**, not reconstructed before the deadline — a
reconstructed version would be tidier, less accurate, and obviously so.

Entries are append-only and newest-first. Failures stay in the log even after they are fixed; a log
containing only successes is not a log.

---

## 2026-08-23 — OpenSSF Security Hardening, Clean CI Runner Invariants, and Serverless Portability

**What broke:** When running the end-to-end smoke test suite on ephemeral GitHub Actions Linux runners, SQLite initialized without existing tables, throwing `SqliteError: no such table: audit_logs`. Furthermore, cross-platform Node 22 build requirements on Linux runners initially failed due to native SWC binaries when building Next.js 16 under standard webpack bundling.

**How we got out:**
1. **Self-Healing SQLite Initialization**: Implemented idempotent DDL table creation (`CREATE TABLE IF NOT EXISTS`) directly inside `getOrCreateDb()` in `src/lib/db/index.ts`. This guarantees that ephemeral CI runners, local tests, and new deployment containers auto-create tables on connection without requiring external migration commands.
2. **Timing-Safe HMAC & Replay Prevention**: Implemented `crypto.timingSafeEqual` with byte length assertions to resist side-channel timing attacks on webhooks. Built a SHA-256 payload hash cache in `webhook_events` to reject duplicate or replayed webhooks.
3. **Architectural Guardrails**: Added static CI analysis enforcing strict separation between simulation models and production recovery code, preventing testing artifacts from contaminating production logic.
4. **Deterministic Uptime Guarantees**: Configured multi-lingual template fallbacks for WhatsApp and SMS outreach to maintain 100% operational uptime when LLM endpoints experience rate limits or network degradation.

---

## 2026-08-21 — Four factual errors in the spec, found by reading Razorpay's docs instead of trusting the draft

**What broke:** The technical specification was written before the Razorpay API documentation was
checked line by line. Verifying it against the live docs turned up four errors, one of which would have
been embarrassing in front of a Razorpay evaluator.

**1. The test cards were Stripe's, not Razorpay's.**

The spec listed a magic-card table — `4000 0000 0000 0002` for a decline, `4000 0000 0000 9995` for
insufficient funds — presented as Razorpay test-mode behaviour. That is Stripe's test vocabulary.
Razorpay does not encode the failure scenario in the card number at all: the outcome is selected
interactively on the mock bank page, or by entering an OTP shorter than four digits.

This would have been caught instantly by the audience most likely to be reading — Razorpay engineers
know their own test flow — and it would have undermined every other technical claim in the document.

*How we got out:* Rewrote §7.5 around Razorpay's actual mechanism. This surfaced a real design
consequence that had been invisible while the wrong model was in place: **live test mode cannot produce
a controlled distribution of `error_reason` values.** The batch evaluation therefore drives the agent
with locally constructed webhook payloads matching Razorpay's schema, signed with the real secret and
posted through the real ingestion endpoint — with live test-mode checkout still used for the
end-to-end happy path. Documented as a disclosed trade-off rather than quietly worked around.

**2. WhatsApp is not a Payment Links notification medium.**

The spec had `notify_by/{medium}` triggering WhatsApp, and a create-link payload containing
`"notify": { "whatsapp": true }`. The API accepts `sms` or `email` only.

*How we got out:* Corrected both. This matters beyond a one-line fix, because WhatsApp is attempt #1 in
the escalation ladder and the entire channel argument rests on its ~90–98% open rate in India. The
honest position is now explicit: WhatsApp delivery is **simulated in-app**, and no claim is made that
Razorpay's link-notification API sends it.

**3. `error_source` is not a four-value enum.**

The classifier was designed around `customer | gateway | business | internal`. The documented values
are method-dependent: cards add `issuer_bank`, and UPI adds `customer_psp`, `network`, and
`beneficiary_bank`.

In a UPI-dominant market this is not an edge case — a meaningful share of real failures would have
fallen through to the classifier's default. Worse, those sources are *infrastructure* failures where
the customer did nothing wrong, so a default that routed them to customer outreach would have meant
messaging people about a problem they could not fix.

*How we got out:* Expanded the taxonomy, grouped all infrastructure sources into `smart_retry`, added a
`merchant_alert` strategy for `business`/`internal` (the customer cannot fix a merchant
misconfiguration, so they should never hear about it), and — the part that matters most — **removed the
catch-all default**. An unrecognised source now logs `unclassified_source` and goes to the exception
list. Guessing would have produced a confident wrong action; the exception list produces an honest
countable one.

**4. The webhook signature check was a timing oracle.**

The sample verification code compared HMAC digests with `===`, which short-circuits on the first
differing byte and leaks the expected signature through response timing.

*How we got out:* Switched to `crypto.timingSafeEqual` with an explicit length guard (it throws on
length mismatch). Also documented the adjacent trap: the HMAC must be computed over the **raw** request
body, because parsing JSON and re-serialising it changes the bytes and the signature will never match.

**What we took from this:** The spec was internally consistent and confidently written, which is
exactly why nobody questioned it. Internal consistency is not accuracy. Every external API claim now
carries a link to the page it came from and the date it was verified.

---

## 2026-08-21 — The recovery rate was going to be a measurement of our own random number generator

**What broke:** Not a crash — a reasoning failure, caught during a design review before any code was
written.

The plan was to seed 50+ synthetic failures, run the agent, and report the percentage of at-risk
revenue recovered. But the customers are synthetic, so *something* has to decide whether a simulated
customer pays after receiving a message. That something was an unspecified random draw that we would
have written and tuned ourselves.

Which means "RecoverAI recovered 62% of at-risk revenue" would not have been a measurement of the
agent. It would have been a measurement of our own RNG, with the agent as decoration. Any evaluator who
thought about it for thirty seconds would have seen that, and the headline number would have collapsed
at exactly the moment it was supposed to carry the most weight.

**How we got out:** Two changes, both structural.

*Declared response model.* Customer pay-probability moved out of the seed script into
`src/lib/simulation/response-model.ts`, with every coefficient sourced from a published benchmark and
cited in `docs/SIMULATION_MODEL.md`. Three rules keep it honest: the RNG is seeded from a constant so
results reproduce exactly; **no agent code may import the model**, or the agent would be marking its
own homework; and every figure shown in the UI is labelled as simulation output rather than recovered
rupees.

*Baseline arms.* A recovery rate quoted alone is unfalsifiable — recovered compared to *what?* Every
batch now runs three arms over identical seeded data: **(A)** no agent, **(B)** rules-only fixed-cadence
dunning with no LLM and no per-failure strategy, **(C)** the full agent. The honest headline is
**C − B**, because B is what a cron job and a message template would have achieved on their own.
Reporting C alone would claim credit for the baseline's work.

The comparison was built before any numbers existed, deliberately — so the framing could not be chosen
after seeing which one flattered the agent. If C ≈ B, that is a real finding and it gets reported:
it would mean the intelligence is not earning its complexity here, which is more useful and more
credible than quietly omitting the comparison.

**What we took from this:** A synthetic demo can prove that decisions are *correct* — right
classification, right strategy, right escalation order, right stop. It cannot prove money was made. Be
precise about which claim is being made, because conflating them is the fastest way to lose an
evaluator's trust.

---

## 2026-08-21 — The retry logic could never have fired during the demo

**What broke:** The retry cadence is T+1h, T+24h, T+72h. Contact hours are 08:00–19:00 IST. The demo is
five minutes long.

Read against the system clock, `smart_retry` — one of the four core strategies — can never execute
inside a demo. The channel escalation ladder never advances past attempt 1. And a demo recorded at
23:00 IST would show an agent that correctly refuses to do anything at all, which reads as a broken
product rather than a compliant one.

The most defensible behaviour in the entire system was also the least visible.

**How we got out:** Introduced an injectable `Clock` interface. No module reads the system clock
directly: production uses a real clock, tests use a fixed instant pinned to a constant (so the
07:59 / 08:00 / 19:01 IST boundary cases are deterministic instead of depending on when CI runs), and
the demo uses a virtual clock the simulator can advance.

Two guards make it defensible rather than a way to fake results: advancing the clock is itself written
to `audit_logs` as a `clock_advanced` event, so an evaluator scrubbing the timeline can see exactly
where time moved and confirm no stopping rule was skipped; and the clock never runs backwards during a
demo, so scheduled actions cannot replay.

This also turns contact-hours enforcement from an invisible guarantee into a demonstrable one: jump to
21:00 IST and watch every queued outreach defer with a logged reason, jump to 09:00 and watch it
resume.

**Related, found in the same pass:** checkout abandonment has no webhook and cannot have one —
abandonment is defined by the *absence* of an event, and absence never arrives as a callback. It needs
a periodic sweep over stale unpaid orders, which nothing in the plan had accounted for. Added as
`abandonment-sweep.ts`, with an idempotency guard so repeated sweeps do not open a fresh journey for
the same cart on every pass.

---

## Template for future entries

```markdown
## YYYY-MM-DD — One-line summary of what broke

**What broke:** Symptom, and how it was noticed.

**How we got out:** What was tried, what failed, what worked.

**What we took from this:** The generalisable lesson, if there is one. Omit if there isn't —
not every bug is profound.
```
