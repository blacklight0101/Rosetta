# ADR-027: Guide each project through one journey under one approved amount

**Date**: 2026-11-01
**Status**: Accepted
**Deciders**: BlackLigth (blacklight0101)

## Context

Going from an upload to a hand-off package took about fifteen clicks across two pages. The start page asked for a
stage, caps, models and areas for every run; "scan only" was a separate choice; each started run needed an "Open the
live run" click; and the user went back to the start page between understand, Deepen, the questions and the plan
(owner review of 2026-10-30, DEC-204). Each run was approved on its own (RF-430), although the user means one thing:
get a package. ADR-026 already pauses and asks near an approved amount (RF-432), and DEC-205 makes that amount the
worst-case total of the journey, so one amount can cover all the steps.

## Options Considered

1. A guided journey per project: one approved amount for the whole journey, the steps chained under it, the project
   page offering the next step in place, the stage picker and per-run caps removed from the start page.
2. Keep one run per stage, but hide the old form behind "Advanced" and add shortcuts.
3. A fully automatic journey: every step starts as soon as the one before it ends.
4. Do nothing (keep the current state).

## Decision

We choose option 1. Adding a source starts the free scan by itself. When it ends, the project page shows what was
found and one estimate for the journey (understand, claim checking, one Deepen round, the plan) with a likely and a
worst-case figure and one button, Analyse; pressing it records the approved amount on the journey (the worst case,
DEC-205) and starts understand. Every step runs under that one amount and pauses and asks near it, at the worst-case
journey total capped only by the administrator ceilings (ADR-026, DEC-205); a step never asks for caps again.
Starting a step opens its live page. The project page and every run page show a journey strip and offer the next step
in place. Two steps wait for a click, as the owner chose: Deepen is offered as a button with its estimate and what it
would read, and the plan waits for "Start the plan" after the questions and the plan setup, which share one screen with
the recommended answers filled in. The stage picker and per-run caps are removed from the start page, not hidden;
caps, models and parallelism live in project settings; the run-start API keeps its stage parameter for the
evaluation tools and the administrator, under the same checks.

## Rationale

- One approval matches what the user wants and removes the repeated cap questions (DEC-204, RF-430).
- ADR-026 and DEC-205 already give a pause that protects the amount, so chaining needs no new spending rule.
- Deepen and the plan are optional or large spends that depend on the user's judgement and answers; option 3 would
  spend on steps nobody chose (ADR-007).
- Option 2 keeps the form and the two-page loop that caused the problem.
- Option 4 leaves the fifteen-click journey.

## Consequences

**Positive**

- Upload to a finished understand takes two clicks (upload, Analyse); each later step is one click on the page it
  follows.
- The spend of the whole journey is checked against one figure.

**Negative**

- The journey needs a record in the run index with a migration (data-model.md), and a queue that chains steps.
- Evaluation tools that chose caps per run now read them from project settings.
- The worst-case figure can be high for a large source; the pause and the administrator ceilings are the protection.

## References

- DEC-196, DEC-204, DEC-205; RF-011, RF-160, RF-430, RF-432, RF-434..RF-436, RF-647, RF-1019..RF-1022.
- ADR-026 (pause and ask): used under the journey's amount. ADR-007 (cost control), ADR-012 (web UI), ADR-018.
- Cards P7-33..P7-37.
