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
- Every incoming webhook event ID and its SHA-256 payload digest are recorded in the `webhook_events` table.
- Duplicate or replayed webhook events are intercepted and rejected with zero state corruption.

### C. Zero-PII Data Minimization (DPDPA 2023)
- No primary account numbers (PAN), CVVs, card expiration dates, or raw bank account credentials are ever stored in the database or sent to Google Gemini LLM prompts.
- Phone numbers in audit logs and communication identifiers are masked or replaced with cryptographically secure random UUIDs.

### D. Architectural Boundary Separation
- Static CI governance (`pr-governance.yml`) strictly forbids production recovery modules (`src/lib/recovery`, `src/lib/ai`) from importing testbed simulation models (`src/lib/simulation`), preventing test mocks from leaking into production logic.

### E. Automated Vulnerability Scanning
- **Gitleaks**: Secrets and credential leak detection runs on every pull request.
- **Dependency Audit**: `npm audit` scans all production dependencies for known CVEs.
- **Static Analysis**: TypeScript strict mode and ESLint security rules run on every commit.
