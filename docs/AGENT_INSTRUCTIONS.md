# RecoverAI — Agent Instructions

This file provides instructions and conventions for all AI agents (Antigravity, Copilot, Cursor, etc.) working on the RecoverAI codebase.

---

## 1. Project Context

**RecoverAI** is a Smart Revenue Recovery Agent built for the Razorpay AI Buildathon 2026, Track 3 (AI Revenue Recovery).

- **Stack:** Next.js 15 (App Router) + TypeScript + Tailwind CSS + shadcn/ui + SQLite (Drizzle ORM) + Google Gemini API
- **Purpose:** Detect payment failures, classify root causes, execute multi-channel recovery (WhatsApp → SMS → Voice), enforce stopping rules, and display measured results with full audit trails
- **Key Docs:**
  - [PROJECT_DOCUMENTATION.md](./PROJECT_DOCUMENTATION.md) — Full technical spec
  - [PRD.md](./PRD.md) — Product requirements
  - [TASKS.md](./TASKS.md) — Task tracker

---

## 2. Code Conventions

### 2.1 TypeScript

- **Strict mode** enabled. No `any` types unless absolutely necessary (and documented with `// eslint-disable-next-line`).
- Use **interfaces** for object shapes that will be extended, **types** for unions and intersections.
- All function parameters and return types must be explicitly typed.
- Use `as const` for literal tuples and enum-like objects.

### 2.2 Naming

| Entity | Convention | Example |
| :--- | :--- | :--- |
| Files/directories | `kebab-case` | `payment-links.ts`, `audit-timeline.tsx` |
| React components | `PascalCase` | `MetricsCards.tsx`, `AuditTimeline.tsx` |
| Functions | `camelCase` | `classifyFailure()`, `createPaymentLink()` |
| Constants | `SCREAMING_SNAKE_CASE` | `MAX_RETRY_ATTEMPTS`, `CONTACT_HOURS_START` |
| DB table names | `snake_case` | `payment_failures`, `recovery_journeys` |
| ID prefixes | `prefix_` + nanoid | `cust_`, `fail_`, `rj_`, `ra_`, `audit_` |

### 2.3 File Organization

```
src/lib/     → Business logic, no React imports
src/app/     → Next.js routes and pages only
src/components/ → React components only
```

- **No business logic in components.** Components call server actions or API routes.
- **No React imports in `src/lib/`.** Keep it pure TypeScript for testability.
- **One export per file** for major modules. Utility files can have multiple exports.

### 2.4 Database

- All monetary amounts are stored in **paise** (integer). ₹499.00 = `49900`.
- Dates are stored as **ISO 8601 strings** (`2026-08-21T10:00:00+05:30`).
- `audit_logs` table is **append-only**. Never `UPDATE` or `DELETE` rows.
- Use Drizzle ORM for all queries. No raw SQL strings.

### 2.5 API Routes

- All API routes return JSON with consistent shape:
  ```typescript
  // Success
  { success: true, data: { ... } }
  
  // Error
  { success: false, error: { code: string, message: string } }
  ```
- Use Next.js `NextResponse.json()` for responses.
- Validate request bodies at the top of every route handler.

### 2.6 Error Handling

- Wrap all async operations in try-catch.
- Log errors with context: `console.error('[module:function]', error)`.
- Never expose internal error details to the client — return sanitized messages.
- LLM calls must have a **template-based fallback** if the API fails or returns invalid JSON.

---

## 3. PR Guidelines

### 3.1 Branch Naming

```
feature/  → New features (e.g., feature/webhook-ingestion)
fix/      → Bug fixes (e.g., fix/audit-log-timestamp)
refactor/ → Code refactoring (e.g., refactor/coordinator-state-machine)
docs/     → Documentation changes (e.g., docs/update-readme)
```

### 3.2 Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add webhook ingestion endpoint with HMAC verification
fix: handle edge case where error_reason is null
refactor: extract strategy selection into separate module
docs: add API contract examples to PRD
chore: update dependencies
```

### 3.3 PR Checklist

Before submitting a PR, verify:

- [ ] **Types:** No TypeScript errors (`npx tsc --noEmit`)
- [ ] **Lint:** No lint warnings (`npm run lint`)
- [ ] **Schema:** Drizzle schema changes have corresponding migrations
- [ ] **Audit:** Any new system action writes to `audit_logs`
- [ ] **Stopping rules:** New recovery logic respects all 5 stopping rules
- [ ] **LLM guardrails:** No PII sent to Gemini; amounts from DB not LLM
- [ ] **Fallback:** LLM-dependent code has template fallback path
- [ ] **Contact hours:** Any outreach action respects 8AM–7PM IST window
- [ ] **Idempotency:** Webhook handlers don't create duplicates on replay
- [ ] **Task tracker:** Updated [TASKS.md](./TASKS.md) with current status

### 3.4 PR Description Template

```markdown
## What
Brief description of changes.

## Why
Link to task in TASKS.md (e.g., "Implements Task 2.5: Failure classifier").

## How
Key implementation details, design decisions.

## Testing
How to verify:
1. Step 1
2. Step 2
3. Expected result

## Screenshots
(If UI changes)
```

---

## 4. Task Lifecycle Protocol

Every task in [TASKS.md](./TASKS.md) follows this exact lifecycle. **No shortcuts.**

### 4.1 Lifecycle Flow

```
⬜ Not Started
     │
     │  Agent picks the task
     ▼
🟡 In Progress  ←── Update TASKS.md status to 🟡
     │
     │  Agent writes code
     │  Agent creates branch: feature/task-{id}-{short-name}
     │  Agent commits with conventional commit message
     │  Agent opens PR (see PR Guidelines §3)
     ▼
🔍 In Review  ←── PR is open, awaiting review/merge
     │
     │  PR is merged (by user or auto-merge)
     ▼
✅ Done  ←── THREE things happen (all mandatory):
     │
     ├─ 1. Update TASKS.md: Change status ⬜/🟡 → ✅
     ├─ 2. Store mem0 memory: Record what was completed
     └─ 3. Check phase: If all tasks in phase are ✅, store phase-complete memory
```

### 4.2 Step-by-Step Agent Behavior

#### Step 1: Pick Task → Mark 🟡

Before writing any code, update [TASKS.md](./TASKS.md):

```markdown
# Before
| 1.5 | Define database schema (all 5 tables) | ⬜ | — | ...

# After
| 1.5 | Define database schema (all 5 tables) | 🟡 | Agent | Started 2026-08-21 |
```

#### Step 2: Code → Branch → Commit → PR

1. **Create branch:** `git checkout -b feature/1.5-database-schema`
2. **Write code** in the correct files per [Project Structure](#7-quick-reference-file-locations)
3. **Commit:** `git add . && git commit -m "feat: define database schema with 5 tables (Drizzle ORM)"`
4. **Push:** `git push origin feature/1.5-database-schema`
5. **Open PR** with the template from §3.4, referencing the task ID

#### Step 3: Post-Merge — Mark ✅ + Mem0 + Phase Check

**This step is MANDATORY after every PR merge.** The agent must perform all three actions:

**Action 1 — Update TASKS.md:**
```markdown
# After merge
| 1.5 | Define database schema (all 5 tables) | ✅ | Agent | Merged PR #3 |
```

**Action 2 — Store mem0 memory:**
```json
{
  "text": "RecoverAI: Task 1.5 DONE — Database schema defined with 5 tables (customers, payment_failures, recovery_journeys, recovery_actions, audit_logs) using Drizzle ORM in src/lib/db/schema.ts. PR merged.",
  "agent_id": "recoverai-builder",
  "metadata": {
    "project": "recoverai",
    "phase": "1",
    "task": "1.5",
    "type": "task_completed"
  }
}
```

**Action 3 — Phase completion check:**
- Count remaining ⬜/🟡 tasks in the current phase
- If **all tasks in the phase are ✅**, update the Progress Summary table in TASKS.md AND store a phase-complete memory:
```json
{
  "text": "RecoverAI: Phase 1 (Foundation & Project Setup) COMPLETE. 11/11 tasks done. All green. Moving to Phase 2 (Core Agent Logic). Next task: 2.1 (Razorpay webhook signature verification).",
  "agent_id": "recoverai-builder",
  "metadata": { "project": "recoverai", "phase": "1", "type": "phase_completed" }
}
```

### 4.3 Handling Tasks Without PRs

Some tasks don't require a PR (e.g., environment setup, smoke tests, documentation). For these:

| Task Type | Workflow |
| :--- | :--- |
| **Environment setup** (1.1, 1.2, 1.3) | Execute commands → verify success → mark ✅ → store mem0 |
| **Smoke tests** (1.11, 6.7) | Run test → verify output → mark ✅ → store mem0 |
| **Documentation** (6.4, 6.6, 6.9) | Write file → commit directly to `main` → mark ✅ → store mem0 |

### 4.4 Handling Multiple Tasks in One PR

If a single PR covers multiple related tasks (e.g., 1.4 + 1.5 + 1.6 are all DB setup):

1. Branch name references the first task: `feature/1.4-drizzle-sqlite-setup`
2. Commit message lists all tasks: `feat: set up Drizzle ORM, define schema, run migration (Tasks 1.4-1.6)`
3. **After merge, mark ALL covered tasks ✅** in TASKS.md
4. Store **one combined mem0 memory** covering all tasks

### 4.5 Reverting a Task

If a merged PR needs to be reverted:

1. Mark the task(s) back to ⬜ in TASKS.md
2. Store a mem0 memory explaining the revert:
   ```json
   { "text": "RecoverAI: Task 1.5 REVERTED — Schema had incorrect column types for amounts (used float instead of integer paise). Needs redo.", "type": "bug_fix" }
   ```

---

## 5. Mem0 Memory Management

### 5.1 Purpose

[Mem0](https://mem0.ai) provides persistent memory across agent conversations. Use it to store and retrieve project context, decisions, and progress so that any agent session can pick up where the last one left off.

### 5.2 When to Store Memories

Store a memory after any of these events:

| Event | Memory Text Example |
| :--- | :--- |
| **Task completed** | `"RecoverAI: Completed Task 1.5 — Database schema defined with 5 tables (customers, payment_failures, recovery_journeys, recovery_actions, audit_logs) using Drizzle ORM."` |
| **Design decision made** | `"RecoverAI: Decision — Using SQLite WAL mode to handle concurrent writes from webhook ingestion and dashboard reads."` |
| **Bug fixed** | `"RecoverAI: Fixed bug where audit_logs timestamp was UTC instead of IST. Solution: use date-fns-tz formatInTimeZone()."` |
| **Phase completed** | `"RecoverAI: Phase 1 (Foundation) complete. 11/11 tasks done. Next: Phase 2 (Core Agent Logic)."` |
| **Architecture change** | `"RecoverAI: Changed from Prisma to Drizzle ORM for lighter bundle size and native SQLite support."` |
| **Blocker encountered** | `"RecoverAI: Blocker — Razorpay test mode doesn't support payment_link.paid webhook simulation. Workaround: simulate via internal API route."` |

### 5.3 How to Store Memories

Use the Mem0 MCP `add_memory` tool:

```json
{
  "text": "RecoverAI: Completed Task 2.11 — Recovery Coordinator state machine implemented with states: detected, diagnosing, recovering, escalating, resolved, exhausted, opted_out. Uses switch-case pattern, not a library.",
  "agent_id": "recoverai-builder",
  "metadata": {
    "project": "recoverai",
    "phase": "2",
    "task": "2.11",
    "type": "task_completed"
  }
}
```

### 5.4 How to Retrieve Memories

At the start of a new session or when context is needed:

```json
// Search for project context
{
  "query": "RecoverAI current progress and recent decisions",
  "filters": { "AND": [{ "agent_id": "recoverai-builder" }] },
  "top_k": 20
}
```

### 5.5 Memory Categories

Use these `type` values in metadata for organized retrieval:

| Type | When |
| :--- | :--- |
| `task_completed` | A task from TASKS.md is done |
| `decision` | An architectural or design decision is made |
| `bug_fix` | A bug is identified and fixed |
| `blocker` | A blocking issue is encountered |
| `phase_completed` | An entire phase is finished |
| `context` | General project context or conventions |

### 5.6 Session Start Protocol

When starting a new coding session on RecoverAI, the agent should:

1. **Search mem0** for recent project memories:
   ```json
   { "query": "RecoverAI latest progress status blockers", "top_k": 15 }
   ```
2. **Read TASKS.md** to see current task statuses
3. **Resume from the first ⬜ (Not Started) task** in the current phase
4. **After completing each task**, store a memory AND update TASKS.md

---

## 6. Key Technical Decisions (for Agent Reference)

| Decision | Choice | Rationale |
| :--- | :--- | :--- |
| Frontend framework | Next.js 15 App Router | Full-stack, server actions, single repo |
| Styling | Tailwind + shadcn/ui | Production-quality with minimal code |
| Database | SQLite via better-sqlite3 | Zero-config, portable, judge-friendly |
| ORM | Drizzle | Type-safe, lightweight, SQLite-native |
| LLM | Google Gemini (gemini-2.5-flash) | Fast, cheap, good JSON mode |
| ID generation | nanoid with prefixes | `cust_`, `fail_`, `rj_`, `ra_`, `audit_` |
| Amounts | Integer (paise) | Razorpay convention, no float errors |
| Timestamps | ISO 8601 strings in IST | Human-readable, consistent |
| State machine | Plain TypeScript switch/case | No external lib needed for 7 states |
| Charts | Recharts | React-native, good docs |

---

## 7. Common Pitfalls to Avoid

1. **Don't use `any` type** — Always type webhook payloads, API responses, and DB results.
2. **Don't forget audit logs** — Every state transition, message send, and customer interaction MUST be logged.
3. **Don't send PII to LLM** — Only send: failure reason, amount, language, product description. Never: card number, email, phone, address.
4. **Don't skip contact hours check** — Every outreach action must call `isWithinContactHours()` before executing.
5. **Don't UPDATE audit_logs** — This table is append-only by design. If a correction is needed, insert a new correction event.
6. **Don't hardcode amounts** — Always read from DB. LLM must never generate or hallucinate monetary values.
7. **Don't forget stopping rules** — Before every recovery action, check all 5 stopping conditions.
8. **Don't create duplicate journeys** — Use idempotency keys (razorpay_payment_id) to prevent duplicate processing.

---

## 8. Quick Reference: File Locations

| What | Where |
| :--- | :--- |
| DB schema | `src/lib/db/schema.ts` |
| Seed data | `src/lib/db/seed.ts` |
| Recovery coordinator | `src/lib/recovery/coordinator.ts` |
| Failure classifier | `src/lib/recovery/classifier.ts` |
| LLM prompts | `src/lib/ai/prompts.ts` |
| Gemini client | `src/lib/ai/gemini.ts` |
| Razorpay client | `src/lib/razorpay/client.ts` |
| Webhook handler | `src/app/api/webhooks/razorpay/route.ts` |
| Dashboard page | `src/app/page.tsx` |
| Customer detail | `src/app/customers/[id]/page.tsx` |
| Simulator page | `src/app/simulator/page.tsx` |
| Time utilities | `src/lib/utils/time.ts` |
| Audit logger | `src/lib/utils/audit.ts` |
