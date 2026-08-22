# Contributing to RecoverAI

Thank you for your interest in contributing to **RecoverAI**! RecoverAI is built to provide an autonomous, ethical, and compliance-first revenue recovery platform for Razorpay merchants.

---

## 1. Code of Conduct

All contributors and maintainers are expected to adhere to our [Code of Conduct](CODE_OF_CONDUCT.md). Please treat everyone with respect and kindness.

---

## 2. Development Setup

```bash
# 1. Clone the repository
git clone https://github.com/archittmittal/Recover-AI.git
cd Recover-AI/recover-ai

# 2. Install dependencies
npm install

# 3. Configure environment variables
cp .env.example .env.local

# 4. Run test suite
npm test

# 5. Start the development server
npm run dev
```

---

## 3. Pull Request Guidelines & PR Governance

Every pull request must satisfy the following automated guardrails:

1. **Title Format**: PR titles must follow Conventional Commits (e.g., `feat: ...`, `fix: ...`, `docs: ...`, `test: ...`).
2. **Issue Traceability**: PR bodies must reference corresponding GitHub issues (e.g., `Closes #123`).
3. **Architectural Guardrails**: Recovery modules (`src/lib/recovery`, `src/lib/ai`) must never import simulation models (`src/lib/simulation`).
4. **Zero-Warning Checks**:
   - `npm test` (all Vitest suites must pass).
   - `npm run typecheck` (`tsc --noEmit` must pass with 0 errors).
   - `npm run lint` (ESLint must pass with 0 warnings).
5. **OpenSSF Security Compliance**:
   - Webhook handlers must use timing-safe HMAC checks.
   - LLM prompts must contain zero PII.
   - Database writes to `audit_logs` must remain append-only and immutable.
