#!/usr/bin/env bash
# RF-1304, DEC-207, DEC-227, P8-141: the hourly sweep of .github/workflows/release-checks.yml. The
# release checks start when CI completes on a push to main, so a CI run that never completes, an
# event GitHub dropped or a lost runner would leave a merge with no commit status release/ready. The
# sweep walks the first parents of main (the merges; not the develop commits they bring) back 24
# hours and, for a merge with no release/ready, records release/ready failure and comments on the
# issue "Production deploys" (scripts/production-deploys-comment.sh): when zap-baseline had not
# finished 40 minutes after the merge, or had finished but nothing was recorded 2 hours after it (the
# checks run for up to 30 minutes once CI completes). A later run of the checks replaces the status.
# It reads every page of a commit's statuses, and a comment that fails does not stop the walk: the
# sweep records and comments on every other merge, then ends failed so the run shows it (P8-143).
# tests/integration/tooling/release-checks-sweep.test.ts runs it against a fake gh.
# Environment: GH_TOKEN (the workflow token: contents and checks read, statuses and issues write),
# GH_REPO, OWNER, RUN_URL.
set -euo pipefail

now="$(date -u +%s)"
comment_failed=0

# Records release/ready failure on a merge with the cause, and tells the owner.
fail() {
  gh api --method POST "repos/$GH_REPO/statuses/$1" -f state=failure -f context=release/ready -f description="$2" -f target_url="$RUN_URL" > /dev/null
  echo "release/ready on $1: failure. $2"
  if ! MESSAGE="the checks of the release merge $1 did not finish; only a commit whose checks passed deploys at 06:00 Madrid (DEC-207). $2 Run: $RUN_URL" bash scripts/production-deploys-comment.sh; then
    echo "::warning::release/ready on $1 is recorded, but the comment to the owner failed."
    comment_failed=1
  fi
}

# Looks at one merge, $1, merged $2 seconds ago.
sweep_merge() {
  [ "$2" -ge $((40 * 60)) ] || return 0
  recorded="$(gh api --paginate "repos/$GH_REPO/commits/$1/statuses?per_page=100" --jq '[.[] | select(.context == "release/ready")] | length' | awk '{ n += $1 } END { print n + 0 }')"
  [ "$recorded" = 0 ] || return 0
  zap="$(gh api "repos/$GH_REPO/commits/$1/check-runs?check_name=zap-baseline" --jq '.check_runs[0].status // "missing"')"
  if [ "$zap" != completed ]; then
    fail "$1" 'Not ready: zap-baseline did not finish on this commit within 40 minutes.'
  elif [ "$2" -ge $((120 * 60)) ]; then
    fail "$1" 'Not ready: the release checks did not run on this commit after zap-baseline finished; re-run zap-baseline to start them.'
  fi
}

sha="$(gh api "repos/$GH_REPO/commits/main" --jq .sha)"
for _ in $(seq 1 30); do
  [ -n "$sha" ] || break
  read -r committed parent <<< "$(gh api "repos/$GH_REPO/commits/$sha" --jq '"\(.commit.committer.date) \(.parents[0].sha // "")"')"
  age=$((now - $(date -u -d "$committed" +%s)))
  [ "$age" -lt $((24 * 3600)) ] || break
  sweep_merge "$sha" "$age"
  sha="$parent"
done
echo "Swept the merges of main of the last 24 hours."
exit "$comment_failed"
