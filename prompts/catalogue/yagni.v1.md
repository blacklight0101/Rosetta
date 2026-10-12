---
id: yagni
group: design-principles
title: YAGNI
default: true
---

## Rule

Build only what a current requirement asks for; postpone features and hooks for imagined futures.

## Why it matters

Speculative features cost time now, carry bugs and constrain later designs that usually look different from
the guess.

## How to check

Every new module, option or extension point names the requirement id it serves; code with no caller and no
requirement is removed by the dead-code check.
