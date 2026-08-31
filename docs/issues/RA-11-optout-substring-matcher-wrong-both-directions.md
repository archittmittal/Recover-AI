<!-- labels: compliance,medium,recovery-engine -->
# RA-11 — The opt-out matcher is a substring test, so it fires wrongly in both directions

**Severity:** Medium · **Area:** `src/lib/recovery/stopping-rules.ts` · **Est:** 2 h

## Summary
Opt-out detection uses `text.includes('stop')`. Substring matching produces false positives that permanently suppress customers who asked for help, and misses the most common genuine opt-out phrasings entirely.

## Location
`src/lib/recovery/stopping-rules.ts:38`

## Evidence
Verified against project source. **False positives** — customers permanently DND'd after asking for help:
```
"my card stopped working, please resend the link"  → ruleFired=opt_out
"the bank stopped my transaction"                  → ruleFired=opt_out
"I will stop by the branch and pay tomorrow"       → ruleFired=opt_out
```
**False negatives** — genuine requests that sail through:
```
"do not contact me again"     → ruleFired=null
"remove me from your list"    → ruleFired=null
"opt out"                     → ruleFired=null
"बंद करो"                      → ruleFired=null
```
Note the last: `'band karo'` is matched in Latin transliteration but not Devanagari, while `getTemplateFallbackMessage` sends the `'hi'` message *in* Devanagari. We write to customers in a script we cannot read replies in.

## Impact
Recoverable payments abandoned and customers permanently suppressed on one side; unhonoured opt-out requests on the other. The second is the regulatory exposure.

## Proposed fix
Word-boundary matching over an explicit keyword set, extended for the phrasings above:
```ts
const OPT_OUT = [
  /\b(stop|unsubscribe|opt\s?out)\b/i,
  /\b(do not|don't) (contact|message|call)\b/i,
  /\bremove me\b/i,
  /\b(band karo|mat bhejo|mat karo)\b/i,
  /(बंद करो|रोको|मत भेजो)/,
];
export function detectOptOut(text: string) {
  return OPT_OUT.some(re => re.test(text.trim()));
}
```
Where the deterministic matcher does not fire, treat the conversational agent's `intent === 'opt_out'` as authoritative — we already request that field and currently ignore it for state purposes.

## Acceptance criteria
- [ ] Table-driven test with a positive corpus and a negative corpus, both covering en / Hinglish / Devanagari
- [ ] All three false positives above resolve to `ruleFired: null`
- [ ] All four false negatives above resolve to `ruleFired: 'opt_out'`
- [ ] Single exported matcher, consumed by both the rules engine and the conversation agent (RA-08)

## Related
RA-08 (must be fixed together — same matcher)
