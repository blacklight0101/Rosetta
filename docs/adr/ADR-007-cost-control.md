# ADR-007: Meter and cap every model call through a budget guard

**Date**: 2026-10-09
**Status**: Accepted
**Deciders**: BlackLigth (blacklight0101)

## Context

Agent loops resend growing context on every turn, so paid runs can cost far more than expected. The owner has 10 EUR
of OpenAI credit and will open a capped Anthropic account; cost control inside the app is a requirement, and runs on
different providers must be comparable (DEC-13).

## Options Considered

1. A budget guard wrapping the provider port: every call is priced from an editable price table, recorded by run,
   role, agent task, provider and model, checked against run and role caps before it is made, shown on a live meter
   and written to a cost report; an estimator forecasts cost from the code map before a run.
2. Rely on the providers' dashboards and spending limits.
3. Log token counts only.
4. Do nothing.

## Decision

We choose option 1. No model call bypasses the budget guard (CLAUDE.md hard rule). Before each call it checks the
worst case (prompt tokens plus maximum output) against the remaining cap; if it would exceed the cap, the call is not
made and the run stops cleanly with exit code 3 (RF-422). Prices are per million input, output and cached input
tokens; Ollama models are priced at zero but still counted (RF-420, RF-421). Unpriced paid models stop the run unless
explicitly allowed (RF-427). `estimate` gives a low, likely and high forecast per role (RF-425).

## Rationale

- Checking the worst case before the call is the only way a cap is never exceeded rather than noticed afterwards.
- Per-role metering supports the model-per-role strategy and the provider comparison (ADR-003, RF-900 range).
- Counting local tokens lets runs on Ollama and on paid APIs be compared like for like.
- Option 2 reacts after money is spent and only per account; option 3 shows no money; option 4 contradicts DEC-13.

## Consequences

**Positive**
- A run can never spend more than its cap; the developer always sees cost before, during and after.
- Cost data becomes evidence for the master's final report.

**Negative**
- Prices change; the default table must carry a date and be easy to override.
- Worst-case checks stop runs slightly early; caps must be set with some margin.
- Estimates depend on assumptions (turns per area, output size) that need calibration over real runs (RNF-012).

## References

- DEC-09, DEC-13.
- RF-004, RF-006, RF-304, RF-420..RF-427; RNF-012.
- ADR-003.
