---
id: strangler-fig
group: modernisation
title: Strangler Fig
default: false
---

## Rule

Replace the legacy system piece by piece behind a routing layer until nothing is left of it.

## Why it matters

Value is delivered early and each step is small and reversible, instead of a big-bang switch that bets
everything on one cut-over day.

## How to check

The roadmap names the order of the slices and the routing point; each slice has a switch-over and a fallback;
the legacy share of traffic falls with every release.
