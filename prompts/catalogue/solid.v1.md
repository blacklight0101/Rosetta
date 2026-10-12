---
id: solid
group: design-principles
title: SOLID
default: true
---

## Rule

Give each module one reason to change and let new behaviour arrive through extension, not edits.

## Why it matters

The five SOLID ideas (single responsibility, open for extension, substitutable subtypes, small interfaces,
dependencies on abstractions) keep a change local: one requirement moves one module, and a new adapter does
not reopen the code that uses it.

## How to check

A reviewer can state the single reason each changed module would change; new behaviour is added as a new
implementation of an existing interface; a fake can replace every port in a test without changing the caller.
