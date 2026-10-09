# ADR-010: Develop Rosetta spec-driven and test-driven

**Date**: 2026-10-09
**Status**: Accepted
**Deciders**: BlackLigth (blacklight0101)

## Context

The owner requires Spec-Driven Development (SDD) and Test-Driven Development (TDD) as far as possible (DEC-39). Most
code is written by AI agents (DEC-22, DEC-32); without a structured specification and failing tests first, agent
output drifts, pieces do not fit together and nobody can prove a card is done. The documentation set already makes
the specification the first source of truth (CLAUDE.md, requirements with Given/When/Then) and ADR-008 asks for
test-first on core logic, but neither practice is stated as a rule for every card, nor checked.

## Options Considered

1. **Spec-anchored SDD plus strict TDD on every card.** The specification (`RF`/`RNF` with Given/When/Then, ADRs,
   architecture, file formats) is written and accepted before code and kept alive through the whole life cycle: a
   behaviour change edits the specification first, in the same pull request. Each card follows red, green, refactor:
   acceptance tests derived from the card's Given/When/Then scenarios and unit tests are committed failing first,
   then the code that makes them pass, then refactoring with the tests green. The verifier checks both.
2. Spec-first only: write the specification once, then let code evolve on its own.
3. Tests after the code, with a coverage target.
4. Do nothing: keep the current wording ("test-first for core logic").

## Decision

We choose option 1.

- **SDD, spec-anchored level.** No card starts without the requirement ids it implements; a card that needs
  behaviour the specification does not describe stops and asks for a new `RF` (or a `Q-nn`) first. Any change of
  behaviour updates `docs/spec/requirements.md` (and ADRs, architecture or file formats when affected) in the same
  pull request as the code.
- **TDD, red-green-refactor.** Every Given/When/Then scenario of a card's requirements becomes at least one automated
  test named after its id (for example `RF-422 stops the run when the next call would exceed the cap`). The branch
  history shows a commit with failing tests (`test:`) before the commit that makes them pass (`feat:`/`fix:`), then
  any `refactor:` commits. Exceptions are only pure documentation, configuration and scaffolding cards, which say so in
  their card.
- **Checked, not trusted.** The verifier fails a card when a Must scenario has no test, when tests do not precede the
  code in the history, or when stubbing the implementation does not make at least one test fail (mutation check).

## Rationale

- The specification already exists and is traceable (RF to card to test), so anchoring it costs little and keeps
  agents on the rails, the main lesson of the master's SDD module.
- Tests named after requirement ids make traceability mechanical: a missing test for a Must is visible.
- The red-first commit and the mutation check prove the tests can fail, which a coverage figure cannot.
- Rosetta's own output (the hand-off package) is a specification for another team to build from in the same way, so
  the project practises what it produces.
- Option 2 lets the specification rot; option 3 produces tests shaped by the code instead of the requirement;
  option 4 contradicts DEC-39.

## Consequences

**Positive**
- Every merged behaviour has a requirement, a test that names it and evidence that the test can fail.
- Agents get an unambiguous definition of done.

**Negative**
- More commits and more test code per card; cards take longer.
- Model-driven behaviour is tested through recorded responses (ADR-008), which must be recorded before the red
  commit.
- Specification edits in feature pull requests need the owner's attention during review.

## References

- DEC-20, DEC-22, DEC-30, DEC-32, DEC-33, DEC-39.
- RNF-005, RNF-006; requirements section 1.4 (acceptance criteria).
- Refines ADR-008 (test-first now applies to every card, not only core logic).
