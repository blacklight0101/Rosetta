# ADR-009: Structure Rosetta with Clean Architecture

**Date**: 2026-10-09
**Status**: Accepted
**Deciders**: BlackLigth (blacklight0101)

## Context

The owner requires Clean Architecture for this project (DEC-36). ADR-002 and ADR-003 already separate a core from
provider and file-system adapters, but leave the layers informal. Most code is written by AI agents working in
parallel (DEC-22, DEC-32), so the dependency rule must be explicit and checked by a machine, not by memory. The
project is also a master's exercise in software architecture, where Clean Architecture is taught.

## Options Considered

1. Clean Architecture with four layers: `domain` (entities, value objects, domain rules such as claim status
   transitions and citation parsing), `application` (use cases `scan`, `understand`, `verify`, `answer`, `report`,
   `plan`, `estimate`, `export`, plus the ports they need), `infrastructure` (adapters: LLM providers, egress and
   budget guards, file system, language packs, writers, zip), `presentation` (the CLI and its composition root).
   Dependencies point inward only; an automated rule check runs in `npm run verify`.
2. Informal ports and adapters with one `core` folder (the shape in the first draft).
3. A feature-folder layout with no layer rule.
4. Do nothing: let the structure emerge.

## Decision

We choose option 1. `domain` imports nothing outside itself; `application` imports only `domain`; `infrastructure`
imports `application` and `domain` to implement ports; `presentation` wires everything in a single composition root.
Provider SDKs, tree-sitter, the file system and zip libraries appear only in `infrastructure`. A dependency rule
check fails the build on any violation (RNF-013).

## Rationale

- Use cases and domain rules (claim statuses, citations, budgets) are testable without providers or disks, which
  ADR-008 relies on.
- Swappable providers (ADR-003) and language packs (ADR-004) are natural infrastructure adapters behind
  application ports.
- A checked rule keeps parallel agent builders from coupling layers unnoticed.
- Option 2 works but leaves "core" ambiguous; options 3 and 4 contradict DEC-36.

## Consequences

**Positive**
- Clear placement rule for every file; reviewers and the verifier can check it mechanically.
- Persistence, if ever needed, would be another infrastructure adapter (PostgreSQL, DEC-37) without touching use cases.

**Negative**
- More files and mapping between layers than a small CLI strictly needs.
- The dependency rule tool is one more development dependency (package baseline in
  `docs/environments-and-delivery.md`).

## References

- DEC-22, DEC-32, DEC-36, DEC-37.
- RNF-005, RNF-013.
- Refines ADR-002 and ADR-003 (layering); ADR-004, ADR-006, ADR-007, ADR-008.
