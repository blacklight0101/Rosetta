---
id: build-once
group: delivery
title: CI/CD built once
default: false
---

## Rule

Build one artefact per commit and promote that same artefact through every environment.

## Why it matters

What was tested is exactly what is released, so environment-specific rebuilds cannot slip in differences.

## How to check

The pipeline builds once and tags the artefact with the commit; later stages deploy by tag; configuration
comes from the environment, not from rebuilding.
