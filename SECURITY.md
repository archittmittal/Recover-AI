# Security Policy & OpenSSF Compliance

RecoverAI takes security, privacy, and regulatory compliance seriously. Because this application processes financial transaction metadata and interacts with the **Razorpay API** under **RBI (Reserve Bank of India)** and **DPDPA (Digital Personal Data Protection Act 2023)** regulations, we maintain strict architectural guardrails and cryptographic standards.

---

## 1. Supported Versions

| Version | Supported | Security Maintenance |
| :--- | :---: | :--- |
| `0.1.x` (Main / Production) | ✅ | Active vulnerability patching and dependency monitoring |
| `< 0.1.0` | ❌ | Deprecated |

---

## 2. Reporting a Vulnerability

If you discover a security vulnerability in RecoverAI, please disclose it responsibly:

- **Email**: Send details to `security@recoverai.dev` or reach out directly to the maintainers on GitHub.
- **Response Time**: We acknowledge reports within **24 hours** and provide a triaged remediation timeline within **48 hours**.
- **Public Disclosure**: Please do not file public issues on GitHub for undisclosed security vulnerabilities. We will coordinate a patched release and publish a CVE / GitHub Security Advisory.

---

## 3. Security Architecture & OpenSSF Practices

RecoverAI adheres to the **OpenSSF (Open Source Security Foundation)** Best Practices:

### A. Cryptographic Timing Attack Prevention
- Incoming webhooks from Razorpay are verified using byte-level timing-safe equality:
  ```typescript
  crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(computedSignature, 'hex'))
  ```
- Length pre-checks ensure equal buffer allocation before executing `timingSafeEqual`, mitigating side-channel timing leaks.

### B. Idempotency & Replay Attack Defense
- Event identity is read from the `x-razorpay-event-id` header — the field Razorpay actually sends the identifier in — not a body field that is never present, so deduplication genuinely matches repeat deliveries.
- Every incoming webhook event ID and its SHA-256 payload digest are recorded in the `webhook_events` table.
- A duplicate delivery of an already-`processed` event is intercepted and rejected with zero state corruption.
- Known gap tracked separately: a delivery that fails mid-processing is not yet automatically retried on redelivery (a fix that reclaims and reprocesses `failed` events is in review).

### C. PII Minimization (DPDPA 2023)
- No primary account numbers (PAN), CVVs, card expiration dates, or raw bank account credentials are ever stored in the database or sent to Google Gemini LLM prompts. (`grep -rn "cardPan\|cvv" src` finds no read path from any request into storage or a prompt — only the demo card-detection helper in `tests/ethical-compliance.test.ts`, which exists to prove such data is never accepted.)
- Customer names sent to Google Gemini prompts are truncated to first-name-only before the request is built (`src/lib/ai/messenger.ts`, `src/lib/ai/conversation.ts` — see `tests/llm-prompt-data-minimization.test.ts`). Full names, phone numbers, and email addresses are never included in a prompt.
- Audit log entries (`writeAuditLog`, `src/lib/utils/audit.ts`) mask any `eventData` value that is itself a phone number or email address before it is persisted, via `maskPhone`/`maskEmail` in `src/lib/utils/pii.ts` (see `tests/pii-masking.test.ts`, `tests/audit-log-masking.test.ts`). This masks discrete phone/email fields, not phone/email substrings that might appear inside longer free-text fields such as a customer's own reply message or a dispatched message body — those are stored verbatim, since the audit trail's purpose is to reproduce exactly what was sent and received.
- Communication tracking IDs (`recovery_actions.id`, `webhook_events.id`) are opaque, randomly generated identifiers, not derived from phone numbers or other PII.

### D. Architectural Boundary Separation
- Static CI governance (`pr-governance.yml`) strictly forbids production recovery modules (`src/lib/recovery`, `src/lib/ai`) from importing testbed simulation models (`src/lib/simulation`), preventing test mocks from leaking into production logic.

### E. Automated Vulnerability Scanning
- **Gitleaks**: Secrets and credential leak detection runs on every pull request.
- **Dependency Audit**: `npm audit` runs on every pull request against the full dependency tree.
  Known gap tracked separately: the workflow currently gates only on `critical`-severity findings and does not fail the build on a match (`continue-on-error: true`) — a tightened gate (`--audit-level=high --omit=dev`, gate enforced) is in review. Verified locally that this stricter check already passes against the current lockfile (0 vulnerabilities in production dependencies; 4 moderate dev-only findings via `drizzle-kit`'s `esbuild` dependency, not shipped to production).
- **Static Analysis**: TypeScript strict mode and ESLint security rules run on every commit.
