---
id: behaviour-to-preserve
group: ai-assisted-build
title: Behaviour to preserve
default: false
---

## Rule

Name the legacy behaviour a change must keep, with its citation, and pin it with an approval test before the change.

## Why it matters

A rewrite regresses what works today when nobody wrote down what has to stay the same; an open question must never default to a change that users would see.

## How to check

Each task card lists the behaviours it keeps with their citations into the legacy code, an approval test exists for each before the change, and no default changes what users see today.
