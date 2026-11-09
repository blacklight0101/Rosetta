#!/usr/bin/env bash
# RF-1304, DEC-207: one comment on the open issue "Production deploys" (created when there is none)
# that mentions the owner, so GitHub emails them. The deploy job of .github/workflows/release.yml
# runs it after a live deploy, and release-checks.yml after the checks of a release merge failed
# (P8-65); tests/integration/tooling/release-notify.test.ts and release-checks-notify.test.ts run
# it. Only an open issue titled exactly "Production deploys" counts.
# Environment: GH_TOKEN (the workflow token, issues: write), GH_REPO, OWNER, MESSAGE (the text after
# the mention).
set -euo pipefail

issue="$(gh issue list --state open --search 'Production deploys in:title' --json number,title --jq '.[] | "\(.number)\t\(.title)"' | awk -F '\t' '$2 == "Production deploys" { print $1; exit }')"
if [ -z "$issue" ]; then
  url="$(gh issue create --title 'Production deploys' --body 'The release workflows add a comment here after each production deploy and when the checks of a release merge fail (RF-1304).')"
  issue="${url##*/}"
fi
gh issue comment "$issue" --body "@$OWNER $MESSAGE"
