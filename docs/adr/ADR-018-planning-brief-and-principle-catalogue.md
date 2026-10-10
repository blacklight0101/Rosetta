# ADR-018: Drive `plan` from a planning brief and a versioned principle catalogue

**Date**: 2026-10-11
**Status**: Accepted
**Deciders**: BlackLigth (blacklight0101)

## Context

`plan` turns verified cards into a hand-off package (RF-600..RF-603). Until now the only input was a target-stack
text, and Q-06 asked whether Rosetta should propose it. A package written from one line of text leaves the
architecture, the principles, the migration path and the working method to the model's guesses, which breaks the
product's rule that nothing is invented. The owner wants the package to follow choices made in an interview, the way
this repository was planned, and to carry the engineering practice taught in the master (DEC-72..DEC-85).

## Options Considered

1. A free-text target field on the hand-off form, as in Q-06's default.
2. A planning brief: a structured interview with defaults (principles, architecture style, migration strategy,
   stack per layer, project context, build method) that feeds `plan`, with the principles drawn from a versioned
   catalogue of files.
3. Do nothing: let the planner model choose everything.

## Decision

We choose option 2. Plan setup saves a planning brief per project (`planning-brief.json`, data-model.md section
3.20); `plan` reads the brief, the verified cards and the catalogue in `prompts/catalogue/`, and records the brief and
the catalogue version in the run manifest. Rosetta recommends two architecture styles from the evidence and the user
chooses; every choice becomes an ADR in the package, and every chosen principle becomes conventions rules and
task-card checks.

## Rationale

- Choices made by the user with defaults and reasons are decisions; choices made by a model are guesses (RFC-001
  principles, DEC-80).
- A principle written as rules and checks can be verified by a reviewer; a list of principle names cannot (DEC-75).
- Catalogue entries as versioned files follow RNF-004 and let the catalogue change without code changes (DEC-84).
- Recommending from the code map and cards keeps the recommendation tied to evidence (ADR-005).
- Option 1 lost: one text field cannot express principles, migration or method. Option 3 lost: it makes the package
  irreproducible and unexplainable.

## Consequences

**Positive**
- Packages are reproducible: same cards, brief and catalogue version, same instructions to the planner.
- The package explains itself: every architectural choice is an ADR with the evidence behind it.

**Negative**
- A new page (Plan setup), a brief schema, catalogue files and their tests must be built and kept current.
- The catalogue's content has to be written and reviewed; it must stay in Rosetta's own words.

## References

- RF-604..RF-613; RNF-004; Q-06 (answered by DEC-77, DEC-78).
- DEC-72..DEC-85.
- Extends ADR-005 (the package uses only `Supported` claims); calls go through ADR-007's budget guard.
