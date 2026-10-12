---
id: layered
group: architecture-styles
title: Layered (N-tier)
default: false
---

## Rule

Split the system into presentation, business and data layers where each layer calls only the one below it.

## Why it matters

Most developers know the style, and most legacy business systems already have this shape, so the move is small
and the team is productive at once.

## How to check

Dependency rules forbid calls that skip a layer or point upward; the business layer holds the rules and the
presentation layer holds none.

## Choose it when

- The application is mostly forms over a database with moderate business rules.
- The team is small and already knows the style.
- The legacy system is layered and a low-risk migration matters most.

## Look elsewhere when

- Business rules are rich and must be tested without the database.
- Parts of the system need to scale or be released on their own.
