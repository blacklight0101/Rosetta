# Roadmap and backlog

Living document. Phases P0..Pn deliver release 1. Later releases are ordered intent, not commitments; each starts by
promoting its reserved requirement range into the requirements with acceptance criteria. This document is the
canonical place for phase scope and exit criteria; the RFC summarises it and the task cards implement it.

## Release 1 phases

<!-- FILL: One row per phase. Scope names what is built (by capability, with the key RF ranges or ADRs). Exit criteria
are checkable facts, not activities: "every Must requirement of the phase verified by its stated criterion", "the
chaos test yields zero duplicates in 100 runs", "gate G-0n open". Counts of ADRs or cards are not repeated here:
link docs/adr/README.md and docs/orchestration/tasks.md. A typical shape: P0 documentation; P1 foundation (scaffold,
data bootstrap, identity, configuration, logging); P2 integrations and background services; P3..Pn-1 the
user-facing modules in dependency order; Pn pilot, data import and cutover (or launch). -->

| Phase | Scope | Exit criteria |
|---|---|---|
| **P0 Documentation** | repository, documentation set, decisions, open questions | RFC and requirements reviewed and set to Accepted (gate G-01); every ADR written for the decisions P1 depends on ([index](adr/README.md)); every open question needed by P1 answered or running on its default; decision log applied (no row with an empty Where applied) |
| **P1 Foundation** | <!-- FILL: scaffold, database bootstrap, identity and roles, configuration, logging, UI shell --> | <!-- FILL: e.g. "the solution builds and tests pass on a clean machine; a user signs in and sees only permitted menu items" --> |
| **Pn <!-- FILL: pilot / launch -->** | <!-- FILL: data import, rehearsal, training, cutover or launch, rollback plan --> | <!-- FILL: e.g. "agreed period in production without manual fixes; runbook signed off" --> |

## Prerequisites

<!-- FILL: Things the build needs from outside the team, with the phase that needs them and the gate or question
that tracks them (access to a test environment, hardware, data exports, accounts, licences, a remote repository).
Remove the section when there are none. -->

- <!-- FILL: prerequisite - needed by Pn - tracked by G-nn / Q-nn -->

## Later releases

| Release | Scope | Entry condition |
|---|---|---|
| <!-- FILL: R2 --> | <!-- FILL: scope and reserved range, e.g. "Module C (RF-300..RF-399)" --> | <!-- FILL: e.g. "R1 in production; Q-nn answered" --> |

## Future backlog (not requirements)

<!-- FILL: Ideas the owner recorded for later that need a decision before they become requirements, one bullet each
with the DEC-nn or date that recorded it. Remove the section when empty. -->

## Backlog by requirement id (R1)

<!-- FILL: Which requirement ids each phase delivers. Every R1 requirement appears exactly once (a requirement split
across phases names the part in brackets). Must agree with the traceability matrix in the requirements and with the
cards' Refs. -->

| Phase | Requirements |
|---|---|
| P1 | <!-- FILL: RF-001..RF-009, RNF-0nn --> |

## Deliberately not built in release 1

<!-- FILL: A single paragraph or list of what release 1 will not contain, each with the release it moves to or the
reason. This is the canonical list; the RFC's non-goals must agree with it. -->

Reasons are in RFC-001 section 2 (non-goals) and the ADRs.
