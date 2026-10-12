---
id: mikado
group: modernisation
title: Mikado method
default: false
---

## Rule

Try the goal change, note what blocks it, revert, and solve the blockers first, leaf by leaf.

## Why it matters

Large refactorings in tangled code stay safe because the code is always back in a working state and the graph
shows the remaining work.

## How to check

The change keeps a dependency graph of prerequisites; every commit leaves the build green; the goal change
lands last.
