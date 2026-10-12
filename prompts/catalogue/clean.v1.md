---
id: clean
group: architecture-styles
title: Clean Architecture
default: false
---

## Rule

Arrange code in rings, entities, use cases, adapters and frameworks, with every dependency pointing inward.

## Why it matters

Use cases become explicit and testable, frameworks stay replaceable details, and the structure tells a reader
what the system does before how it does it.

## How to check

An automated dependency check fails when an inner ring imports an outer one; each use case has its own unit
tests with fakes for its ports.

## Choose it when

- The business rules are the main value and will outlive the frameworks.
- Several user interfaces or delivery channels share the same use cases.
- The team values testability over the fewest files.

## Look elsewhere when

- The system is small or short-lived and the extra structure would outweigh its benefit.
- The team cannot keep the dependency rule enforced in review and CI.
