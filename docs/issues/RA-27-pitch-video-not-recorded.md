<!-- labels: critical,demo-integrity,docs -->
# RA-27 — The 5-minute pitch video, a required submission field, has not been recorded

**Severity:** Critical · **Area:** submission deliverables · **Est:** 4-6 h including retakes

## Summary
`docs/PRD.md:52` documents that the application form asks for exactly 12 items. Eleven are ready or derivable from the repository. The 5-minute pitch video is marked **"Pending build"** and nothing in the repo indicates recording has started.

This is a hard gate. A submission without it is incomplete regardless of code quality, and no amount of engineering substitutes for the field being empty.

## Location
`docs/PRD.md:62` — submission deliverables table, row "5-min pitch video", status "Pending build".
Script source: `docs/DEMO_SCRIPT.md` (task 6.9).

## Evidence
```
| 5-min pitch video | Task 6.9 script → recorded walkthrough | Pending build |
```
No video asset, no recording, no upload link anywhere in the repository or docs.

## Impact
Straightforward: an incomplete submission. Secondary risk is that the video is left to the final hours, which is when it collides with every other unfinished item and gets recorded against a broken demo environment (see RA-25 — the e2e path is currently broken on the primary dev machine).

## Blocked by
The script cannot be recorded honestly until the claims it narrates are true:
- `docs/DEMO_SCRIPT.md:14` instructs the presenter to say *"Controlled scientific baseline comparison"* and *"Net lift +18.5% incremental recovery"* — both fabricated (RA-22).
- The AI segment cannot be demonstrated at all while the project runs in mock mode (RA-24).
- A demo recorded against a stale local database will fail mid-take (RA-25).

Recording before RA-22, RA-24 and RA-25 land means either re-recording or narrating claims the code cannot reproduce on screen.

## Proposed fix
1. Land RA-24 (30 min) so the AI is demonstrable, and RA-25 so the demo environment is stable.
2. Resolve RA-22/RA-23 — either built, or the claims struck from `DEMO_SCRIPT.md`.
3. Rewrite `docs/DEMO_SCRIPT.md` so every number spoken aloud is one the running app reproduces live.
4. Record. Budget for at least two takes.
5. Give the RA-01..RA-21 remediation story screen time — an external audit finding 21 defects and all of them being closed is the most credible evidence of build quality in the project, and it currently appears nowhere in the pitch.

## Acceptance criteria
- [ ] Video recorded, within the 5-minute limit
- [ ] Every figure spoken aloud is reproducible live in the running application
- [ ] No claim in the video depends on RA-22/RA-23 unless those are genuinely implemented
- [ ] Video is uploaded and the link is captured in the submission field
- [ ] `docs/PRD.md:62` status updated from "Pending build"

## Related
RA-22, RA-23 (claims the current script narrates), RA-24 (AI must actually run to be shown), RA-25 (demo stability), RA-28 (a live URL would let judges verify what the video claims)
