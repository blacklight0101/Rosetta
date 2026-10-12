---
id: dry
group: design-principles
title: DRY
default: true
---

## Rule

Keep each piece of knowledge, such as a rule, a format or a limit, in exactly one place.

## Why it matters

When a business rule is copied, the copies drift and the system answers the same question in two ways. One
owner per rule means one change per requirement.

## How to check

Searching for a rule, a constant or a message finds one definition; duplicated blocks reported by the linter
or the reviewer are either merged or justified as coincidental likeness, not shared knowledge.
