# ADR-008: Test with recorded model responses and score quality against a golden set

**Date**: 2026-10-09
**Status**: Accepted
**Deciders**: BlackLigth (blacklight0101)

## Context

Most of Rosetta's behaviour depends on model output, which is slow, costs money and changes between calls. Builders
are AI agents that must prove each card works before it merges (DEC-22). The test suite must run without network or
API keys (RNF-005), and quality must be measured, not asserted (DEC-20, RNF-006).

## Options Considered

1. Vitest, test-first for core logic; a fake provider that replays recorded responses at the `LlmProvider` port; a
   contract suite every adapter passes; a separate, opt-in evaluation that runs real models against a hand-checked
   golden set of findings for the demo app.
2. Tests that call real models every time.
3. Unit tests for deterministic code only, with manual checks for anything model-driven.
4. Do nothing: manual testing.

## Decision

We choose option 1. Automated tests never call a real model (CLAUDE.md hard rule). Recordings are created by an
explicit record mode, stored under `tests/recordings/`, scrubbed of keys and reviewed like code. `npm run verify`
runs lint, type-check and the offline suite; `npm run eval` runs the golden-set evaluation only when asked and
reports precision, recall and cost per provider and model. Test levels and their split are defined in
`docs/conventions.md`.

## Rationale

- Replaying at the port tests the real loop, parsing, guards and writers repeatably and for free.
- A contract suite keeps adapters interchangeable (ADR-003).
- A golden set turns "it seems right" into numbers for RFC-001 section 7 and the master's report.
- Option 2 is slow, costly and flaky; option 3 leaves the riskiest code untested; option 4 cannot support agent
  builders.

## Consequences

**Positive**
- Fast, free, deterministic CI; agent builders get a clear done criterion.
- Quality changes from prompt edits become measurable.

**Negative**
- Recordings go stale when prompts change and must be re-recorded deliberately.
- The golden set takes hand work and is small; its scores describe the demo app, not every codebase.
- Live-provider behaviour (rate limits, odd outputs) is only covered by the opt-in evaluation and manual runs.

## References

- DEC-20, DEC-22.
- RNF-005, RNF-006; RF-400.
- ADR-003, ADR-005.
