---
id: shared-probes
group: ai-assisted-build
title: Shared review probes
default: false
---

## Rule

Write the hostile and edge inputs for a change before building it, and have the builder and the reviewer run the same list.

## Why it matters

A reviewer who tries other spellings, encodings and values one step past a limit finds what the builder never tried; when both run the same probes, the first attempt already meets the review.

## How to check

Each task card that adds a check, a filter, a limit or a parser lists its probes, the builder ran them before asking for review, and the reviewer ran them again.
