# Architecture Decision Records

**Rule**: if a decision affects several developers or agents, or is hard to revert, write an ADR before implementing
it. Copy [`_template.md`](_template.md), number it with the next free id (three digits, never reused), keep it to
300-500 words, always include the "do nothing" option, and justify with evidence. **ADRs are never deleted**: a
replaced decision is marked `Superseded by ADR-nnn` and stays in place; a partly changed decision is marked `Amended`
with a dated note. Reference the ADR from commits (`Refs: ADR-004`) and, once code exists, from a one-line comment at
the place that implements it.

Status values: `Proposed` (written, not yet accepted), `Accepted`, `Superseded by ADR-nnn`, `Amended` (accepted and
changed in part by a later decision; see the ADR's Notes).

| Id | Title | Status | Date |
|---|---|---|---|
| [ADR-001](ADR-001-record-architecture-decisions.md) | Record architecture decisions | Accepted | 2026-10-09 |
| [ADR-002](ADR-002-typescript-node-cli.md) | Build Rosetta as a TypeScript command-line tool on Node.js (amended by ADR-012: local web server) | Amended | 2026-10-09 |
| [ADR-003](ADR-003-provider-swappable-agent-loop.md) | Own the agent loop behind a swappable LLM provider port | Accepted | 2026-10-09 |
| [ADR-004](ADR-004-universal-scan-and-language-packs.md) | Map any stack with a universal scan plus optional language packs | Accepted | 2026-10-09 |
| [ADR-005](ADR-005-evidence-cards-and-two-step-verifier.md) | Make every finding an evidence-cited card checked by a two-step verifier | Accepted | 2026-10-09 |
| [ADR-006](ADR-006-read-only-tools-and-data-egress.md) | Keep agents read-only and guard everything that leaves the machine | Accepted | 2026-10-09 |
| [ADR-007](ADR-007-cost-control.md) | Meter and cap every model call through a budget guard | Accepted | 2026-10-09 |
| [ADR-008](ADR-008-testing-with-recorded-responses.md) | Test with recorded model responses and score quality against a golden set | Accepted | 2026-10-09 |
| [ADR-009](ADR-009-clean-architecture.md) | Structure Rosetta with Clean Architecture | Accepted | 2026-10-09 |
| [ADR-010](ADR-010-spec-driven-and-test-driven-development.md) | Develop Rosetta spec-driven and test-driven | Accepted | 2026-10-09 |
| [ADR-011](ADR-011-toolchain-and-quality-gates.md) | Adopt a strict TypeScript toolchain with automated quality gates | Accepted | 2026-10-10 |
| [ADR-012](ADR-012-local-web-ui-and-github-sources.md) | Serve a live local web UI and read legacy code only from public GitHub snapshots | Accepted | 2026-10-10 |

**Totals**: 12 in total - Accepted 11, Proposed 0, Amended 1, Superseded 0.


## Relationships

ADR-005, ADR-006 and ADR-007 all constrain the agent loop of ADR-003: every call passes the egress guard
(ADR-006) and the budget guard (ADR-007), and every result is a card checked by the verifier (ADR-005). ADR-008 tests
ADR-003 at its port. ADR-009 refines the layering of ADR-002 and ADR-003 (does not supersede them). ADR-010 refines ADR-008: test-first applies to every card. ADR-011 refines ADR-002, ADR-008, ADR-009 and ADR-010 with the tools that enforce them. ADR-012 amends ADR-002 (a
loopback web server is added) and refines ADR-005 (GitHub permalinks) and ADR-006 (read-only snapshot). The product owner's decisions behind these ADRs are listed in ../decision-log.md.

## Deferred decisions (write the ADR when the trigger fires)

| Candidate | Trigger |
|---|---|
| Target-stack proposal in `plan` | Q-06 answered, before the first P3 card |
| Front-end library for the web UI and report (Q-14) | Q-14 answered, before the first web UI card |
| Claude Code plugin packaging | start of P4 (R2) |
| A hosted public version of Rosetta | the owner decides to offer Rosetta as a service (would need hosting, key management and PostgreSQL, DEC-37) |
| npm publishing and package name | Q-07 and Q-08 answered |
| Move to TypeScript 7 | typescript-eslint supports TypeScript 7.x (expected with TypeScript 7.1) |
| Persistence in PostgreSQL (DEC-37) | the first requirement that files in the output folder cannot meet |
