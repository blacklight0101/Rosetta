---
id: hexagonal
group: architecture-styles
title: Hexagonal (ports and adapters)
default: false
---

## Rule

Keep the business core free of technology and connect databases, user interfaces and external systems through ports with adapters.

## Why it matters

The core can be tested without infrastructure, and a database, provider or user interface can be replaced by
writing a new adapter.

## How to check

The core imports no framework, driver or SDK; every external system is reached through a port interface; each
adapter has a contract test the fake also passes.

## Choose it when

- The system integrates with several external systems that may change.
- Business rules must be tested quickly without infrastructure.
- The team accepts some extra structure for that isolation.

## Look elsewhere when

- The application is a thin layer over a database with few rules.
- The team has no time to learn the style and the deadline is close.
