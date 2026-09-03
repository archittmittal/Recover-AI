# RecoverAI — Task Tracker

**Last Updated:** 2026-09-01  
**Legend:** ⬜ Not Started · 🟡 In Progress · ✅ Done · ❌ Blocked

> **Definition of done (RA-30):** a task is ✅ only when the behaviour is *reachable in the
> running application* and there is a named artifact behind it — a file, a route, or a test. Not
> when the code exists. `RA-12` (a communication layer that was written, marked done, and
> unreachable) and `RA-31` (a virtual clock that was defined and referenced by nothing) were both
> ✅ under the looser reading. Every row below now names its artifact; a row that cannot is not ✅.

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
| 2.13 | Stopping rule enforcement | ✅ | Agent | `src/lib/recovery/stopping-rules.ts`, called from the coordinator before every attempt; covered by `tests/stopping-rules.test.ts` and `tests/contact-hours-enforcement.test.ts` |
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
| 6.10 | Record the 5-minute pitch video | ⬜ | Human | **Not recorded.** A required submission field — the script being written is not the same task ([RA-27](https://github.com/archittmittal/Recover-AI/issues/165)) |

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
| 8.1 | Injectable `Clock` + virtual clock controls | ✅ | Agent | `src/lib/utils/time.ts` + `src/lib/utils/demo-clock.ts`; `POST /api/simulator/clock`, forward-only, `clock_advanced` audit row, simulator control (RA-31) |
| 8.2 | Documented customer response model | ✅ | Agent | `src/lib/simulation/response-model.ts` + `docs/SIMULATION_MODEL.md`; coefficients are declared estimates, not benchmark citations (RA-23) |
| 8.3 | Baseline comparison harness (arms A/B/C) | ✅ | Agent | `payment_failures.arm` cohorts + per-arm rates in `src/app/api/metrics/route.ts`; all three measured from their own journeys, C − B reported signed (RA-22) |
| 8.4 | Checkout abandonment sweep job | ✅ | Agent | `src/lib/recovery/abandonment-sweep.ts` & `/api/recovery/sweep` |
| 8.5 | `merchant_alert` strategy | ✅ | Agent | Surfaces business/internal configuration declines to merchant |
| 8.6 | Batch evaluation report + export | 🟡 | Agent | Report yes — metric cards, scenario breakdown, channel escalation, and `npm run eval:arms` for the replicated three-arm result. **Export not built:** no CSV/download path exists anywhere in `src/` |
| 8.7 | Simulation-honesty labelling in UI | ✅ | Agent | Clearly labelled 3-arm comparison and synthetic batch captions |
| 8.8 | `docs/AI_DECISIONS.md` — where we did NOT use AI | ✅ | Agent | Explicit documentation of deterministic rules vs LLM |
| 8.9 | Maintain `docs/ENGINEERING_LOG.md` continuously | 🟡 | Agent | Corrected under RA-29, but the newest entry is still **2026-08-21**. RA-22, RA-23, RA-31, RA-32 and RA-05 all shipped after that and none is recorded — "continuously" is not currently true |
| 8.10 | Hosted demo deployment | ⬜ | Agent | **No hosted demo exists.** `docs/DEPLOYMENT.md:38` instructs `DATABASE_URL=libsql://…`, but no libSQL driver is installed and `src/lib/db/index.ts` rejects any non-`file:` URL — the documented deployment cannot boot ([RA-28](https://github.com/archittmittal/Recover-AI/issues/166)) |
| 8.11 | Responsive + accessibility pass | 🟡 | Agent | Responsive layout is real (Tailwind breakpoints throughout). Accessibility is 23 `aria-*` attributes across 6 files and no audit against a standard — enough to claim effort, not a pass |

---

## Progress Summary

Counted from the rows above, not maintained by hand — the previous summary read 83/83 while task
8.3 was two hardcoded constants and 8.10 described a deployment that cannot boot (RA-30).

| Phase | Total Tasks | ✅ Done | 🟡 In Progress | ⬜ Not Started |
| :--- | :--- | :--- | :--- | :--- |
| Phase 1: Foundation | 11 | 11 | 0 | 0 |
| Phase 2: Agent Core | 14 | 14 | 0 | 0 |
| Phase 3: Communication | 8 | 8 | 0 | 0 |
| Phase 4: Dashboard | 13 | 13 | 0 | 0 |
| Phase 5: Simulator | 6 | 6 | 0 | 0 |
| Phase 6: Polish | 10 | 9 | 0 | 1 |
| Phase 7: Correctness & Verification | 11 | 11 | 0 | 0 |
| Phase 8: Evaluation & Credibility | 11 | 7 | 3 | 1 |
| **Total** | **84** | **79** | **3** | **2** |

`tests/task-board-consistency.test.ts` parses the rows above and fails if these numbers disagree
with them. The first draft of this very summary was wrong by one row — which is precisely how the
board reached 83/83 — so the count is now checked by the suite rather than by whoever edits it.

The five rows that are not ✅: 6.10 (RA-27, the video), 8.6 (no export path), 8.9 (RA-29's log is
stale again), 8.10 (RA-28, no hosted demo), 8.11 (accessibility never audited). Nothing is marked
done here that the tracker still has open.

### Critical path

Not all 83 tasks are equal. If time runs short, these are the ones that must not be cut, because each
one is load-bearing for a specific judging criterion:

| Task | Why it cannot be cut |
| :--- | :--- |
| 8.1 Virtual clock | Without it, `smart_retry` and contact-hours deferral are undemonstrable — two of the four strategies and the best compliance evidence. Built under RA-31; it was a class definition nothing referenced until then |
| 8.3 Baseline arms | A recovery rate without a baseline is unfalsifiable and reads as marketing. Built under RA-22; the measured result is currently **C − B = +2.8 pts**, and `docs/SIMULATION_MODEL.md` records why that number moved |
| 7.8 Stopping-rule tests | "Would you trust it" — these are the safety invariants |
| 8.9 Engineering log | The form field the organisers say they read first; cannot be honestly reconstructed late |
| 7.3 `error_source` taxonomy | Misrouting a large share of UPI traffic in front of Razorpay engineers |

---

## Integrity review (RA-01 – RA-32)

Phases 1–8 are the build. Separately, a readiness review filed 32 findings as GitHub issues,
`RA-01` through `RA-32`, each fixed on its own branch with a `Closes #<issue>` PR. They are not
listed row-by-row here because the tracker already holds them and a hand-copied second list is
exactly how this board drifted in the first place.

**28 closed · 4 open** as of 2026-09-01. The open four are the ones reflected above:

| Issue | What remains |
| :--- | :--- |
| [RA-27](https://github.com/archittmittal/Recover-AI/issues/165) · critical | The pitch video is not recorded |
| [RA-28](https://github.com/archittmittal/Recover-AI/issues/166) · high | No hosted demo; libSQL/Turso never implemented |
| [RA-30](https://github.com/archittmittal/Recover-AI/issues/168) · medium | This audit |
| [RA-26](https://github.com/archittmittal/Recover-AI/issues/164) · low | README described a committed database file |

---

## Dependencies & Blockers

| Dependency | Required By | Status |
| :--- | :--- | :--- |
| Razorpay test API keys | Phase 2 (task 2.3) | ✅ Configured locally in `.env` (RA-24). Not in CI — CI runs `RECOVERAI_MODE=mock` |
| Gemini API key | Phase 2 (task 2.6) | ✅ Configured locally in `.env` (RA-24). Not in CI — CI runs `RECOVERAI_MODE=mock` |
| Node.js 18+ installed | Phase 1 (task 1.1) | ✅ Verified (running on Node.js v25) |
