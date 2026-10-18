---
id: parallel-safe-ids
group: ai-assisted-build
title: Parallel-safe identifiers
default: false
---

## Rule

Allocate shared identifiers such as error codes, migration numbers, configuration keys and ports to each task card from ranges or one registry, never at build time.

## Why it matters

Two agents that pick the next free identifier at the same time pick the same one, and the clash shows up only at merge.

## How to check

No identifier is allocated twice, each card lists the files it expects to change, and cards whose files or identifiers overlap are ordered by a dependency instead of running together.
