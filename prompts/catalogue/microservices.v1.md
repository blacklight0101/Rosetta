---
id: microservices
group: architecture-styles
title: Microservices
default: false
---

## Rule

Split the system into small services that each own one business capability, its data and its deployment.

## Why it matters

Teams can build, release and scale their service independently, which pays off when many teams and very
different loads meet.

## How to check

Each service has its own data store, its own pipeline and a published API contract; no service reads another
service's tables; tracing follows a request across services.

## Choose it when

- Several teams must release independently and often.
- Parts of the system have very different scaling or availability needs.
- The organisation can run the platform, monitoring and on-call that services need.

## Look elsewhere when

- One small team builds the whole system.
- The business boundaries are not yet clear enough to draw service lines.
