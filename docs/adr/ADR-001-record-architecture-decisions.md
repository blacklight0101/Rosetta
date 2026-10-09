# ADR-001: Record architecture decisions

**Date**: 2026-10-09
**Status**: Accepted
**Deciders**: BlackLigth (blacklight0101)

## Context
Rosetta is designed before it is built, and much of the building is done by AI agents working from the
documents in `docs/`. Agents and developers who join later need to know not only what the system does but why it is
shaped the way it is, which alternatives were rejected and what each choice costs. Decisions that live only in a
conversation, a chat thread or someone's memory are lost or re-argued. Decisions that are edited in place lose their
history, and a document that quietly changes its mind makes every other document that cited it wrong.

## Options Considered
1. **Architecture decision records**: one short Markdown file per decision in `docs/adr/`, numbered, never deleted,
   with an index.
2. A single design document updated in place.
3. Decisions recorded only in commit messages, pull requests or chat.
4. Do nothing: decide as we go and rely on the code to show the result.

## Decision
We choose option 1. Every decision that affects several developers or agents, or is hard to revert, gets an ADR in
`docs/adr/ADR-nnn-<kebab-title>.md` from [`_template.md`](_template.md) **before** it is implemented, and a row in
the [index](README.md). Product decisions by the owner are recorded as `DEC-nn` in
[`../decision-log.md`](../decision-log.md); an ADR that implements one cites it.

## Rationale
- A numbered file per decision gives every other document a stable id to cite (`ADR-004`), which the traceability
  matrix in the requirements and the task cards rely on.
- Superseding instead of editing keeps the history: a reader sees what was decided, when, and what replaced it.
- The "do nothing" option in every ADR forces the question of whether a decision is needed at all.
- Option 2 hides history and grows until nobody reads it; option 3 is not searchable by the agents that build the
  system; option 4 leaves each builder to re-decide.

## Consequences
**Positive**
- New people and agents can reconstruct why the system looks the way it does without asking.
- Reviews can check code against a named decision (`Refs: ADR-004` in commits and a one-line comment at the place
  that implements it once code exists).

**Negative**
- Writing an ADR takes time before implementation; decisions small enough to revert cheaply do not get one.
- The index and the Totals line must be kept current in the same change as every new or superseded ADR.

## References
- [`_template.md`](_template.md), [`README.md`](README.md) (index and deferred decisions)
- [`../decision-log.md`](../decision-log.md) (DEC-nn), [`../spec/requirements.md`](../spec/requirements.md) (traceability)
- Michael Nygard, "Documenting Architecture Decisions" (2011)
