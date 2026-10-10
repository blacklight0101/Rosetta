# ADR-011: Adopt a strict TypeScript toolchain with automated quality gates

**Date**: 2026-10-09
**Status**: Accepted
**Deciders**: BlackLigth (blacklight0101)

## Context

The owner asked for current best practices for the stack and for linting, built into the builder agents and the
verifier (DEC-40). Builders are AI agents of different strength (DEC-32); rules that live only in prose are applied
unevenly, rules enforced by tools are not. The stack is TypeScript on Node.js 24 LTS (ADR-002) with Clean
Architecture (ADR-009) and TDD (ADR-010). Facts checked on 2026-10-09: TypeScript 7.0 (native compiler) is GA, but
typescript-eslint 8.71 supports TypeScript `>=4.8.4 <6.1.0` only, because TypeScript 7 has no stable programmatic API
until 7.1; ESLint 10 reads flat configuration only; depcheck and ts-prune are archived and knip replaces them.

## Options Considered

1. **ESLint 10 + typescript-eslint (strict, type-checked) + Prettier**, TypeScript 6.0 with the strictest compiler
   flags, dependency-cruiser for the Clean Architecture rule, knip for dead code, Vitest with coverage thresholds,
   commitlint and git hooks, and the same checks in GitHub Actions.
2. **Biome** for lint and format, with a small ESLint config for type-aware rules.
3. TypeScript 7 now, with linting that is not type-aware.
4. Do nothing: compiler only, rules in prose.

## Decision

We choose option 1. One command, `npm run verify`, runs every gate in this order and must pass locally and in CI:
`typecheck` (tsc, no emit), `lint` (ESLint, zero warnings), `format:check` (Prettier), `arch` (dependency-cruiser),
`deadcode` (knip), `test` (Vitest with coverage thresholds). The exact packages, versions and settings are in
[environments-and-delivery.md](../environments-and-delivery.md) section 7 and the rules in
[conventions.md](../conventions.md); a new runtime dependency still needs an ADR.

## Rationale

- Type-aware rules (`no-floating-promises`, `no-misused-promises`, `switch-exhaustiveness-check`,
  `no-unsafe-*`) catch the defects most likely in an async agent loop that parses model output; they need
  typescript-eslint, hence TypeScript 6.0 until 7.1 ships an API (deferred decision in the ADR index).
- dependency-cruiser turns the Clean Architecture rule and "no cycles" into a failing check (RNF-013).
- knip keeps agent-built code free of unused files, exports and dependencies.
- Identical local and CI gates give builders, the verifier and the owner one definition of green.
- Option 2 is faster but still needs ESLint for type-aware rules, so it adds a tool instead of removing one;
  option 3 loses type-aware linting; option 4 contradicts DEC-40.

## Consequences

**Positive**
- Most hard rules of CLAUDE.md are enforced by tools, so the verifier spends its effort on design and requirements.
- Consistent formatting removes style noise from pull request reviews.

**Negative**
- Typed linting is slower than untyped linting; acceptable at this project's size.
- The strict flags (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`) make some code more verbose.
- TypeScript stays on 6.0 until typescript-eslint supports 7.x; the move is a separate change with its own ADR.

## References

- DEC-27, DEC-28, DEC-30, DEC-32, DEC-36, DEC-39, DEC-40.
- RNF-005, RNF-013.
- Refines ADR-002, ADR-008, ADR-009, ADR-010.
- typescript-eslint shared configs: https://typescript-eslint.io/users/configs
