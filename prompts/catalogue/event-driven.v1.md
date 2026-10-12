---
id: event-driven
group: architecture-styles
title: Event-driven
default: false
---

## Rule

Let components react to published events instead of calling each other directly.

## Why it matters

Producers and consumers are decoupled in time and in code, so new reactions can be added without changing the
producer and load peaks can be absorbed.

## How to check

Each event has a versioned schema and a named owner; consumers are idempotent; a test replays events and
checks the resulting state.

## Choose it when

- Several parts of the business must react to the same facts.
- Work can happen asynchronously and eventual consistency is acceptable.
- Integration with other systems is already message based.

## Look elsewhere when

- Users need an immediate, strongly consistent answer for most operations.
- The team has no experience operating a message broker and tracing flows.
