---
id: testing-pyramid
group: quality-gates
title: Testing pyramid
default: true
---

## Rule

Have many fast unit tests, fewer integration tests and a small number of end-to-end tests.

## Why it matters

Fast tests give quick feedback and point at the broken unit; a few slow tests prove that the pieces work
together without making the suite slow and brittle.

## How to check

The test report shows the count per level close to the agreed split; a new end-to-end test is accepted only
when no lower level can prove the behaviour.
