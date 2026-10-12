---
id: parallel-change
group: modernisation
title: Parallel Change (expand and contract)
default: false
---

## Rule

Change an interface in three steps: add the new form, move every caller, then remove the old form.

## Why it matters

Callers never break in the middle of a change, so a contract can evolve while the system keeps running and
releasing.

## How to check

Each breaking change is split into expand, migrate and contract pull requests; the contract step only lands
when no caller uses the old form.
