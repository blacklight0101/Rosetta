# ADR-004: Map any stack with a universal scan plus optional language packs

**Date**: 2026-10-09
**Status**: Accepted
**Deciders**: BlackLigth (blacklight0101)

## Context

Rosetta must handle legacy code in any stack, from C# WebForms to PHP, Java, VB6 or COBOL (DEC-11). Agents read code
as text, so they already work in any language, but the deterministic code map that plans areas, estimates cost and
checks citations must also work everywhere (RF-100..RF-112, RF-300). Full parsers per language are expensive to build;
the milestone is seventeen days away.

## Options Considered

1. Two layers: a universal layer for every file (walk, language by extension and content, size and tokens, artefact
   kinds, entry points, configuration, SQL strings, manifests, folder-based areas) plus optional language packs that
   add symbols, references and routes, mostly built on tree-sitter grammars.
2. Language-specific analysers only (for example Roslyn for C#), with no support for other stacks.
3. No code map: let the agents discover everything by listing and reading files.
4. Do nothing: support C# only, as first proposed.

## Decision

We choose option 1. The universal layer always runs and is enough for the whole pipeline. A language pack registers
file extensions and returns symbols with line ranges, references and routes; its files get map level `symbols`,
others `coarse`. A failing pack falls back to `coarse` for that file. Release 1 ships the universal layer and a C# pack
(including the WebForms page to code-behind link and Entity Framework entity sets).

## Rationale

- Every stack is supported from day one; packs only improve precision, so no user is excluded (RF-112).
- tree-sitter grammars exist for most languages and run the same way in every pack, so adding a language is a
  bounded card.
- Areas and token counts from the universal layer drive both agent planning (RF-200) and the estimate (RF-425).
- Option 2 lost on the any-stack decision; option 3 makes cost unpredictable and coverage unmeasurable; option 4
  contradicts DEC-11.

## Consequences

**Positive**
- A clean extension point that keeps stack-specific code out of the core (CLAUDE.md hard rule).
- Deterministic output usable for repeatable tests and comparisons (RF-106).

**Negative**
- Coarse maps give agents less guidance, so runs on unsupported stacks read more files and cost more.
- Artefact and entry-point rules for many stacks must be written and tested; they will never be complete.
- Native tree-sitter bindings on Windows need checking early (ADR-002).

## References

- DEC-11, DEC-12.
- RF-100..RF-112, RF-300, RF-425.
- ADR-002, ADR-005.
