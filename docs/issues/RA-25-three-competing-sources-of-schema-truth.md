<!-- labels: high,data-integrity,reliability,demo-integrity -->
# RA-25 — Three competing sources of schema truth; Drizzle migrations are dead code and existing databases never migrate

**Severity:** High · **Area:** `src/lib/db/index.ts`, `src/lib/db/migrations/` · **Est:** 2-3 h

## Summary
The schema is declared in three places that can and do disagree:

1. `src/lib/db/index.ts:12` — inline `CREATE TABLE IF NOT EXISTS` DDL, executed on every connection. **This is the only one that runs.**
2. `src/lib/db/schema.ts` — the Drizzle model the application queries through.
3. `src/lib/db/migrations/*.sql` — four generated migrations that nothing ever applies.

There is no `__drizzle_migrations` table in the database and no `db:migrate` step in any documented flow, so the migration files are inert. Worse, `IF NOT EXISTS` is a no-op against an existing table, so **once a database file exists it can never pick up a schema change** — it silently stays on whatever shape it was born with.

## Location
`src/lib/db/index.ts:12-109` (`initializeTables`), invoked unconditionally from `getOrCreateDb()` at `src/lib/db/index.ts:128`.

## Evidence
The column `razorpay_customer_id` was added by migration `0002_fresh_kronos.sql` and is present in both the inline DDL and `schema.ts`. It is absent from any database created before that change:

```
$ sqlite3 data/recoverai.db "PRAGMA table_info(customers)"
id, name, email, phone, preferred_language, segment,
total_failures, total_recovered_amount, dnd_status, created_at, updated_at
                                      ↑ no razorpay_customer_id

$ sqlite3 data/recoverai.db "select count(*) from __drizzle_migrations"
Error: no such table: __drizzle_migrations
```

The consequence is already live in the test suite. `tests/e2e-smoke.test.ts` — the only test that exercises the full autonomous workflow, and therefore the one that validates the actual demo — fails on a developer machine with a pre-existing database:

```
FAIL tests/e2e-smoke.test.ts > RecoverAI End-to-End Autonomous Workflow Smoke Suite
SqliteError: table customers has no column named razorpay_customer_id
 ❯ seedDatabase src/lib/db/seed.ts:63:3

Test Files  1 failed | 25 passed (26)
Tests  160 passed | 6 skipped (166)
```

Against a fresh path the same suite passes, which is what makes this dangerous — CI is green, and the failure only ever appears on a machine that has run the app before. Such as the one doing the demo.

## Impact
- **Demo risk.** The end-to-end workflow test is silently non-functional on the primary dev machine. If a schema change lands the day before judging, the demo database breaks in a way CI cannot see and the error surfaces mid-presentation as a 500 from the seed button.
- **The 160 passing tests overstate our confidence.** The one integration test covering the pitch is the one that is broken; the green suite hides it.
- **Migrations are decorative.** We carry `drizzle-kit`, four migration files, `db:generate`/`db:migrate`/`db:check` scripts, and a `0002_snapshot.json` that a previous fix commit went to the trouble of hand-synchronising — all of it inert. That is maintenance cost buying nothing, and it misleads any reader into thinking schema evolution is handled.

## Proposed fix
Pick one source of truth. Given SQLite, a zero-config evaluation story, and the README's "no Docker, no external database" promise, either option below is defensible — but the split must go.

**Option 1 — make Drizzle migrations real (preferred).**
1. Delete `initializeTables` and its inline DDL entirely.
2. Call `migrate()` from `drizzle-orm/better-sqlite3/migrator` once in `getOrCreateDb()`, pointed at `src/lib/db/migrations`. This preserves zero-config (still automatic on boot, still one file, still no Docker) while making existing databases actually converge.
3. Verify the four existing migrations reproduce the current inline DDL exactly before deleting it — regenerate from `schema.ts` and diff.
4. Add a baseline migration so databases created by the old inline DDL adopt cleanly.

**Option 2 — drop Drizzle migrations.**
Delete `migrations/`, the three `db:*` scripts, and `drizzle-kit`; keep the inline DDL as the declared single source and add an explicit startup schema-version check that fails loudly on drift. Simpler, but gives up in-place schema evolution.

Either way:
5. Add `data/*.db` cleanup to the test setup so `tests/e2e-smoke.test.ts` always runs against a fresh database and cannot pass or fail based on local history.
6. Add a CI job that runs the suite twice in the same workspace — once fresh, once against the database the first run left behind. That is the case CI currently cannot catch.

**Immediate, before any demo:** `rm -f data/recoverai.db*` on the demo machine and re-seed.

## Acceptance criteria
- [ ] Exactly one source of schema truth remains in the repository
- [ ] A database created before a schema change converges to the new schema on next boot, without manual intervention
- [ ] `tests/e2e-smoke.test.ts` passes against both a fresh and a pre-existing database
- [ ] Test setup provisions an isolated database per run; no test depends on `data/recoverai.db`
- [ ] CI exercises the second-run-in-same-workspace case
- [ ] If migrations are kept: `__drizzle_migrations` is populated after boot. If dropped: no unused `drizzle-kit` tooling remains

## Related
RA-18 (test suite could not fail on real defects — same blind spot, different cause), RA-26 (README misdescribes how the database is provisioned)
