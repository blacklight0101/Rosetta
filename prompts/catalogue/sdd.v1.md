---
id: sdd
group: method
title: Specification-driven development (SDD)
default: true
---

## Rule

Write or update the requirement, with its id, before writing the code that implements it.

## Why it matters

The specification becomes the contract the code and the tests answer to, so behaviour is decided by people on
purpose rather than discovered after the fact.

## How to check

Every task card and pull request names the requirement ids it implements; behaviour without an id stops the
card and becomes a new requirement or an open question first.
