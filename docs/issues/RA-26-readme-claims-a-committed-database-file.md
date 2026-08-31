<!-- labels: low,docs,demo-integrity -->
# RA-26 — README claims the SQLite database is a committed file; it is gitignored

**Severity:** Low · **Area:** `README.md`, `.gitignore` · **Est:** 20 min

## Summary
The README's getting-started section tells an evaluator that the database ships with the repository:

> No Docker, no external database — SQLite is a single committed file. Zero-config by design,
> so evaluating this takes minutes, not a setup session.

Nothing under `data/` is tracked. `.gitignore:44-48` excludes `data/*.db` and its WAL/SHM sidecars, and `git ls-files data/` returns empty.

## Location
`README.md` — "Getting started" section · `.gitignore:44-48`

## Evidence
```
$ git ls-files data/
                        ← nothing tracked

$ sed -n '44,48p' .gitignore
# local sqlite databases
data/*.db
data/*.db-wal
data/*.db-shm
data/*.db-journal
```

## Impact
Low in practice, because the inline DDL in `src/lib/db/index.ts` creates the schema on first connection, so a fresh clone does boot and seed correctly — I verified this against a clean database path. The zero-config *promise* holds; only the explanation of how it holds is wrong.

The reason to fix it anyway is proximity. This sentence sits two paragraphs from the setup instructions a judge will actually follow, and it is checkable in one command. Given RA-22, RA-23, and RA-24 are all "the README asserts something the repository does not do," a fourth instance of the same pattern — however harmless on its own — reinforces exactly the impression we cannot afford. Gitignoring the database is also the *correct* choice; we are misdescribing a good decision.

## Proposed fix
Replace the claim with what actually happens:

> No Docker, no external database. The SQLite file is created and seeded on first run,
> so evaluating this takes minutes, not a setup session.

Then re-read the whole getting-started flow against a genuinely clean clone and confirm every step is accurate — in particular that no `db:migrate` step is needed, which depends on how RA-25 is resolved. If RA-25 lands Option 1, this section needs updating again.

## Acceptance criteria
- [ ] No documentation claims a committed database file
- [ ] The documented setup flow has been executed verbatim against a fresh clone and works with no undocumented steps
- [ ] The getting-started section is consistent with whatever RA-25 settles on

## Related
RA-25 (the database provisioning mechanism this text describes), RA-17 (prior instance of documentation overstating what the code does)
