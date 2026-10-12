---
id: approval-tests
group: modernisation
title: Approval tests
default: false
---

## Rule

Before changing legacy code, record its current outputs for a set of inputs and fail when they change unexpectedly.

## Why it matters

Legacy code rarely has tests or a specification; recording what it does today is the fastest way to protect
behaviour while it is reshaped.

## How to check

Each legacy area to be changed has recorded outputs under version control; every difference is reviewed and
approved or treated as a regression.
