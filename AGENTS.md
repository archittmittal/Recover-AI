<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Regenerate the lockfile with npm 10, not whatever npm is local

Every workflow pins `node-version: 22.x` (`ci.yml`, `security.yml`, `db-verify.yml`), so CI
installs with the npm 10 that ships with Node 22. A lockfile written by a newer npm can resolve
the tree differently, and `npm ci` on the runner then rejects it outright rather than adapting:

```
npm error `npm ci` can only install packages when your package.json and
npm error package-lock.json are in sync.
npm error Missing: esbuild@0.28.2 from lock file
npm error Missing: @esbuild/aix-ppc64@0.28.2 from lock file
... 52 more
```

That example is real. npm 11 resolves vitest's nested `esbuild@0.28.2` tree away; npm 10 keeps it
under both `tsx` and `vitest`. Nothing was wrong with either lockfile — they were just written by
different resolvers, and only one of them is the resolver CI uses.

**This does not reproduce locally.** `npm ci` on the machine that generated the lockfile passes,
because the missing pieces are the ones that machine's platform and npm version never needed. The
first failure is on the runner, which makes it an expensive way to find out.

So whenever `package.json` dependencies change, or a lockfile needs regenerating:

```bash
npx --yes npm@10 install --package-lock-only   # regenerate
npx --yes npm@10 ci                            # verify the runner can install it
```

Prefer the smallest change that works. Deleting `package-lock.json` and rebuilding it from scratch
produces a thousand-line diff that hides the actual dependency change and re-rolls unrelated
transitive versions; letting npm apply a delta to the existing lockfile keeps the diff additive and
reviewable. Check the diff size before committing — if a one-dependency change rewrote the whole
file, that is the signal, not a formality.

Prior art: `6f0f92b` ("regenerate the lockfile so npm 10 can install it") and `7434044`, which hit
this twice for the same reason.

# Verify against the running app, not only the test suite

335 tests pass on a dashboard that was clipping nine of its own labels, reporting a time the agent
disagreed with, and logging 150 React errors per page load (RA-36). The suite asserts behaviour it
was written to assert; it does not look at the screen. Before calling UI work done, run it, resize
it, and read the console.
