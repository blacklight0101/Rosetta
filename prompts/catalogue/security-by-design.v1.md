---
id: security-by-design
group: security
title: Security by design and by default
default: true
---

## Rule

Design every feature with its threats in mind and ship it with the safest settings switched on.

## Why it matters

Security added at the end is expensive and incomplete; secure defaults protect the users who never change a
setting.

## How to check

Each feature lists its threats and mitigations (STRIDE as the method, the OWASP Top 10 as the checklist);
defaults deny access until granted; secrets never appear in code or logs.
