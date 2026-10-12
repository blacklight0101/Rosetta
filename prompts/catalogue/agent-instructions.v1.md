---
id: agent-instructions
group: ai-assisted-build
title: Agent instructions file
default: false
---

## Rule

Keep one instructions file in the repository that tells coding agents the rules, stack, layout and commands of the project.

## Why it matters

Agents follow the same conventions as the team only when those conventions are written down where the agent
reads them at every session.

## How to check

An AGENTS.md (or equivalent) exists at the root, lists the chosen principles and stack as rules, and is
updated in the same pull request as any rule change.
