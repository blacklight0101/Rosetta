---
id: api-contracts
group: documentation
title: API contracts
default: false
---

## Rule

Describe every public API in a machine-readable contract and test the implementation against it.

## Why it matters

Consumers can build and test against the contract in parallel, and a breaking change is caught by a tool
rather than by a production incident.

## How to check

Each public API has a versioned contract file; a contract test runs in CI; a breaking change needs a new
version or a parallel change.
