---
id: antipatterns
group: design-principles
title: Antipatterns to avoid
default: false
---

## Rule

Recognise and remove known traps: god classes, anaemic models, shotgun surgery, magic strings and copy-paste reuse.

## Why it matters

Antipatterns are the shapes legacy code tends to take; naming them early stops the new system from growing the
same problems it is meant to leave behind.

## How to check

The review checklist lists the antipatterns; static analysis flags oversized classes, long parameter lists and
duplicated blocks; any exception is recorded with a reason.
