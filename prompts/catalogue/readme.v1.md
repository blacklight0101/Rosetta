---
catalogueVersion: 2
---

# Principle catalogue

The principles, practices and architecture styles that `plan` can build into a modernisation hand-off package
(RF-606, RF-608, ADR-018). The Plan setup page lets the user switch entries on or off; `plan` turns every chosen
entry into rules in the package's conventions and checks on its task cards (RF-607).

## Credit

The curriculum of this catalogue, that is which groups and topics it covers, follows the
Master en Desarrollo con IA of BIG School, taken by Rosetta's product owner (DEC-73, DEC-85). Every entry is
written in Rosetta's own words; no course material is copied.

## Groups

| Group | Entries |
|---|---|
| `design-principles` | SOLID, DRY, KISS, YAGNI, design patterns and when not to use them, antipatterns to avoid |
| `method` | SDD, TDD with red-green-refactor, requirements with Given/When/Then and MoSCoW |
| `architecture-styles` | layered (N-tier), modular monolith, hexagonal, Clean, event-driven, microservices |
| `modernisation` | Strangler Fig, Parallel Change, Mikado, approval tests |
| `quality-gates` | testing pyramid, honest coverage by layer, pre-commit and CI gates |
| `documentation` | ADRs, documentation as code, API contracts |
| `security` | security by design and by default, STRIDE, OWASP Top 10, secure development life cycle |
| `delivery` | CI/CD built once, DORA metrics, containers, observability |
| `ai-assisted-build` | agent instructions file, plan before build, human review, and the lessons of DEC-135: shared review probes, behaviour to preserve, a failing test for every guard, parallel-safe identifiers, risk class per task card, rules for agent operations, measure one change at a time |

A new planning brief switches on SOLID, KISS, DRY, YAGNI, TDD, SDD, ADRs, the testing pyramid with honest
coverage, security by design and the CI quality gates; every other entry starts off (DEC-74). Each file states its
own default in its front matter.

## File format

One file per entry, named `<id>.v<n>.md` (DEC-84). The front matter holds `id` (the file name's stem), `group`,
`title` and `default` (`true` when a new brief switches it on). The body has exactly the sections `## Rule` (one
line), `## Why it matters` and `## How to check`; an architecture style adds the bullet lists `## Choose it when`
and `## Look elsewhere when` (two to eight items each). The loader in
`src/infrastructure/prompts/catalogue-files.ts` refuses any file that breaks this format.

## Versioning

`catalogueVersion` above is the version of the whole catalogue; raise it in the same change that edits an entry.
A changed entry gets a new file version and the old file is removed, so one id has one file. Every plan run
records the catalogue version and the SHA-256 of its files (RNF-004).

## Version history

| Version | Change |
|---|---|
| 1 | The first catalogue: the nine groups of RF-606. |
| 2 | The `ai-assisted-build` group gains the lessons of DEC-135 (RF-630..RF-638): shared review probes, behaviour to preserve, a failing test for every guard, parallel-safe identifiers, risk class per task card, rules for agent operations and measure one change at a time. All are off in a new brief. |
