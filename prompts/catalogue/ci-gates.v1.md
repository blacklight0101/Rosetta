---
id: ci-gates
group: quality-gates
title: Pre-commit and CI quality gates
default: true
---

## Rule

Run the same automatic checks, types, lint, format, architecture rules and tests, before every commit and on every pull request.

## Why it matters

Problems are caught minutes after they are made instead of days later, and no change reaches the main branch
without passing the same bar.

## How to check

One command runs every gate locally and CI runs the same command; the main branch is protected so that a red
check blocks the merge; no gate is weakened to pass.
