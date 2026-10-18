---
id: guard-tests
group: ai-assisted-build
title: A failing test for every guard
default: false
---

## Rule

Give every branch, check or guard a change adds a test that fails when that guard is removed.

## Why it matters

Code can behave correctly by accident, so a guard nobody pinned is removed unnoticed in the next refactor; a test that stays green without the guard proves nothing.

## How to check

The reviewer removes each new guard in a throwaway copy and confirms a test fails (a mutation check); a test that stays green is rewritten.
