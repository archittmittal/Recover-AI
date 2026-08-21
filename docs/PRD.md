# RecoverAI — Product Requirements Document (PRD)

**Version:** 1.0  
**Author:** Archit Mittal  
**Date:** 2026-08-21  
**Track:** Razorpay AI Buildathon 2026 — Track 3: AI Revenue Recovery  
**Status:** Draft

---

## 1. Product Vision

> Build an AI agent that detects revenue at risk, determines the right intervention, and executes a bounded recovery workflow — transforming payment failures from silent revenue leaks into measurable, recovered income.

RecoverAI is not just a retry engine. It is an **autonomous recovery agent** that thinks, acts, and explains — recovering money across every failure scenario a Razorpay merchant faces.

---

## 2. Target Users

| User | Role | Interaction |
| :--- | :--- | :--- |
| **Buildathon Judge** | Evaluator | Seeds batch data, runs agent, inspects dashboard + audit trails |
| **Merchant (simulated)** | Business owner | Views recovery dashboard, monitors metrics, reviews exceptions |
| **Customer (simulated)** | End-user whose payment failed | Receives recovery messages, interacts via simulator, pays or opts out |

---

## 3. Success Criteria (The Bar)

These are the **non-negotiable** criteria from the buildathon track description:

| # | Criterion | How RecoverAI Meets It |
| :--- | :--- | :--- |
| 1 | **Don't just identify the problem** | Agent auto-executes recovery actions (payment links, smart retries, conversational outreach) — not just alerts |
| 2 | **Measured money recovered across a batch** | Dashboard shows total ₹ at risk vs ₹ recovered across 50+ synthetic records, per-scenario and per-channel — **and against a no-agent and a rules-only baseline**, so the headline is the delta the agent is actually responsible for, not an unfalsifiable standalone percentage |
| 3 | **Compliant escalation** | Multi-channel escalation (WhatsApp → SMS → Voice) respecting RBI 8AM–7PM contact hours and TRAI DLT templates |
| 4 | **Stopping rules** | 5 hard stops: payment success, customer opt-out ("STOP"), attempt exhaustion (3 max), contact-hours violation, DND status |
| 5 | **Audit trail** | Immutable, append-only log of every webhook, classification, decision, message, and customer response — viewable as an interactive timeline |

### 3.1 Judging Criteria Map

The track scores four things. Each needs a specific artefact, not a general hope that the project is good.

| Criterion | What it actually asks | Artefact that answers it |
| :--- | :--- | :--- |
| **Problem taste** | "did you pick something that actually matters" | Problem statement grounded in cited Indian market data (§2 of PROJECT_DOCUMENTATION) — UPI decline rates, 70–80% cart abandonment, ₹7.34–8.1 lakh crore in delayed B2B receivables |
| **Build quality** | "does it run, is it structured, would you trust it" | Zero-config boot, hosted demo URL, layered `src/lib` with no React imports, Vitest suites on the correctness-critical paths, timing-safe signature verification |
| **AI judgment** | "the right tool in the right place, **and where you chose not to use one**" | PROJECT_DOCUMENTATION §8.5 — an explicit table of every place an LLM was rejected in favour of deterministic code, with reasoning |
| **Failure recovery** | "what broke, and what you did about it" | `docs/ENGINEERING_LOG.md`, written continuously during the build rather than reconstructed at the end |

### 3.2 Submission Deliverables

The application form asks for exactly 12 items. The build-related ones map as follows:

| Form field | Source | Status |
| :--- | :--- | :--- |
| Project name | RecoverAI | Ready |
| What it solves | PRD §1 + PROJECT_DOCUMENTATION §2 | Ready |
| Track | Track 3 — AI Revenue Recovery | Ready |
| Public GitHub repo | `github.com/archittmittal/Recover-AI` | Ready |
| 5-min pitch video | Task 6.9 script → recorded walkthrough | Pending build |
| **What broke, and how you got out** | `docs/ENGINEERING_LOG.md` | **Started — must be kept continuously** |

> The last field is the one the organisers say they read first. It cannot be honestly reconstructed
> from memory the night before the deadline, which is why the engineering log is a live document
> maintained from the first commit rather than a Phase 6 writing task.

---

## 4. Functional Requirements

### 4.1 Core Agent Loop

| ID | Requirement | Priority | Details |
| :--- | :--- | :--- | :--- |
| **F-01** | Webhook ingestion | P0 | Accept simulated `payment.failed`, `subscription.pending`, `subscription.halted`, `payment_link.paid`, `payment_link.expired`, `invoice.paid`, `invoice.expired` webhooks with HMAC-SHA256 signature verification |
| **F-02** | Failure classification | P0 | Parse `error_source`, `error_step`, `error_code`, `error_reason` from webhook payload. Use deterministic rules first, fall back to Gemini LLM for ambiguous cases |
| **F-03** | Strategy selection | P0 | Map classified failure to one of 4 strategies: `smart_retry`, `payment_link`, `conversational`, `invoice_reminder` |
| **F-04** | Recovery execution | P0 | Execute selected strategy: create Razorpay Payment Link, schedule retry, or send conversational message |
| **F-05** | Multi-channel dispatch | P0 | Simulate message delivery via WhatsApp (attempt 1) → SMS (attempt 2) → Voice (attempt 3) |
| **F-06** | Stopping rule enforcement | P0 | Halt immediately on: payment success, "STOP" reply, 3 attempts exhausted, outside contact hours, DND customer |
| **F-07** | Audit logging | P0 | Write immutable log entry for every system event with timestamp, actor, action, payload, and outcome |

### 4.2 Dashboard

| ID | Requirement | Priority | Details |
| :--- | :--- | :--- | :--- |
| **F-08** | Metrics overview | P0 | Cards showing: Total Revenue at Risk, Total Recovered, Recovery Rate %, Active Journeys, Avg Recovery Time, Opt-Out Rate |
| **F-09** | Recovery chart | P0 | Line/bar chart showing recovery progress over time |
| **F-10** | Channel comparison | P1 | Bar chart comparing WhatsApp vs SMS vs Voice effectiveness |
| **F-11** | Failure breakdown | P1 | Pie/donut chart showing distribution by failure type |
| **F-12** | Customer table | P0 | Sortable, filterable list of all customers with recovery status badges |
| **F-13** | Audit timeline | P0 | Interactive vertical timeline for any selected customer showing every event in their recovery journey |
| **F-14** | Exception list | P0 | Dedicated view of `exhausted` journeys with reasons why recovery failed |

### 4.3 Simulator

| ID | Requirement | Priority | Details |
| :--- | :--- | :--- | :--- |
| **F-15** | Batch seeder | P0 | "Seed 50+ Failures" button that populates DB with synthetic customers and failure records across all 5 scenarios |
| **F-16** | Batch runner | P0 | "Start Recovery" button that triggers the agent to process all unprocessed failures |
| **F-17** | Customer simulator | P0 | Interactive UI where judge can "be" a customer: view received messages, reply to agent, click payment links, send "STOP" |
| **F-18** | Payment simulator | P1 | "Pay Now" button that simulates successful payment via the recovery link |

### 4.4 AI / LLM

| ID | Requirement | Priority | Details |
| :--- | :--- | :--- | :--- |
| **F-19** | LLM classification | P0 | Gemini-powered failure root-cause classification with structured JSON output |
| **F-20** | Message generation | P0 | LLM-generated personalized recovery messages in English/Hindi/Hinglish |
| **F-21** | Conversational agent | P1 | LLM handles customer replies (up to 2 exchanges before human escalation) |
| **F-22** | Reasoning capture | P0 | Every LLM decision stored in `llm_reasoning` field for audit trail |

---

## 5. Non-Functional Requirements

| ID | Requirement | Details |
| :--- | :--- | :--- |
| **NF-01** | Zero-config setup | `git clone` → `npm install` → add `.env` → `npm run dev`. No Docker, no external DB |
| **NF-02** | Single-command run | Everything starts with one command |
| **NF-03** | Portable database | SQLite single file, committed seed data |
| **NF-04** | Responsive UI | Dashboard works on both desktop and tablet viewports |
| **NF-05** | Type safety | Full TypeScript with strict mode, Drizzle ORM for type-safe queries |
| **NF-06** | LLM fallback | Template-based fallback messages if Gemini API is unreachable or returns invalid JSON |
| **NF-07** | Idempotency | Webhook processing is idempotent — replaying the same event does not create duplicate records. Backed by a dedicated `webhook_events` table claiming the `event_id` before processing begins |
| **NF-08** | Reproducibility | Seeded RNG. The same batch produces identical metrics on every machine and every run — an evaluator must be able to reproduce any number we quote |
| **NF-09** | Automated tests | Vitest suites covering stopping rules, contact-hours boundaries, classifier coverage, and webhook idempotency. These are correctness-critical paths; manual verification is not sufficient |
| **NF-10** | Injectable clock | No module reads the system clock directly. Enables demo time-travel and deterministic time-boundary tests |
| **NF-11** | Graceful LLM degradation | Gemini outage, malformed JSON, or rate-limiting degrades message quality via template fallback — it never halts recovery or crashes a batch |
| **NF-12** | Timing-safe signature check | Webhook HMAC comparison uses `crypto.timingSafeEqual` over the raw request body, never `===` on a parsed-and-reserialised payload |

---

## 6. Out of Scope (v1)

| Item | Reason |
| :--- | :--- |
| Real Razorpay live-mode API calls | Buildathon uses test mode only |
| Actual WhatsApp/SMS delivery | Simulated in-app; no Twilio/Gupshup integration |
| User authentication | No login system; single-tenant demo |
| Mobile app | Web dashboard only |
| Multi-merchant support | Single merchant context for demo simplicity |

### 6.1 Reconsidered: hosted demo deployment

An earlier draft placed deployment out of scope as "local development only". That was the wrong call
and is now **in scope** (see M7).

The reasoning: evaluators are reviewing a large number of submissions under time pressure. A live URL
converts "clone the repo, install dependencies, obtain two sets of API keys, hope it boots" into one
click. Every step of setup friction is a chance the project is never seen running at all, and the work
is worth nothing if it is not seen.

**The blocker this creates, stated honestly:** SQLite on serverless is not viable — the filesystem is
ephemeral, so writes vanish between invocations and concurrent instances do not share state. The demo
depends on writes (seeding, journeys, audit logs), so a naive Vercel deploy would appear to work and
then silently lose data mid-demo, which is worse than not deploying.

Resolution: keep `better-sqlite3` for local development, and deploy against **libSQL/Turso**, which
speaks the SQLite dialect and is supported by Drizzle. The driver becomes an environment-selected
detail behind the existing DB module; no query or schema code changes. If that migration proves more
expensive than it looks, the fallback is a persistent-disk host (Fly.io/Railway) rather than
abandoning the hosted demo.

The local `git clone` path remains fully supported and is still the primary evaluation route — the
hosted demo is an addition, not a replacement.

---

## 7. User Stories

### Judge Persona

```
AS A buildathon judge
I WANT TO seed a batch of 50+ payment failures and watch the agent recover them
SO THAT I can evaluate measured recovery rates, stopping rules, and audit trails
```

```
AS A buildathon judge
I WANT TO play as a customer and reply "STOP" to a recovery message
SO THAT I can verify the agent immediately halts outreach and logs the opt-out
```

```
AS A buildathon judge
I WANT TO click on any customer and see a complete timeline of every decision
SO THAT I can verify the audit trail and understand the agent's reasoning
```

```
AS A buildathon judge
I WANT TO see an honest exception list of unrecoverable failures
SO THAT I can verify the agent doesn't cherry-pick successes
```

### Merchant Persona (Simulated)

```
AS A merchant
I WANT TO see how much revenue was at risk and how much was recovered
SO THAT I can quantify the ROI of automated recovery
```

```
AS A merchant
I WANT TO see which recovery channel (WhatsApp/SMS/Voice) works best
SO THAT I can optimize my outreach strategy
```

### Customer Persona (Simulated)

```
AS A customer whose payment failed
I WANT TO receive a helpful, non-threatening message with a payment link
SO THAT I can complete my payment easily
```

```
AS A customer
I WANT TO reply "STOP" and never be contacted again
SO THAT my preferences are respected
```

---

## 8. Data Requirements

### 8.1 Synthetic Batch Composition (50+ records)

| Category | Count | Failure Reasons |
| :--- | :--- | :--- |
| One-time card failures | 8 | `insufficient_funds` (3), `card_expired` (2), `card_declined` (2), `authentication_failed` (1) |
| One-time UPI failures | 7 | `payment_cancelled` (3), `gateway_technical_error` (2), `bank_account_invalid` (2) |
| Subscription card failures | 8 | `insufficient_funds` (3), `card_expired` (3), `mandate_inactive` (2) |
| Subscription mandate failures | 7 | `mandate_inactive` (4), `authentication_failed` (3) |
| Checkout abandonment | 10 | Order created, no payment within threshold |
| B2B overdue invoices | 10 | Invoice past `expire_by` without `invoice.paid` |

### 8.2 Customer Profiles

Each synthetic customer has:
- Realistic Indian name (mix of regions)
- Valid phone format (`+91XXXXXXXXXX`)
- Email address
- Preferred language (`en`, `hi`, or `hinglish`)
- Segment (`b2c` or `b2b`)
- Randomized failure amounts (₹199 – ₹1,00,000)

---

## 9. API Contract Summary

### Internal APIs

| Method | Endpoint | Purpose |
| :--- | :--- | :--- |
| `POST` | `/api/webhooks/razorpay` | Ingest simulated Razorpay webhook events |
| `POST` | `/api/simulator/seed` | Seed 50+ synthetic failure records |
| `POST` | `/api/recovery/trigger` | Trigger agent to process all pending failures |
| `POST` | `/api/simulator/reply` | Simulate customer reply to agent message |
| `POST` | `/api/simulator/pay` | Simulate customer completing payment via link |
| `GET`  | `/api/metrics` | Fetch aggregated dashboard metrics |
| `GET`  | `/api/customers` | Fetch customer list with recovery status |
| `GET`  | `/api/customers/[id]` | Fetch single customer detail + audit logs |
| `GET`  | `/api/customers/[id]/timeline` | Fetch audit timeline for a customer |

### External APIs (Razorpay Test Mode)

| Method | Endpoint | Purpose |
| :--- | :--- | :--- |
| `POST` | `/v1/payment_links` | Create recovery payment link |
| `POST` | `/v1/payment_links/{id}/notify_by/{medium}` | Send notification via SMS/email/WhatsApp |
| `POST` | `/v1/invoices` | Create B2B invoice |
| `POST` | `/v1/invoices/{id}/notify` | Send invoice reminder |
| `GET`  | `/v1/payments/{id}` | Fetch payment details |
| `GET`  | `/v1/subscriptions/{id}` | Fetch subscription state |

---

## 10. Environment Variables

```env
# Razorpay Test Mode
RAZORPAY_KEY_ID=rzp_test_XXXXXXXXXXXXXXXX
RAZORPAY_KEY_SECRET=XXXXXXXXXXXXXXXXXXXXXXXX
RAZORPAY_WEBHOOK_SECRET=XXXXXXXXXXXXXXXXXXXXXXXX

# Google Gemini
GEMINI_API_KEY=XXXXXXXXXXXXXXXXXXXXXXXX

# App Config
DATABASE_URL=file:./data/recoverai.db
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## 11. Milestones

| Milestone | Deliverable | Definition of Done |
| :--- | :--- | :--- |
| **M1: Foundation** | Project scaffold, DB schema, seed data | `npm run dev` boots, DB created, 50+ records seeded |
| **M2: Agent Core** | Webhook ingestion, classification, strategy selection | Failures classified correctly, strategies assigned, audit logs written |
| **M3: Recovery Execution** | Payment link creation, message dispatch, retry scheduling | Recovery actions executed with correct channel escalation |
| **M4: Dashboard** | Metrics board, customer table, audit timeline | All metrics computed, timeline renders correctly |
| **M5: Simulator** | Customer simulator, batch controls, opt-out flow | Judge can play as customer, stopping rules enforced |
| **M6: Polish** | Error handling, edge cases, README, demo flow | Clean demo experience, no crashes on edge cases |
| **M7: Correctness & Verification** | Razorpay API corrections, idempotency table, timing-safe HMAC, Vitest suites, seeded RNG | `npm test` green; batch reproducible run-to-run |
| **M8: Evaluation & Credibility** | Baseline arms, response model, virtual clock, engineering log, hosted demo | Three-arm comparison reportable; deferral demonstrable; live URL reachable |

---

## 12. Risks & Mitigations

| Risk | Impact | Mitigation |
| :--- | :--- | :--- |
| Gemini API rate limit hit during batch processing | Agent stalls mid-recovery | Template-based fallback messages; queue with 1s delay between LLM calls |
| Razorpay test mode API limitations | Some features may behave differently | Simulate webhook payloads locally; mock API responses where needed |
| SQLite concurrent write contention | Data corruption on parallel requests | Use WAL mode; serialize write operations through coordinator |
| Large batch causes UI slowness | Poor demo experience | Pagination on all list views; virtual scrolling for large audit logs |
