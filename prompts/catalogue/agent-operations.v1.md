---
id: agent-operations
group: ai-assisted-build
title: Rules for agent operations
default: false
---

## Rule

Write down the operational rules agents need: merge one pull request at a time, never skip hooks, reserve ports per agent and keep a register of flaky tests.

## Why it matters

Known traps cost hours in every session when each agent has to meet them again; written rules make them cheap.

## How to check

The agent instructions file has an operations section, merges happen one pull request at a time from a branch that is up to date with main, and each known flaky test has an owner card.
