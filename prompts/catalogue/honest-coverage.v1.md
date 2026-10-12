---
id: honest-coverage
group: quality-gates
title: Honest coverage by layer
default: true
---

## Rule

Set coverage targets per layer, highest for the business core, and never reach them with tests that assert nothing.

## Why it matters

A single global percentage hides untested business rules behind well-covered glue; tests without assertions
inflate the number and protect nothing.

## How to check

CI enforces separate thresholds for domain, use cases and the whole project; a mutation or a reviewer's spot
check shows that the tests fail when the rule is broken.
