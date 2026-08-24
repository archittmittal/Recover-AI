# Changelog

All notable changes to the **RecoverAI** platform will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Maintenance & Performance
- **chore(deps)(deps-dev): bump @types/node from 20.19.43 to 26.2.0** in [#104](https://github.com/archittmittal/Recover-AI/pull/104) by @archittmittal
- **chore(deps)(deps): bump nanoid from 5.1.16 to 6.0.1** in [#107](https://github.com/archittmittal/Recover-AI/pull/107) by @archittmittal

### CI/CD & Build
- **ci(actions)(deps): bump the github-actions group with 8 updates** in [#109](https://github.com/archittmittal/Recover-AI/pull/109) by @archittmittal
- **update changelog workflow to push-to-main trigger with skip-ci** in [#112](https://github.com/archittmittal/Recover-AI/pull/112) by @purvanshjoshi

## [1.0.0] - 2026-08-23

### Added
- **Autonomous Recovery Agent Engine**: Full journey lifecycle state machine (`detected` → `diagnosing` → `recovering` → `escalating` → `resolved`/`exhausted`/`opted_out`).
- **Deterministic & LLM Failure Diagnostics**: Instant error taxonomy mapping for Razorpay payment errors (`gateway`, `network`, `issuer_bank`, `customer_psp`, `customer`) paired with Google Gemini 2.5 Flash contextual reasoning.
- **Multi-Channel Escalation Engine**: Automated escalation sequencing across WhatsApp (with interactive read receipts), SMS (TRAI DLT compliance), and AI Voice Calls (Hinglish synthesis).
- **Mandatory Safety Stopping Rules**: Strict deterministic enforcement of Payment Success, STOP opt-out keywords, 3-attempt exhaustion limit, 8:00 AM – 7:00 PM IST contact hours gating, and DND registry checks.
- **Executive Recovery Command Dashboard**: 6 real-time KPI metric summary cards, 3-arm scientific baseline evaluation (Arm A vs Arm B vs Arm C), channel analytics, and strategy breakdown.
- **Customer Ledger & Audit Trail Modal**: Filterable customer ledger with dedicated "Honest Exceptions" tab and immutable chronological audit timeline.
- **Interactive Simulator Sandbox**: Dual-panel sandbox to seed 50+ batch failures, simulate dynamic customer replies, and trigger recovery workflows.
- **Verification & Test Suite**: 20 automated Vitest unit tests covering stopping rules, contact hours, classification taxonomy, and HMAC timing-safe webhook verification.

### Security & CI/CD
- **OpenSSF Scorecard Integration**: Supply-chain security analyzer with SARIF export to GitHub Code Scanning.
- **CodeQL Advanced Static Analysis**: Deep static code analysis for TypeScript and JavaScript.
- **Dependabot Dependency Management**: Automated weekly dependency maintenance for npm packages and GitHub Actions.
- **PR Governance & Guardrails**: Gitleaks secret scanning, conventional commit validation, and architectural boundary separation checks.
