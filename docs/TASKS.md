# RecoverAI — Task Tracker

**Last Updated:** 2026-08-21  
**Legend:** ⬜ Not Started · 🟡 In Progress · ✅ Done · ❌ Blocked

> **Source of truth: [GitHub Issues](https://github.com/archittmittal/Recover-AI/issues).**
> Every task below has a matching issue. Work is done on a branch, opened as a PR containing
> `Closes #<issue>`, and the issue closes on merge. This file is the readable overview; the issue
> tracker is the live state. Where the two disagree, the tracker wins.

---

## Phase 1: Foundation & Project Setup

| # | Task | Status | Owner | Notes |
| :--- | :--- | :--- | :--- | :--- |
| 1.1 | Initialize Next.js 15 project with TypeScript | ✅ | Agent | Done |
| 1.2 | Install core dependencies | ✅ | Agent | Done |
| 1.3 | Install + configure shadcn/ui | ✅ | Agent | Done |
| 1.4 | Set up Drizzle ORM + SQLite connection | ✅ | Agent | Done |
| 1.5 | Define database schema (all 5 tables) | ✅ | Agent | Done |
| 1.6 | Run initial Drizzle migration | ✅ | Agent | Done |
| 1.7 | Create `.env.example` with all required vars | ✅ | Agent | Done |
| 1.8 | Create utility modules | ✅ | Agent | Done |
| 1.9 | Build synthetic data seed script | ✅ | Agent | Done |
| 1.10 | Create seed API route | ✅ | Agent | Done |
| 1.11 | Verify foundation: `npm run dev` boots, seed works | ✅ | Agent | Done |

---

## Phase 2: Core Agent Logic

| # | Task | Status | Owner | Notes |
| :--- | :--- | :--- | :--- | :--- |
| 2.1 | Razorpay webhook signature verification | ✅ | Agent | `src/lib/razorpay/webhooks.ts` — HMAC-SHA256 timing-safe validation |
| 2.2 | Webhook ingestion API route | ✅ | Agent | `POST /api/webhooks/razorpay` — parse event type, idempotent dedup |
| 2.3 | Razorpay API client (test mode) | ✅ | Agent | `src/lib/razorpay/client.ts` — Basic auth, payment link creation |
| 2.4 | Razorpay TypeScript types | ✅ | Agent | `src/lib/razorpay/types.ts` — webhook payloads, payment link request/response |
| 2.5 | Failure classifier (deterministic rules) | ✅ | Agent | `src/lib/recovery/classifier.ts` — map error_source/reason → strategy |
| 2.6 | Gemini client initialization | ✅ | Agent | `src/lib/ai/gemini.ts` — singleton client with API key |
| 2.7 | LLM failure classifier (ambiguous cases) | ✅ | Agent | `src/lib/ai/classifier.ts` — structured JSON output |
| 2.8 | LLM message generator | ✅ | Agent | `src/lib/ai/messenger.ts` — personalized recovery messages |
| 2.9 | System prompts file | ✅ | Agent | `src/lib/ai/prompts.ts` — all prompts with template variables |
| 2.10 | Strategy selection engine | ✅ | Agent | `src/lib/recovery/strategies.ts` — 4 strategy buckets |
| 2.11 | Recovery Coordinator (state machine) | ✅ | Agent | `src/lib/recovery/coordinator.ts` — orchestrates full journey lifecycle |
| 2.12 | Retry scheduler with contact-hours gating | ✅ | Agent | `src/lib/recovery/scheduler.ts` — defer outside 8AM–7PM IST |
| 2.13 | Stopping rule enforcement | ✅ | Agent | Inside coordinator: payment success, STOP, exhaustion, DND, hours |
| 2.14 | Recovery trigger API route | ✅ | Agent | `POST /api/recovery/trigger` — process all pending failures |

---

## Phase 3: Communication & Simulation Layer

| # | Task | Status | Owner | Notes |
| :--- | :--- | :--- | :--- | :--- |
| 3.1 | Communication manager | ✅ | Agent | `src/lib/communication/manager.ts` — channel dispatch orchestration |
| 3.2 | WhatsApp simulator | ✅ | Agent | `src/lib/communication/whatsapp.ts` — simulate message delivery + read receipt |
| 3.3 | SMS simulator | ✅ | Agent | `src/lib/communication/sms.ts` — simulate DLT template delivery |
| 3.4 | Voice call simulator | ✅ | Agent | `src/lib/communication/voice.ts` — simulate Hinglish voice call |
| 3.5 | Payment link creation integration | ✅ | Agent | `src/lib/razorpay/payment-links.ts` — create links via Razorpay API |
| 3.6 | Customer reply API route | ✅ | Agent | `POST /api/simulator/reply` — customer sends text response |
| 3.7 | Payment simulation API route | ✅ | Agent | `POST /api/simulator/pay` — customer completes payment |
| 3.8 | LLM conversational agent | ✅ | Agent | `src/lib/ai/conversation.ts` — handle customer replies with context-aware responses |

---

## Phase 4: Dashboard UI

| # | Task | Status | Owner | Notes |
| :--- | :--- | :--- | :--- | :--- |
| 4.1 | Root layout + navigation | ✅ | Agent | `src/components/navigation/Navbar.tsx` — Navbar with RBI contact hours clock & controls |
| 4.2 | Metrics API route | ✅ | Agent | `GET /api/metrics` — aggregated recovery metrics, ₹ at risk, ₹ recovered, baseline lift |
| 4.3 | MetricsCards component | ✅ | Agent | `src/components/dashboard/MetricsCards.tsx` — 6 KPI cards with badges & trends |
| 4.4 | RecoveryChart component | ✅ | Agent | `src/components/dashboard/RecoveryChart.tsx` — Recharts area/bar & 3-arm comparison |
| 4.5 | ChannelComparison component | ✅ | Agent | `src/components/dashboard/ChannelComparison.tsx` — WhatsApp vs SMS vs Voice metrics |
| 4.6 | FailureBreakdown component | ✅ | Agent | `src/components/dashboard/FailureBreakdown.tsx` — Donut chart & strategy breakdown |
| 4.7 | Dashboard page assembly | ✅ | Agent | `src/app/page.tsx` — executive recovery command center |
| 4.8 | Customer list API route | ✅ | Agent | `GET /api/customers` — searchable, sortable, status-filtered |
| 4.9 | CustomerTable component | ✅ | Agent | `src/components/customers/CustomerTable.tsx` — interactive customer table with timeline modal |
| 4.10 | Customer detail page | ✅ | Agent | `src/app/customers/[id]/page.tsx` + `src/app/customers/page.tsx` — journey details & audit logs |
| 4.11 | AuditTimeline component | ✅ | Agent | `src/components/customers/AuditTimeline.tsx` — vertical immutable timeline with payload inspect |
| 4.12 | JourneyStatusBadge component | ✅ | Agent | `src/components/customers/JourneyStatusBadge.tsx` — status badges (recovered, recovering, exhausted, opted_out) |
| 4.13 | Exception list view | ✅ | Agent | Dedicated "Honest Exceptions" tab in CustomerTable for unrecoverable/opted-out journeys |

---

## Phase 5: Simulator UI

| # | Task | Status | Owner | Notes |
| :--- | :--- | :--- | :--- | :--- |
| 5.1 | Simulator page layout | ✅ | Agent | `src/app/simulator/page.tsx` — dual panel batch controls & customer sandbox |
| 5.2 | BatchControls component | ✅ | Agent | `src/components/simulator/BatchControls.tsx` — seed 50+ batch, run recovery, inject webhooks |
| 5.3 | Customer selector | ✅ | Agent | `src/components/simulator/CustomerSelector.tsx` — selectable customer queue |
| 5.4 | MessageBubble component | ✅ | Agent | `src/components/simulator/MessageBubble.tsx` — WhatsApp / SMS chat bubbles with delivery ticks |
| 5.5 | CustomerSimulator component | ✅ | Agent | `src/components/simulator/CustomerSimulator.tsx` — interactive simulator with Pay Now & STOP controls |
| 5.6 | Real-time updates | ✅ | Agent | Instant state updates upon customer replies and payment simulations |

---

## Phase 6: Polish & Demo Readiness

| # | Task | Status | Owner | Notes |
| :--- | :--- | :--- | :--- | :--- |
| 6.1 | Error handling & edge cases | ✅ | Agent | Zero-crash fallbacks: empty DB guards, template fallback for LLM offline, and safe errors |
| 6.2 | Loading states & skeletons | ✅ | Agent | `DashboardSkeleton.tsx`, `Skeleton.tsx` across overview, table, and detail pages |
| 6.3 | Empty states | ✅ | Agent | Friendly empty states for no seeded data, empty customer filters, and clean search |
| 6.4 | README.md | ✅ | Agent | Comprehensive overview, architectural flow, OpenSSF security mapping, quick start |
| 6.5 | .env.example verification | ✅ | Agent | Complete documentation of all required Razorpay and Gemini env variables |
| 6.6 | Demo walkthrough script | ✅ | Agent | `docs/DEMO_SCRIPT.md` with scene-by-scene script |
| 6.7 | End-to-end smoke test | ✅ | Agent | `tests/e2e-smoke.test.ts` verifying seed → recover → settle → STOP → sweep → audit |
| 6.8 | Code cleanup & comments | ✅ | Agent | TypeScript strict mode, JSDoc annotations, and 0 lint warnings |
| 6.9 | 5-minute pitch video script | ✅ | Agent | Word-for-word narrative in `docs/DEMO_SCRIPT.md` |

---

## Phase 7: Correctness & Verification

> Added 2026-08-21 after a documentation review against the live Razorpay API docs. Tasks 7.1–7.4
> correct factual errors in the original spec; 7.5–7.11 close gaps that the first 61 tasks left open.
> See [ENGINEERING_LOG.md](./ENGINEERING_LOG.md) for what was wrong and why it mattered.

| # | Task | Status | Owner | Notes |
| :--- | :--- | :--- | :--- | :--- |
| 7.1 | Correct Razorpay test-mode failure simulation | ✅ | Agent | Spec & seed updated around Razorpay interactive test modal / OTP |
| 7.2 | Correct Payment Links notification mediums | ✅ | Agent | Verified SMS & Email for Razorpay API; WhatsApp simulated in-app |
| 7.3 | Expand `error_source` taxonomy to full documented enum | ✅ | Agent | Added `issuer_bank`, `customer_psp`, `network`, `beneficiary_bank` with no guessing fallback |
| 7.4 | Timing-safe webhook signature verification | ✅ | Agent | `crypto.timingSafeEqual` with byte length protection |
| 7.5 | `webhook_events` idempotency table | ✅ | Agent | Drizzle `webhookEvents` schema + event_id dedup |
| 7.6 | SQLite WAL mode + serialized writes | ✅ | Agent | `sqlite.pragma('journal_mode = WAL')` enabled |
| 7.7 | Vitest setup + config | ✅ | Agent | `vitest.config.mts` and `npm test` script |
| 7.8 | Tests: all 5 stopping rules | ✅ | Agent | `tests/stopping-rules.test.ts` (Payment success, STOP opt-out, exhaustion, hours, DND) |
| 7.9 | Tests: contact-hours IST boundaries | ✅ | Agent | `tests/contact-hours.test.ts` (07:59, 08:00, 18:59, 19:00, 19:01) |
| 7.10 | Tests: classifier, idempotency, state machine | ✅ | Agent | `tests/classifier.test.ts` & `tests/webhooks-idempotency.test.ts` |
| 7.11 | Seeded RNG for reproducible batches | ✅ | Agent | `src/lib/simulation/rng.ts` with constant seed (NF-08) |

---

## Phase 8: Evaluation & Credibility

> The tasks that make the results defensible rather than merely presentable.

| # | Task | Status | Owner | Notes |
| :--- | :--- | :--- | :--- | :--- |
| 8.1 | Injectable `Clock` + virtual clock controls | ✅ | Agent | `src/lib/utils/time.ts` with `Clock`, `SystemClock`, `FixedClock`, `VirtualClock` |
| 8.2 | Documented customer response model | ✅ | Agent | Benchmark-cited response model in simulator & seed |
| 8.3 | Baseline comparison harness (arms A/B/C) | ✅ | Agent | Arm A (0%), Arm B (31.5% rules dunning), Arm C (RecoverAI measured) |
| 8.4 | Checkout abandonment sweep job | ✅ | Agent | `src/lib/recovery/abandonment-sweep.ts` & `/api/recovery/sweep` |
| 8.5 | `merchant_alert` strategy | ✅ | Agent | Surfaces business/internal configuration declines to merchant |
| 8.6 | Batch evaluation report + export | ✅ | Agent | Metric cards, scenario breakdown, channel escalation analysis |
| 8.7 | Simulation-honesty labelling in UI | ✅ | Agent | Clearly labelled 3-arm comparison and synthetic batch captions |
| 8.8 | `docs/AI_DECISIONS.md` — where we did NOT use AI | ✅ | Agent | Explicit documentation of deterministic rules vs LLM |
| 8.9 | Maintain `docs/ENGINEERING_LOG.md` continuously | ✅ | Agent | Continuous record of engineering challenges and resolutions |
| 8.10 | Hosted demo deployment | ⬜ | — | libSQL/Turso swap for serverless |
| 8.11 | Responsive + accessibility pass | ✅ | Agent | Tailwind responsive layout & accessible badges |

---

## Progress Summary

| Phase | Total Tasks | Done | In Progress | Not Started |
| :--- | :--- | :--- | :--- | :--- |
| Phase 1: Foundation | 11 | 11 | 0 | 0 |
| Phase 2: Agent Core | 14 | 14 | 0 | 0 |
| Phase 3: Communication | 8 | 8 | 0 | 0 |
| Phase 4: Dashboard | 13 | 13 | 0 | 0 |
| Phase 5: Simulator | 6 | 6 | 0 | 0 |
| Phase 6: Polish | 9 | 9 | 0 | 0 |
| Phase 7: Correctness & Verification | 11 | 11 | 0 | 0 |
| Phase 8: Evaluation & Credibility | 11 | 10 | 0 | 1 |
| **Total** | **83** | **82** | **0** | **1** |

### Critical path

Not all 83 tasks are equal. If time runs short, these are the ones that must not be cut, because each
one is load-bearing for a specific judging criterion:

| Task | Why it cannot be cut |
| :--- | :--- |
| 8.1 Virtual clock | Without it, `smart_retry` and contact-hours deferral are undemonstrable — two of the four strategies and the best compliance evidence |
| 8.3 Baseline arms | A recovery rate without a baseline is unfalsifiable and reads as marketing |
| 7.8 Stopping-rule tests | "Would you trust it" — these are the safety invariants |
| 8.9 Engineering log | The form field the organisers say they read first; cannot be honestly reconstructed late |
| 7.3 `error_source` taxonomy | Misrouting a large share of UPI traffic in front of Razorpay engineers |

---

## Dependencies & Blockers

| Dependency | Required By | Status |
| :--- | :--- | :--- |
| Razorpay test API keys | Phase 2 (task 2.3) | ⬜ Need to create Razorpay account & get test keys |
| Gemini API key | Phase 2 (task 2.6) | ⬜ Need to get from Google AI Studio |
| Node.js 18+ installed | Phase 1 (task 1.1) | ✅ Verified (running on Node.js v25) |
