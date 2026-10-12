---
id: kiss
group: design-principles
title: KISS
default: true
---

## Rule

Choose the simplest design that meets the stated requirements and nothing beyond them.

## Why it matters

Simple code is cheaper to read, test and change; every extra layer, option or generic mechanism is code that
must be understood by the next person and can fail.

## How to check

Functions and files stay within the size and complexity limits of the conventions; a reviewer can explain each
abstraction by a requirement that needs it today.
