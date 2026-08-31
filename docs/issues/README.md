# RecoverAI — Audit Issue Backlog

30 findings, one file per issue. RA-01..RA-21 came from a partner-integration review of
`recover-ai @ v0.1.0` (all closed except RA-05). RA-22..RA-30 came from a pre-submission
readiness review against the Razorpay AI Buildathon Track 3 criteria — all open.
Each file is a complete GitHub issue body: summary, location, evidence, impact, proposed fix,
acceptance criteria. Labels are in an HTML comment on line 1.

Full report: https://claude.ai/code/artifact/c671b6f1-6852-44b5-9772-d382147552a1

## Suggested order

Ordered by risk removed per hour spent. The first four are roughly an afternoon and close every critical.

| # | Issue | Sev | Est | Closes |
|---|---|---|---|---|
| 1 | [RA-05](RA-05-no-authentication-on-any-route.md) — no auth on any route | High | 3-4 h | also RA-02, most of RA-09/RA-20 reachability |
| 2 | [RA-01](RA-01-webhook-signature-fails-open.md) — signature fails open | **Critical** | 30 m | |
| 3 | [RA-04](RA-04-idempotency-keys-off-nonexistent-field.md) — idempotency non-functional | **Critical** | 2 h | |
| 4 | [RA-03](RA-03-prompt-injection-payment-link-swap.md) — prompt injection swaps payment link | **Critical** | 2-3 h | highest consequence |
| 5 | [RA-06](RA-06-contact-hours-disabled-in-production-path.md) — contact hours disabled | High | 1 h | |
| 6 | [RA-07](RA-07-retry-backoff-never-enforced.md) — backoff never enforced | High | 2-3 h | |
| 7 | [RA-08](RA-08-optout-divergence-between-agent-and-rules.md) + [RA-11](RA-11-optout-substring-matcher-wrong-both-directions.md) — opt-out (fix together) | High / Med | 3 h | |
| 8 | [RA-09](RA-09-resolve-payment-not-idempotent.md) + [RA-13](RA-13-channel-comparison-pinned-to-zero.md) — resolution & attribution | High / Med | 2 h | makes the channel dashboard real |
| 9 | [RA-10](RA-10-failed-webhook-swallowed-by-idempotency-marker.md) — failed webhooks lost | High | 2-3 h | |
| 10 | [RA-02](RA-02-unauthenticated-seed-wipes-audit-log.md) — seed wipes audit log | **Critical** | 1 h | mostly done by RA-05 |
| 11 | [RA-18](RA-18-test-suite-cannot-fail-on-these-defects.md) — integration tests | Low | 3-4 h | keeps all of the above fixed |
| 12 | [RA-12](RA-12-communication-layer-is-dead-code.md) — comms layer unreachable | Med | 2-3 h | |
| 13 | [RA-14](RA-14-fabricated-payment-link-on-api-failure.md) — dead link on API failure | Med | 1 h | |
| 14 | [RA-15](RA-15-strategy-config-overridden-by-constants.md) — strategy config ignored | Med | 1 h | |
| 15 | [RA-16](RA-16-anonymous-payments-collapse-into-one-customer.md) — customers collapse | Med | 2 h | |
| 16 | [RA-17](RA-17-security-md-documents-nonexistent-controls.md) — docs overstate controls | Med | 2-4 h | do last; it documents the fixes above |
| 17 | [RA-19](RA-19-list-endpoints-load-and-join-in-memory.md) — in-memory joins | Low | 3-4 h | scalability criterion |
| 18 | [RA-20](RA-20-no-body-size-or-rate-limit.md) — no body cap / rate limit | Low | 2 h | folds into RA-05 |
| 19 | [RA-21](RA-21-dependency-gate-only-fails-on-critical.md) — audit gate too lax | Low | 15 m | |

## Buildathon readiness (RA-22..RA-30) — open

These are not defects in the partner-integration sense; the code does what it says locally.
They are gaps between what the documentation asserts and what the repository does, plus the
two submission deliverables that do not yet exist.

Eight of the nine share one root cause: **a claim shipped ahead of its implementation.** It
recurs in the README (RA-22, RA-26), `.env` (RA-24), `DEPLOYMENT.md` (RA-28), the engineering
log (RA-29) and the task board (RA-30). Individually each is arguable. Together they are the
finding — an evaluator who catches two will generalise to the rest, including the parts that
are genuinely excellent.

| # | Issue | Sev | Est | Why in this position |
|---|---|---|---|---|
| 1 | [RA-24](RA-24-no-live-credentials-entire-demo-runs-in-mock-mode.md) — no live credentials, AI never runs | **Critical** | 30 m | cheapest fix in the repo; unblocks RA-27 |
| 2 | [RA-29](RA-29-engineering-log-stale-and-narrates-an-unimplemented-fix.md) — log narrates unbuilt work as built | **Critical** | 2-3 h | highest reputational risk, in the document read *first*; step 1 is a tense correction, ~20 min |
| 3 | [RA-25](RA-25-three-competing-sources-of-schema-truth.md) — three sources of schema truth | High | 2-3 h | e2e smoke test already broken locally; blocks RA-27 and RA-28 |
| 4 | [RA-22](RA-22-arm-b-baseline-is-a-hardcoded-constant.md) + [RA-23](RA-23-no-simulation-response-model-exists.md) — baseline & response model | **Critical** ×2 | 8 h | one story, must land together or the comparison stays meaningless |
| 5 | [RA-27](RA-27-pitch-video-not-recorded.md) — pitch video not recorded | **Critical** | 4-6 h | hard submission gate; record only after 1-4 |
| 6 | [#117](https://github.com/archittmittal/Recover-AI/issues/117) RA-05 — no authenticated caller on any route | High | 3-4 h | becomes urgent the moment RA-28 makes it public |
| 7 | [RA-28](RA-28-hosted-demo-not-implemented-libsql-absent.md) — hosted demo / libSQL absent | High | 3-4 h | PRD argued itself into needing this and did not build it |
| 8 | [RA-30](RA-30-task-board-reports-83-of-83-complete.md) — board reports 83/83 | Med | 2-3 h | how the other gaps stayed invisible |
| 9 | [RA-26](RA-26-readme-claims-a-committed-database-file.md) — README misstates DB provisioning | Low | 20 m | trivial, sits in the setup flow a judge follows |

Total is well over a day. **If it does not all fit:** take Option 2 on RA-22/RA-23 (delete the
claims, document the deferral), and spend the recovered ~8 h on RA-27 and RA-29. A modest,
accurate submission scores better than an ambitious one caught overclaiming — which is the
whole lesson of this list.

**Before any demo or recording:** `rm -f data/recoverai.db*` and re-seed (RA-25).

## By severity

**Critical (4)** — all reachable by an unauthenticated request from the open internet
RA-01, RA-02, RA-03, RA-04

**High (6)** — compliance rails that exist in the codebase but are not connected to the sending path
RA-05, RA-06, RA-07, RA-08, RA-09, RA-10

**Medium (7)** — correctness and integrity; several make the dashboard state something untrue
RA-11, RA-12, RA-13, RA-14, RA-15, RA-16, RA-17

**Low (6)**
RA-18, RA-19, RA-20, RA-21, RA-26

Buildathon-readiness items are listed separately above — criticals RA-22, RA-23, RA-24, RA-27,
RA-29; high RA-25, RA-28; medium RA-30. Unlike RA-01..RA-21 these are not remotely reachable
defects but credibility and submission-readiness gaps.

## Verification status

- **Executed proof** (temporary Vitest file run against project source, since removed): RA-03, RA-08, RA-11
- **Exhaustive grep over `src/` and `tests/`**: RA-12, RA-13, RA-17
- Everything else: static review of the 38 source files
- **RA-22..RA-30**: verified by execution — full `vitest run` (160 pass, 1 suite fails),
  `tsc --noEmit` (clean), `next build` (passes), `PRAGMA table_info` against the live database,
  and a fresh-database run of the e2e suite to isolate RA-25 to pre-existing databases only.
  RA-28 confirmed by grep for `libsql|turso` across `package.json`, `src/`, `drizzle.config.ts`
  (no matches); RA-29 by `git log -1` against the log's last entry date

## Filing them on GitHub

```sh
./create-issues.sh --dry-run     # preview
./create-issues.sh               # create for real
```

Note: `create-issues.sh` files *every* `RA-*.md` in this directory. RA-01..RA-21 are already
filed and closed, so re-running it as-is would duplicate them. RA-22..RA-30 were filed
individually as issues #160-#168.

Issue creation dates are server-stamped by GitHub and cannot be set. The Issue Import API that
once accepted a custom `created_at` returns 404 — it has been retired. Where an issue reports a
condition that originated earlier than its filing date, the real dates are stated in the issue
body (see RA-29).
