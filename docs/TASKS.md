# RecoverAI — Task Tracker

**Last Updated:** 2026-08-21  
**Legend:** ⬜ Not Started · 🟡 In Progress · ✅ Done · ❌ Blocked

---

## Phase 1: Foundation & Project Setup

| # | Task | Status | Owner | Notes |
| :--- | :--- | :--- | :--- | :--- |
| 1.1 | Initialize Next.js 15 project with TypeScript | ⬜ | — | `npx create-next-app@latest recover-ai --typescript --tailwind --app --src-dir` |
| 1.2 | Install core dependencies | ⬜ | — | `drizzle-orm`, `better-sqlite3`, `@google/generative-ai`, `nanoid`, `date-fns`, `recharts`, `lucide-react` |
| 1.3 | Install + configure shadcn/ui | ⬜ | — | `npx shadcn@latest init` + add: button, card, badge, table, tabs, dialog, input, separator, scroll-area |
| 1.4 | Set up Drizzle ORM + SQLite connection | ⬜ | — | `drizzle.config.ts`, `src/lib/db/index.ts` |
| 1.5 | Define database schema (all 5 tables) | ⬜ | — | `src/lib/db/schema.ts` — customers, payment_failures, recovery_journeys, recovery_actions, audit_logs |
| 1.6 | Run initial Drizzle migration | ⬜ | — | `npx drizzle-kit generate` + `npx drizzle-kit migrate` |
| 1.7 | Create `.env.example` with all required vars | ⬜ | — | Razorpay test keys, Gemini API key, DB path |
| 1.8 | Create utility modules | ⬜ | — | `ids.ts` (nanoid prefixed IDs), `time.ts` (IST helpers, contact-hours check), `audit.ts` (log writer) |
| 1.9 | Build synthetic data seed script | ⬜ | — | `src/lib/db/seed.ts` — 50+ records across all 6 failure categories |
| 1.10 | Create seed API route | ⬜ | — | `POST /api/simulator/seed` — triggers seed script, returns count |
| 1.11 | Verify foundation: `npm run dev` boots, seed works | ⬜ | — | Smoke test end-to-end |

---

## Phase 2: Core Agent Logic

| # | Task | Status | Owner | Notes |
| :--- | :--- | :--- | :--- | :--- |
| 2.1 | Razorpay webhook signature verification | ⬜ | — | `src/lib/razorpay/webhooks.ts` — HMAC-SHA256 validation |
| 2.2 | Webhook ingestion API route | ⬜ | — | `POST /api/webhooks/razorpay` — parse event type, idempotent dedup |
| 2.3 | Razorpay API client (test mode) | ⬜ | — | `src/lib/razorpay/client.ts` — Basic auth, payment link creation |
| 2.4 | Razorpay TypeScript types | ⬜ | — | `src/lib/razorpay/types.ts` — webhook payloads, payment link request/response |
| 2.5 | Failure classifier (deterministic rules) | ⬜ | — | `src/lib/recovery/classifier.ts` — map error_source/reason → strategy |
| 2.6 | Gemini client initialization | ⬜ | — | `src/lib/ai/gemini.ts` — singleton client with API key |
| 2.7 | LLM failure classifier (ambiguous cases) | ⬜ | — | `src/lib/ai/classifier.ts` — structured JSON output |
| 2.8 | LLM message generator | ⬜ | — | `src/lib/ai/messenger.ts` — personalized recovery messages |
| 2.9 | System prompts file | ⬜ | — | `src/lib/ai/prompts.ts` — all prompts with template variables |
| 2.10 | Strategy selection engine | ⬜ | — | `src/lib/recovery/strategies.ts` — 4 strategy buckets |
| 2.11 | Recovery Coordinator (state machine) | ⬜ | — | `src/lib/recovery/coordinator.ts` — orchestrates full journey lifecycle |
| 2.12 | Retry scheduler with contact-hours gating | ⬜ | — | `src/lib/recovery/scheduler.ts` — defer outside 8AM–7PM IST |
| 2.13 | Stopping rule enforcement | ⬜ | — | Inside coordinator: payment success, STOP, exhaustion, DND, hours |
| 2.14 | Recovery trigger API route | ⬜ | — | `POST /api/recovery/trigger` — process all pending failures |

---

## Phase 3: Communication & Simulation Layer

| # | Task | Status | Owner | Notes |
| :--- | :--- | :--- | :--- | :--- |
| 3.1 | Communication manager | ⬜ | — | `src/lib/communication/manager.ts` — channel dispatch orchestration |
| 3.2 | WhatsApp simulator | ⬜ | — | `src/lib/communication/whatsapp.ts` — simulate message delivery + read receipt |
| 3.3 | SMS simulator | ⬜ | — | `src/lib/communication/sms.ts` — simulate DLT template delivery |
| 3.4 | Voice call simulator | ⬜ | — | `src/lib/communication/voice.ts` — simulate Hinglish voice call |
| 3.5 | Payment link creation integration | ⬜ | — | `src/lib/razorpay/payment-links.ts` — create links via Razorpay API |
| 3.6 | Customer reply API route | ⬜ | — | `POST /api/simulator/reply` — customer sends text response |
| 3.7 | Payment simulation API route | ⬜ | — | `POST /api/simulator/pay` — customer completes payment |
| 3.8 | LLM conversational agent | ⬜ | — | Handle customer replies with context-aware responses |

---

## Phase 4: Dashboard UI

| # | Task | Status | Owner | Notes |
| :--- | :--- | :--- | :--- | :--- |
| 4.1 | Root layout + navigation | ⬜ | — | Sidebar nav: Dashboard, Customers, Simulator |
| 4.2 | Metrics API route | ⬜ | — | `GET /api/metrics` — aggregate recovery stats from DB |
| 4.3 | MetricsCards component | ⬜ | — | 6 cards: Revenue at Risk, Recovered, Rate %, Active, Avg Time, Opt-Out Rate |
| 4.4 | RecoveryChart component | ⬜ | — | Line chart showing recovery over time / per batch |
| 4.5 | ChannelComparison component | ⬜ | — | Bar chart: WhatsApp vs SMS vs Voice |
| 4.6 | FailureBreakdown component | ⬜ | — | Donut chart: failure type distribution |
| 4.7 | Dashboard page assembly | ⬜ | — | `src/app/page.tsx` — compose all dashboard components |
| 4.8 | Customer list API route | ⬜ | — | `GET /api/customers` — paginated, sortable |
| 4.9 | CustomerTable component | ⬜ | — | Sortable table with status badges, amount, channel |
| 4.10 | Customer detail page | ⬜ | — | `src/app/customers/[id]/page.tsx` — profile + journey details |
| 4.11 | AuditTimeline component | ⬜ | — | Vertical timeline with icons per event type |
| 4.12 | JourneyStatusBadge component | ⬜ | — | Color-coded badges: resolved (green), recovering (blue), exhausted (red), opted_out (gray) |
| 4.13 | Exception list view | ⬜ | — | Filter customer table to show only `exhausted` journeys with failure reasons |

---

## Phase 5: Simulator UI

| # | Task | Status | Owner | Notes |
| :--- | :--- | :--- | :--- | :--- |
| 5.1 | Simulator page layout | ⬜ | — | Split view: batch controls (left) + customer simulator (right) |
| 5.2 | BatchControls component | ⬜ | — | Seed button, Start Recovery button, progress indicator |
| 5.3 | Customer selector | ⬜ | — | Dropdown to pick a customer to simulate as |
| 5.4 | MessageBubble component | ⬜ | — | Chat-style bubbles (agent = left/blue, customer = right/green) |
| 5.5 | CustomerSimulator component | ⬜ | — | Chat interface with message history, reply input, "Pay Now" button, "STOP" button |
| 5.6 | Real-time updates | ⬜ | — | Poll or use server-sent events to update simulator when agent sends new messages |

---

## Phase 6: Polish & Demo Readiness

| # | Task | Status | Owner | Notes |
| :--- | :--- | :--- | :--- | :--- |
| 6.1 | Error handling & edge cases | ⬜ | — | Graceful handling of: empty DB, Gemini API failures, invalid webhook payloads |
| 6.2 | Loading states & skeletons | ⬜ | — | Skeleton loaders for dashboard, tables, timeline |
| 6.3 | Empty states | ⬜ | — | Friendly empty states for: no data seeded, no active journeys, no audit logs |
| 6.4 | README.md | ⬜ | — | Quick start guide, screenshots, architecture overview |
| 6.5 | .env.example verification | ⬜ | — | Ensure all required vars are documented |
| 6.6 | Demo walkthrough script | ⬜ | — | Step-by-step script for 5-minute pitch video |
| 6.7 | End-to-end smoke test | ⬜ | — | Full flow: seed → run agent → view dashboard → simulate customer → verify audit |
| 6.8 | Code cleanup & comments | ⬜ | — | Remove dead code, add JSDoc to key functions |
| 6.9 | 5-minute pitch video script | ⬜ | — | Narration script for demo recording |

---

## Progress Summary

| Phase | Total Tasks | Done | In Progress | Not Started |
| :--- | :--- | :--- | :--- | :--- |
| Phase 1: Foundation | 11 | 0 | 0 | 11 |
| Phase 2: Agent Core | 14 | 0 | 0 | 14 |
| Phase 3: Communication | 8 | 0 | 0 | 8 |
| Phase 4: Dashboard | 13 | 0 | 0 | 13 |
| Phase 5: Simulator | 6 | 0 | 0 | 6 |
| Phase 6: Polish | 9 | 0 | 0 | 9 |
| **Total** | **61** | **0** | **0** | **61** |

---

## Dependencies & Blockers

| Dependency | Required By | Status |
| :--- | :--- | :--- |
| Razorpay test API keys | Phase 2 (task 2.3) | ⬜ Need to create Razorpay account & get test keys |
| Gemini API key | Phase 2 (task 2.6) | ⬜ Need to get from Google AI Studio |
| Node.js 18+ installed | Phase 1 (task 1.1) | ⬜ Verify local environment |
