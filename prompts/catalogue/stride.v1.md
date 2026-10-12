---
id: stride
group: security
title: STRIDE threat modelling
default: false
---

## Rule

Walk each data flow and trust boundary through spoofing, tampering, repudiation, information disclosure, denial of service and elevation of privilege.

## Why it matters

A fixed list of threat kinds makes threat modelling repeatable and stops a review from missing whole classes
of attack.

## How to check

A threat model with a data-flow diagram exists and is updated when a boundary changes; each identified threat
has a mitigation or an accepted risk with an owner.
