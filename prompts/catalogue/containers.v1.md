---
id: containers
group: delivery
title: Containers
default: false
---

## Rule

Package the application and its runtime as a container image that runs the same way everywhere.

## Why it matters

The same image runs on a laptop, in CI and in production, removing "works on my machine" differences and
simplifying deployment.

## How to check

A Dockerfile is in the repository; the image is built in CI, runs as a non-root user, holds no secrets and is
scanned for known vulnerabilities.
