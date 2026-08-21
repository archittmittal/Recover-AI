# RecoverAI

**Smart Revenue Recovery Agent** — built for the Razorpay AI Buildathon 2026, Track 3: *AI Revenue Recovery*.

> Find revenue that's slipping away and win it back.

RecoverAI is an autonomous agent that detects revenue at risk — payment failures, checkout abandonment, failed subscriptions, overdue B2B invoices — diagnoses the root cause, picks the right recovery intervention, and executes a bounded, compliant outreach workflow until the money is recovered or the agent stops on a hard rule.

It doesn't just flag the problem. It shows **measured money recovered across a batch**, with compliant escalation, stopping rules, and a full audit trail — the explicit bar set by the track.

---

## Status

🚧 **Early build.** Project scaffolding is in place; the agent core, dashboard, and simulator are being built out per [`docs/TASKS.md`](docs/TASKS.md). See [`docs/PRD.md`](docs/PRD.md) and [`docs/PROJECT_DOCUMENTATION.md`](docs/PROJECT_DOCUMENTATION.md) for the full spec and architecture. Progress is tracked via [GitHub Issues](https://github.com/archittmittal/Recover-AI/issues).

---

## What it does

1. **Detect** — Ingests simulated Razorpay webhooks (`payment.failed`, `subscription.pending`, `subscription.halted`, `invoice.expired`, etc.) and checkout drop-off events.
2. **Diagnose** — Classifies the failure using Razorpay's `error_source` / `error_step` / `error_reason` fields, falling back to an LLM (Gemini) for ambiguous cases.
3. **Decide** — Selects one of four recovery strategies: `smart_retry`, `payment_link`, `conversational`, or `invoice_reminder`.
4. **Execute** — Runs a bounded, multi-channel recovery sequence (WhatsApp → SMS → Voice), generating personalized messages and Razorpay Payment Links.
5. **Measure** — Tracks revenue at risk vs. recovered, recovery rate, channel effectiveness, and produces an honest exception list for unrecoverable cases.

Every decision — classification, strategy choice, message sent, customer response, stopping-rule trigger — is written to an immutable audit log and viewable as a per-customer timeline.

---

## Recovery scenarios covered

| Scenario | Trigger | Recovery Action |
| :--- | :--- | :--- |
| Failed one-time payment | `payment.failed` | Classify → payment link → WhatsApp/SMS |
| Subscription charge failure | `subscription.pending` | Smart retry + dunning sequence |
| Subscription halted | `subscription.halted` | Final recovery link + downgrade offer |
| Checkout abandonment | No payment within threshold | Personalized reminder + incentive |
| Overdue B2B invoice | Invoice `expire_by` passed | Escalating reminder cadence |

---

## Stopping rules (non-negotiable)

The agent halts outreach immediately on:

- ✅ Payment success
- 🛑 Customer opt-out ("STOP")
- 🔁 Attempt exhaustion (3 max)
- 🕐 Outside RBI-mandated contact hours (8 AM–7 PM IST)
- 🚫 Customer marked DND

## Compliance

Built against RBI fair-practice guidelines, TRAI DLT template rules, and DPDPA data-minimization principles. Details in [`docs/PROJECT_DOCUMENTATION.md`](docs/PROJECT_DOCUMENTATION.md#9-compliance-framework).

---

## Tech stack

| Layer | Technology |
| :--- | :--- |
| Framework | Next.js 15 (App Router, TypeScript) |
| Styling | Tailwind CSS + shadcn/ui |
| Database | SQLite (`better-sqlite3`) |
| ORM | Drizzle ORM |
| AI/LLM | Google Gemini API (`gemini-2.5-flash`) |
| Charts | Recharts |
| Payments | Razorpay APIs (test mode) — Payment Links, Invoices, Subscriptions, Webhooks |

---

## Getting started

```bash
git clone https://github.com/archittmittal/Recover-AI.git
cd Recover-AI
npm install
cp .env.example .env   # add your Razorpay test keys + Gemini API key
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

No Docker, no external database — SQLite is a single committed file. Zero-config by design so judges can go from `git clone` to a running demo in minutes.

### Demo flow

1. **Seed the batch** — "Seed 50+ Failures" on the simulator page.
2. **Run the agent** — "Start Recovery" to process all failures.
3. **Watch the dashboard** — revenue at risk vs. recovered updates live.
4. **Play as a customer** — reply to agent messages, test the "STOP" opt-out.
5. **Review the audit trail** — click any customer for the full decision timeline.
6. **Check the exception list** — see unrecoverable failures with honest reasons.

---

## Project structure

```
recover-ai/
├── src/
│   ├── app/              # Next.js App Router pages + API routes
│   ├── lib/
│   │   ├── db/            # Drizzle schema, connection, seed data
│   │   ├── recovery/       # State machine, classifier, strategy engine, scheduler
│   │   ├── ai/             # Gemini client, prompts, LLM classifier/messenger
│   │   ├── razorpay/       # API client, webhook verification, payment links
│   │   ├── communication/  # WhatsApp / SMS / Voice dispatch simulators
│   │   └── utils/          # Audit logger, ID generation, IST time helpers
│   └── components/
│       ├── dashboard/      # Metrics, recovery chart, channel comparison
│       ├── customers/      # Customer table, audit timeline
│       └── simulator/      # Batch controls, customer chat simulator
```

Full architecture, database schema (ERD), state machine, and strategy-selection rules: [`docs/PROJECT_DOCUMENTATION.md`](docs/PROJECT_DOCUMENTATION.md).

---

## Documentation

- [`docs/PRD.md`](docs/PRD.md) — product requirements, success criteria, milestones
- [`docs/PROJECT_DOCUMENTATION.md`](docs/PROJECT_DOCUMENTATION.md) — architecture, schema, compliance, LLM prompts
- [`docs/TASKS.md`](docs/TASKS.md) — full task breakdown (mirrored as GitHub Issues)

## License

Built for the Razorpay AI Buildathon 2026. Not licensed for production use.
