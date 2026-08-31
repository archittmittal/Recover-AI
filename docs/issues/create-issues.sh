#!/usr/bin/env bash
# Files each RA-*.md in this directory as a GitHub issue via the gh CLI.
# Title comes from the first "# " heading; labels from the <!-- labels: ... --> comment.
set -euo pipefail

DRY_RUN=0
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=1

cd "$(dirname "$0")"

command -v gh >/dev/null || { echo "gh CLI not found: https://cli.github.com"; exit 1; }
if [[ $DRY_RUN -eq 0 ]]; then
  gh repo view >/dev/null 2>&1 || {
    echo "Not in a GitHub repo. Run 'git init && gh repo create' first."; exit 1; }
fi

# Ensure the labels we use exist (ignore "already exists").
if [[ $DRY_RUN -eq 0 ]]; then
  while IFS='|' read -r name color; do
    gh label create "$name" --color "$color" 2>/dev/null || true
  done <<'LABELS'
critical|B60205
high|D93F0B
medium|FBCA04
low|0E8A16
security|D73A4A
compliance|5319E7
bug|D73A4A
ai-safety|8B5CF6
webhooks|1D76DB
recovery-engine|0052CC
data-integrity|C5DEF5
privacy|5319E7
dashboard|BFD4F2
demo-integrity|BFD4F2
customer-impact|E99695
reliability|C2E0C6
performance|C2E0C6
scalability|C2E0C6
testing|BFDADC
quality|BFDADC
api|D4C5F9
docs|0075CA
ci|EDEDED
LABELS
fi

for f in RA-*.md; do
  title=$(grep -m1 '^# ' "$f" | sed 's/^# //')
  labels=$(grep -m1 '^<!-- labels:' "$f" | sed 's/^<!-- labels: *//; s/ *-->$//')
  body=$(grep -v '^<!-- labels:' "$f")

  if [[ $DRY_RUN -eq 1 ]]; then
    printf '%-14s %s\n%-14s %s\n\n' "TITLE" "$title" "LABELS" "$labels"
  else
    echo "Creating: $title"
    gh issue create --title "$title" --label "$labels" --body "$body"
    sleep 1   # stay under the abuse-detection threshold
  fi
done

echo "Done."
