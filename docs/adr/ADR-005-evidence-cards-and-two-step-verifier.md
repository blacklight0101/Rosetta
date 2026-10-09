# ADR-005: Make every finding an evidence-cited card checked by a two-step verifier

**Date**: 2026-10-09
**Status**: Accepted
**Deciders**: BlackLigth (blacklight0101)

## Context

The value of Rosetta is a specification a person can trust and check quickly (RFC-001 goals 2 and 8). Model output
can state rules that are not in the code. The output must also feed a report, an answers loop and a hand-off package,
so it needs a stable, machine-readable shape (DEC-18, DEC-19).

## Options Considered

1. Typed cards (`FEAT`, `BR`, `ENT`, `INT`, `OQ`) as Markdown files with a metadata header and a JSON index; each card
   holds claims, each claim at least one citation `path:startLine-endLine`; a verifier checks citations in code
   (step 1) and then asks a model whether the cited lines support the claim (step 2).
2. One long prose specification per area, reviewed by a model.
3. Cards without verification, with confidence scores only.
4. Do nothing: free-form agent summaries.

## Decision

We choose option 1. A card without a valid citation per claim is invalid output (RF-202). Step 1 is deterministic and
free (RF-300); step 2 uses the `verifier` role and sees only the claim and the cited lines with a small margin
(RF-301). Claim statuses are `Proposed`, `CitationInvalid`, `Supported`, `Rejected`, `Unverified`; nothing is ever
deleted (RF-302). Only `Supported` claims and answered questions feed `plan` (RF-600).

## Rationale

- Citations turn trust into a check a reader can do in seconds (RF-502) and make hallucinations measurable.
- Step 1 catches invented files and lines at zero cost; step 2 catches misread code; showing only the evidence keeps
  step 2 small and cheap.
- Typed cards give the report, the answers loop and the plan one shared input.
- Option 2 is unverifiable line by line; option 3 trusts the same model that may hallucinate; option 4 cannot be
  checked or rendered reliably.

## Consequences

**Positive**
- Precision and recall can be scored against a golden set (RNF-006).
- The hand-off package traces every requirement to code (RF-602).

**Negative**
- Strict schemas are harder for small local models; a repair retry and a text protocol are needed (RF-202, RF-205).
- Step 2 adds model calls; the verifier role needs its own budget (RF-423).
- A claim supported by the absence of code (for example "there is no authorisation") cannot cite lines; such
  statements must be written as `OQ` cards or cite the place where the check would be.

## References

- DEC-18, DEC-19.
- RF-202..RF-204, RF-230, RF-300..RF-304, RF-500..RF-504, RF-600..RF-603; RNF-006.
- ADR-003, ADR-007.
