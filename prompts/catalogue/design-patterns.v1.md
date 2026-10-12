---
id: design-patterns
group: design-principles
title: Design patterns, and when not to use them
default: false
---

## Rule

Use a known pattern when it names a problem the code really has, and skip it when a plain function will do.

## Why it matters

A shared pattern vocabulary (adapter, strategy, factory, observer) makes intent readable at a glance, but a
pattern applied without its problem only adds indirection.

## How to check

Each pattern in a change is named in the pull request with the problem it solves; a reviewer rejects a pattern
that has one implementation and no second one planned by a requirement.
