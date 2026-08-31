# RecoverAI — Engineering Log

**What broke, and how we got out.**

The Razorpay Buildathon application asks for this specifically, and says it is the answer they read
first. This log is therefore written **as things happen**, not reconstructed before the deadline — a
reconstructed version would be tidier, less accurate, and obviously so.

Entries are append-only and newest-first. Failures stay in the log even after they are fixed; a log
containing only successes is not a log.

---

## 2026-08-31 — The AI had never run, and three separate things were hiding behind the silence

**What broke:** Nothing, visibly. That was the problem.

`.env` still held `XXXXXXXX` placeholders, and three places decided whether to call a real service by
checking whether a credential contained that string. So the whole system ran in simulation: no Gemini
call, no Razorpay call, ever. The fallbacks are good enough — deterministic templates, a lookup-based
classifier — that the product looked entirely healthy while demonstrating none of its own thesis.

Putting real keys in revealed two more failures stacked behind the first, neither visible by reading
the code:

**1. The configured model was retired.** `gemini-2.5-flash` answers `404 — no longer available to new
users` for any newly issued key. Even with a valid key, every message had been taking the template
path for this reason alone. A second, freshly issued key made no difference — it was never a key
problem.

**2. The validator was rejecting its own correct output.** With a live model finally answering, messages
*still* fell back. Gemini was returning a well-formed message with the link and amount intact, and the
validator threw it away: the URL match was `\S+`, which is greedy, so a link ending a sentence
captured the trailing full stop and compared unequal to the real link.

**3. The validator was accepting a second payment target.** Probing it the way a Razorpay reviewer
would — this is a payments track, and the reviewers write payment systems — the RA-03 link check
turned out to match `https?://` and nothing else. Five payloads shipped clean:

```
upi://pay?pa=fraud@okaxis&am=2499   ACCEPTED
rzp-verify.example/pay              ACCEPTED
www.rzp-secure.example              ACCEPTED
tel:+919999999999                   ACCEPTED
wa.me/919999999999                  ACCEPTED
```

The UPI one is the sharp edge. On Android that opens a UPI app pre-filled to pay an attacker's VPA —
no phishing page, no credential capture, just a payment to the wrong person. In an Indian payments
context it is the obvious attack, and the validator did not look for it.

**How we got out:** Replaced all three credential sniffs with one declared `RECOVERAI_MODE=mock|live`;
`live` refuses to start on a placeholder instead of degrading quietly. Pinned `gemini-3.6-flash` (not
`-latest` — a floating alias can move the model under a recorded demo), overridable via `GEMINI_MODEL`
so the next retirement is a config change. Trimmed trailing punctuation before comparing links.

For the third, inverted the check. Enumerating bad schemes is a blocklist and loses to the next one,
so instead the known-good payment link is removed from the message and **anything link-shaped left
behind rejects it** — any scheme with an authority, actionable schemes without one, bare and `www.`
domains, UPI VPAs. Tuned deliberately broad, because the asymmetry decides it: a false positive costs
a personalised message, a false negative sends a customer an attacker's payment target. Verified the
breadth is not a problem in practice — 5/5 live Gemini messages pass across WhatsApp/SMS and
English/Hindi.

**What we took from this:** A fallback that is too good hides the thing it is falling back from. Every
one of these was invisible to review and to a green test suite; all three needed the path actually
run, with real credentials, and then attacked. The fallbacks were the right design — a Gemini outage
should not stop recovery — but "degrades gracefully" and "has never once succeeded" look identical
from the outside unless something makes the difference observable. There is now a preflight line
naming the active mode, and `isTemplateFallback` on every audit row.

---

## 2026-08-31 — The log was the least accurate document in the repository

**What broke:** A pre-submission readiness review, run against the Track 3 criteria rather than
against the code, found five gaps. Four of them were the same shape: **a claim shipped ahead of its
implementation.** The README described a three-arm experiment that is two hardcoded constants. The
task board read 83/83 with a ✅ on the arm harness. `DEPLOYMENT.md` documented a Turso deployment path
with no libSQL anywhere in the project.

And this file — the one the organisers say they read first — described two unbuilt systems in the past
tense, in an entry whose closing line is *"be precise about which claim is being made, because
conflating them is the fastest way to lose an evaluator's trust."*

That is the worst place for it. An evaluator who reads that paragraph, is impressed, opens
`src/lib/simulation/` to look at the model, and finds it was never written does not conclude we ran
out of time. They conclude the log is written to impress rather than to record — and then every
accurate entry becomes suspect too.

**How we got out:** Corrected every entry against the codebase rather than against memory. Four
inline `> Correction` blocks now sit next to the claims they fix, with the original reasoning left in
place: deleting it would hide the more instructive failure. A fifth marks the `CREATE TABLE IF NOT
EXISTS` fix as superseded.

The sweep found more than the review did. The virtual clock (task 8.1, marked ✅ **and** named on the
critical path) is `VirtualClock` in `src/lib/utils/time.ts`, referenced by nothing: no route advances
time, no `clock_advanced` event exists. The injectable `Clock` and `FixedClock` *are* real and carry
the boundary tests — but the demo-facing half, the half that makes `smart_retry` and contact-hours
deferral visible to an evaluator at all, was never built.

**What we took from this:** Writing the log as things happen is necessary but not sufficient. These
entries *were* written on the day — that is exactly how a design decision reached the page in the past
tense hours before anyone tried to implement it. The missing discipline is the cheap one: an entry
naming a file should not merge until that file exists, and a ✅ should require a reachable behaviour,
not a written intention.

---

## 2026-08-26 — An external audit found 21 defects, and the tests could not see any of them

**What broke:** A partner-integration review of `recover-ai @ v0.1.0` returned 21 findings. Four
critical, six high — and every critical was reachable by an unauthenticated request from the open
internet.

The bad ones, roughly in order of how much they would have cost:

- **Webhook signature verification failed open.** The check was wrapped in `if (secret && ...)`, so an
  unset `RAZORPAY_WEBHOOK_SECRET` turned the endpoint into an unauthenticated write. The HMAC itself
  was correct — timing-safe, length-guarded. Only the guard around it was wrong, which is the version
  that survives review, because the part everyone inspects looks right.
- **Prompt injection could swap the payment link.** The output validator accepted any message
  containing the substring `http`, which a substituted phishing URL satisfies exactly as well as the
  real link.
- **Idempotency keyed off a field that did not exist**, so replay protection did nothing.
- **The communication layer was dead code** — written, tested in isolation, and unreachable from the
  dispatch path.
- **Opt-out matching was wrong in both directions**: it missed real opt-outs and fired on messages
  that were not.

**How we got out:** 21 branches, 28 merged pull requests, one issue each, over four days. The
substantive part was not the fixes; it was that **the test suite passed cleanly throughout.** It could
not fail on any of these defects, because it tested units in isolation and never exercised a request
end to end. `RA-18` exists for that reason and is the finding that keeps the other twenty fixed.

**What we took from this:** A green suite measures the questions you thought to ask. Every one of
these was found by someone reading the code adversarially — none by a test, a type, or a linter. The
lasting change is that a fix now ships with a test that fails without it, which is why the later
`upi://` bypass (2026-08-31) was caught by probing rather than by hoping.

---

## 2026-08-23 — OpenSSF Security Hardening, Clean CI Runner Invariants, and Serverless Portability

**What broke:** When running the end-to-end smoke test suite on ephemeral GitHub Actions Linux runners, SQLite initialized without existing tables, throwing `SqliteError: no such table: audit_logs`. Furthermore, cross-platform Node 22 build requirements on Linux runners initially failed due to native SWC binaries when building Next.js 16 under standard webpack bundling.

**How we got out:**
1. **Self-Healing SQLite Initialization**: Implemented idempotent DDL table creation (`CREATE TABLE IF NOT EXISTS`) directly inside `getOrCreateDb()` in `src/lib/db/index.ts`. This guarantees that ephemeral CI runners, local tests, and new deployment containers auto-create tables on connection without requiring external migration commands.

   > **Superseded, 2026-08-31 (#163).** This fix worked for fresh databases and quietly broke every
   > existing one: `IF NOT EXISTS` is a no-op against a table that already exists, so a database
   > could never pick up a schema change once created. It also left the schema declared in three
   > places that could disagree — this DDL, `schema.ts`, and four migration files nothing applied.
   > Replaced by running the Drizzle migrations on connect, which keeps the zero-config property
   > this entry was reaching for while letting an existing database actually converge.
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
a controlled distribution of `error_reason` values.** The batch evaluation therefore uses locally
constructed failure records matching Razorpay's schema. Documented as a disclosed trade-off rather
than quietly worked around.

> **Correction, 2026-08-31.** This previously said the batch is driven by signed payloads *posted
> through the real ingestion endpoint*. It is not: `/api/simulator/seed` calls `seedDatabase()` and
> writes rows directly. Signature-verified ingestion is real and exercised — by the webhook test
> suite, not by the batch.

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
catch-all default**. An unrecognised source now returns `strategy: null` with
`category: 'UNCLASSIFIED'` (`src/lib/recovery/classifier.ts`) and goes to the exception list. Guessing would have produced a confident wrong action; the exception list produces an honest
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

**How we got out — and what is actually built.**

> **Correction, 2026-08-31.** This entry previously described both changes below in the past tense,
> as though they had shipped. They had not. `src/lib/simulation/response-model.ts` and
> `docs/SIMULATION_MODEL.md` do not exist, and the "three arms" are two hardcoded constants in
> `src/app/api/metrics/route.ts`. The design below was genuinely decided on this date; the
> implementation was not done. Tracked as [#160](https://github.com/archittmittal/Recover-AI/issues/160)
> and [#161](https://github.com/archittmittal/Recover-AI/issues/161). Leaving the reasoning in place
> and correcting the tense, because the reasoning is the useful part and deleting it would hide the
> more instructive failure: we wrote up a fix for a credibility problem and then shipped the
> credibility problem.

*Declared response model — designed, not implemented.* Customer pay-probability should move out of the
seed script into `src/lib/simulation/response-model.ts`, with every coefficient sourced from a
published benchmark and cited in `docs/SIMULATION_MODEL.md`. Three rules were to keep it honest: the
RNG seeded from a constant so results reproduce exactly; **no agent code may import the model**, or the
agent would be marking its own homework; and every figure in the UI labelled as simulation output
rather than recovered rupees.

One of those three does exist: a CI gate (`Verify Architectural Boundary Separation`) fails the build
if anything under `src/lib/recovery/` or `src/lib/ai/` imports from a simulation module. The fence was
built before the thing it fences.

*Baseline arms — designed, not implemented.* A recovery rate quoted alone is unfalsifiable — recovered
compared to *what?* The intent is that every batch runs three arms over identical seeded data:
**(A)** no agent, **(B)** rules-only fixed-cadence dunning with no LLM and no per-failure strategy,
**(C)** the full agent. The honest headline is **C − B**, because B is what a cron job and a message
template would have achieved on their own. Reporting C alone would claim credit for the baseline's work.

The comparison was designed before any numbers existed, deliberately — so the framing could not be
chosen after seeing which one flattered the agent. If C ≈ B, that is a real finding and it gets
reported. As things stand no arm is measured, so no such claim can honestly be made yet.

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

**How we got out:** Introduced an injectable `Clock` interface (`src/lib/utils/time.ts`). No module
reads the system clock directly: production uses `SystemClock`, and tests use `FixedClock` pinned to a
constant, so the 07:59 / 08:00 / 19:01 IST boundary cases are deterministic instead of depending on
when CI runs. That part is real and load-bearing — `contact-hours-enforcement.test.ts` and
`retry-backoff-enforcement.test.ts` both depend on it.

> **Correction, 2026-08-31.** The rest of this entry described a demo-facing virtual clock that was
> never wired up. `VirtualClock` is defined in `src/lib/utils/time.ts` and referenced by nothing —
> there is no API route to advance time, no simulator control, and no `clock_advanced` audit event
> (the ten event types actually written are in `src/lib/recovery/coordinator.ts`). The two "guards"
> described below therefore do not exist, and neither does the contact-hours demo they enable.
>
> This matters more than a documentation slip: task 8.1 is marked ✅ on the board *and* named on the
> critical path, on the grounds that without it `smart_retry` and contact-hours deferral are
> undemonstrable. Both are still undemonstrable. Tracked as
> [#171](https://github.com/archittmittal/Recover-AI/issues/171).

The intended design, still unbuilt: advancing the clock writes a `clock_advanced` event to
`audit_logs`, so an evaluator scrubbing the timeline can see exactly where time moved and confirm no
stopping rule was skipped; and the clock never runs backwards during a demo, so scheduled actions
cannot replay. That would turn contact-hours enforcement from an invisible guarantee into a
demonstrable one: jump to 21:00 IST and watch every queued outreach defer with a logged reason, jump
to 09:00 and watch it resume.

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
