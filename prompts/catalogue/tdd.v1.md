---
id: tdd
group: method
title: Test-driven development (red, green, refactor)
default: true
---

## Rule

Write a failing test for the next behaviour, make it pass with the simplest code, then clean up with the tests green.

## Why it matters

Tests written first prove that each test can fail, keep the design driven by use rather than by internals, and
leave a safety net for every refactoring.

## How to check

The history shows a test commit with failing tests before the commit that makes them pass; each
Given/When/Then scenario maps to a named test.
