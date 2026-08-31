<!-- labels: ci,low,security -->
# RA-21 — The dependency gate only fails on critical

**Severity:** Low · **Area:** `.github/workflows/security.yml` · **Est:** 15 min

## Summary
`npm audit --audit-level=critical` means high and moderate advisories never break the build.

## Location
`.github/workflows/security.yml:43`

## Evidence
```yaml
- name: Run npm Audit
  run: npm audit --audit-level=critical
```
`npm audit` currently reports 4 moderate advisories — esbuild reachable through `drizzle-kit`, dev-dependency only, so not urgent in itself. The gate is the finding, not the advisories.

## Proposed fix
```yaml
run: npm audit --audit-level=high --omit=dev
```
Use `--omit=dev` if dev-tree noise is the concern, or drop it and accept the current 4 moderates as a tracked exception.

## Acceptance criteria
- [ ] CI fails on high or critical advisories in production dependencies
- [ ] Current advisories either resolved or documented as an accepted exception

## Note — what is already correct here
Worth recording alongside this: `.env` contains only `XXXX` placeholders, `.gitignore` correctly covers `.env*` (with an `.env.example` exception) and the SQLite files, and gitleaks runs on every PR. No credential exposure was found anywhere in the tree.
