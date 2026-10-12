---
id: modular-monolith
group: architecture-styles
title: Modular monolith
default: false
---

## Rule

Deploy one application made of modules with clear boundaries, each owning its data and talking to others only through its public interface.

## Why it matters

It keeps the simplicity of one deployment while giving the separation that lets the system be split later if
the need is proven.

## How to check

Each module has a public interface and private internals; an architecture test fails when a module reaches
into another module's internals or tables.

## Choose it when

- The domain has several distinct business areas but one team or a few teams.
- Independent scaling is not yet needed.
- A later split into services should stay possible.

## Look elsewhere when

- Teams must release their parts independently on different schedules.
- Parts of the system have very different load or availability needs.
