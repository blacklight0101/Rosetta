---
type: journal
date: 2026-10-11
decisions: DEC-72..DEC-86
---

# 2026-10-11 - Planning brief and principle catalogue

Curated summary of the working session (DEC-38). No conversation is recorded here.

The owner wants `plan` to work the way this repository was planned: an interview with defaults before anything is
written, and a package that carries the engineering practice taught in the master. Every proposal was accepted with
its default.

| Topic | Outcome | Why | Ids |
|---|---|---|---|
| Interview | A Plan setup page asks the planning questions in small groups with defaults, reasons and a recommended option; the answers are the planning brief, saved per project | Choices made by the user are decisions; choices made by a model are guesses | DEC-72, RF-605 |
| Catalogue | Principles and practices follow the master's curriculum, in Rosetta's own words, as versioned files in `prompts/catalogue/`, credited to the master | The project shows what the master taught; packages stay reproducible | DEC-73, DEC-84, DEC-85, RF-606 |
| Defaults | SOLID, KISS, DRY, YAGNI, TDD, SDD, ADRs, the testing pyramid with honest coverage, security by design and CI gates are on | Good practice by default, one click to remove | DEC-74 |
| Applied, not listed | Each principle becomes conventions rules and task-card checks | A reviewer can only check rules | DEC-75, RF-607 |
| Architecture | Six styles with selection criteria; Rosetta recommends two from the evidence and the user picks; the choice is an ADR | Answers Q-06 with evidence behind the recommendation | DEC-76, DEC-77, RF-608 |
| Stack | Chosen per layer, two options pre-filled from the legacy stack | Specific enough to build from | DEC-78, RF-609 |
| Migration and method | Strangler Fig by default; an AI-assisted build method (AGENTS.md, rated cards, plan before build, human review) | A plan needs a path and a way of working | DEC-76, RF-610, RF-612 |
| Context and gaps | Optional team and deadline questions shape the roadmap; unanswered questions take their default and are listed | Nothing is invented | DEC-79, DEC-80, RF-611 |
| Cost and timing | The planner runs under the caps with an estimate; ships in release 1 after the milestone | Protects the budget and the 2026-10-26 date | DEC-81, DEC-82, RF-613 |
| Screen | Plan setup drawn as artboard 14 and approved | Same method as the other screens | DEC-86 |
| Not adopted | No quality score of the legacy code in release 1 | The report describes what the code does, not how good it is | DEC-83 |
