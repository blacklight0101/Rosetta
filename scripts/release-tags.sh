#!/usr/bin/env bash
# DEC-29, DEC-104, RF-1300, P1-55: the image tags of a release, for the image job of
# .github/workflows/release.yml (tests/integration/tooling/release-tags.test.ts runs it).
# Always sha-<short>; for a tag also X.Y.Z, but only when the tag is exactly v<version of
# package.json> and its commit is on origin/main. Any other tag stops the release, and nothing is
# written to GITHUB_OUTPUT.
# Environment: IMAGE, REF_TYPE (branch or tag), REF_NAME, GITHUB_SHA, GITHUB_OUTPUT.
set -euo pipefail

refuse() {
  echo "::error::$1"
  exit 1
}

short="${GITHUB_SHA::7}"
tags="$IMAGE:sha-$short"
if [ "$REF_TYPE" = tag ]; then
  version="${REF_NAME#v}"
  package="$(node -p "require('./package.json').version")"
  [ "v$version" = "$REF_NAME" ] || refuse "The tag $REF_NAME does not start with v."
  printf '%s' "$version" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' ||
    refuse "The tag $REF_NAME is not vX.Y.Z."
  [ "$version" = "$package" ] || refuse "The tag $REF_NAME is not v$package, the version of package.json."
  git merge-base --is-ancestor "$GITHUB_SHA" origin/main || refuse "The tag $REF_NAME is not on main."
  tags="$tags $IMAGE:$version"
fi
echo "Image tags: $tags"
{
  echo "sha-tag=sha-$short"
  echo "tags=$tags"
} >> "$GITHUB_OUTPUT"
