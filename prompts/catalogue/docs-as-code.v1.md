---
id: docs-as-code
group: documentation
title: Documentation as code
default: false
---

## Rule

Keep documentation in plain text next to the code, reviewed in the same pull requests and checked by the same pipeline.

## Why it matters

Documents that live with the code are updated with it and versioned with it, so they stay true instead of
rotting in a separate wiki.

## How to check

Structural or behaviour changes touch the matching document in the same pull request; diagrams are text (for
example Mermaid); a link check runs in CI.
