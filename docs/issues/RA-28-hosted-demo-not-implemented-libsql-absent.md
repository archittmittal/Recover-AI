<!-- labels: high,demo-integrity,reliability,docs -->
# RA-28 — The hosted demo does not exist and cannot be built as documented: libSQL/Turso support was never implemented

**Severity:** High · **Area:** `src/lib/db/index.ts`, `docs/DEPLOYMENT.md`, `package.json` · **Est:** 3-4 h

## Summary
`docs/PRD.md:146` contains a section titled *"Reconsidered: hosted demo deployment"* which explicitly reverses an earlier decision to stay local-only, on the reasoning that evaluators review many submissions under time pressure and a live URL materially raises the chance the project is actually examined. It resolves to deploy against **libSQL/Turso**, because `better-sqlite3` writes to a local filesystem and a naive Vercel deploy *"would appear to work and then silently lose data mid-demo, which is worse than not deploying."*

That analysis is correct. It was also never implemented. There is no libSQL anywhere in the project, and no deployment exists.

## Location
- `src/lib/db/index.ts:116-126` — `better-sqlite3` and a local file path, hardcoded
- `package.json` — no `@libsql/client`, no `drizzle-orm/libsql`
- `docs/DEPLOYMENT.md:16` — documents `DATABASE_URL` as accepting a *"remote Turso/libSQL connection URL"*
- `docs/PRD.md:313` — milestone M8 definition of done includes *"live URL reachable"*

## Evidence
```
$ grep -rn "libsql\|turso\|@libsql" package.json src/ drizzle.config.ts
                                                   ← no matches
```

The driver is unconditional:
```ts
// src/lib/db/index.ts
const dbUrl = process.env.DATABASE_URL || 'file:./data/recoverai.db';
const dbPath = dbUrl.replace(/^file:/, '');       // ← assumes a filesystem path
const sqlite = globalForDb.sqlite ?? new Database(dbPath);   // better-sqlite3
```
Setting `DATABASE_URL` to a `libsql://` URL, as `DEPLOYMENT.md` invites, would have `.replace(/^file:/, '')` leave the string untouched and `better-sqlite3` attempt to open a file literally named `libsql://…`.

## Impact
1. **A documented deployment path that does not work.** `DEPLOYMENT.md` tells a reader Turso is supported. Anyone following it — a judge, a teammate — hits a failure the docs give no warning of. Same docs-vs-reality family as RA-22, RA-24 and RA-26.
2. **The PRD's own argument goes unanswered.** The project reasoned itself into needing a live URL and then did not build one. Milestone M8 is not met.
3. **A naive deploy is a trap.** Because the code silently accepts any `DATABASE_URL`, deploying to Vercel to "just get a URL up" before the deadline produces exactly the failure mode the PRD predicted: apparent success, then data loss mid-demo.

## Proposed fix
1. Add `@libsql/client` and switch to `drizzle-orm/libsql`, selecting the driver on the `DATABASE_URL` scheme: `file:` → `better-sqlite3` for local development, `libsql:`/`https:` → libSQL client. Keep local development byte-identical to today so the zero-config story survives.
2. Reject unrecognised schemes loudly at startup rather than mangling them into a filename.
3. Resolve RA-25 first, or in the same change — schema provisioning against a remote database cannot rely on the inline `CREATE TABLE IF NOT EXISTS` DDL running on every connection.
4. Provision a Turso database, deploy to Vercel, seed it.
5. Gate the simulator routes correctly on the public deployment — `RECOVERAI_DEMO_MODE` is already the intended mechanism (`.env.example`), and on a public URL `/api/simulator/seed` truncates every table for any anonymous caller. This interacts directly with RA-05 (#117), which is still open: a public deployment with no authenticated route is a materially different exposure than localhost.
6. Update `DEPLOYMENT.md` to describe what was actually built.

## Acceptance criteria
- [ ] `DATABASE_URL=libsql://…` connects through the libSQL driver
- [ ] `DATABASE_URL=file:…` behaves exactly as it does today
- [ ] An unrecognised scheme fails at startup with a clear error
- [ ] A live URL is reachable, seeded, and survives a full demo run without data loss
- [ ] Simulator routes are not anonymously destructive on the public deployment
- [ ] `docs/DEPLOYMENT.md` matches the implementation
- [ ] `docs/PRD.md` M8 "live URL reachable" is genuinely met

## Related
RA-25 (schema provisioning must be solved for remote databases), RA-05 / #117 (auth becomes urgent once public), RA-27 (a live URL lets judges verify the video's claims), RA-24 (deployment needs real credentials configured)
