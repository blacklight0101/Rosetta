# Rosetta - Handoff

_Last updated 2026-10-09. Phase **P0 - documentation**. No code yet._

## Current state

- `README.md`, `CLAUDE.md` (rules), this file.
- `docs/rfc/RFC-001-rosetta.md` - design proposal, **Status: Proposed**.
- `docs/spec/requirements.md` - release 1 requirements RF-001..RF-802 and RNF-001..RNF-013, **Status: Proposed**;
  open questions in its section 4.
- `docs/adr/` - ADR-001..ADR-011; counts by status in the [index](docs/adr/README.md).
- `docs/decision-log.md` - decisions DEC-01..DEC-40.
- `docs/journal/` - curated session summaries (the conversation journal is private, outside the repository; DEC-38).
- `docs/conventions.md` and `docs/environments-and-delivery.md` - written 2026-10-10 (toolchain, lint, CI, baseline).
- `.claude/agents/` - builders for difficulty bands (haiku, sonnet, opus, fable), `verifier`, `verifier-fable`;
  `orchestrator` still a scaffold.
- Not yet filled: `docs/architecture.md`, `docs/data-model.md`, `docs/design-system.md`, `docs/design-system-brief.md`, `docs/roadmap.md`,
  `docs/process-flows.md`, `docs/orchestration/`.

## Resume point

State: kick-off interview done (rounds 1-3, DEC-01..DEC-38); README, CLAUDE.md, RFC-001, requirements, ADR-002..ADR-009
and the first journal entry written. Remaining documents are scaffolded but not filled.

Next, in this order:
1. Ask the owner to create the public repository and open the first pull request (`docs/kickoff`) for review (G-03).
2. Write `docs/architecture.md` (Clean Architecture layers, layout, state lists, ports).
3. Pre-build agenda: file formats (data-model.md), report design v1 (design-system.md), conventions and delivery.
4. Roadmap, process flows and the build plan with difficulty-rated cards (DEC-32); run `check_docs.py`.
5. Owner reviews the whole set; G-01 opens only then (DEC-33).

Blockers: the owner's go-ahead to create the public GitHub repository.

## Agenda for the next session (ask the owner first)

1. ~~Round 3 of questions~~ DONE 2026-10-09: DEC-24..DEC-37.
2. File formats walk-through (configuration, code map, card, run folder, cost report) - lands in data-model.md.
3. Report design: brief, optional design round trip, or v1 only - lands in design-system.md and the brief.
4. Other things to settle: Node version, package baseline, CI, versioning, naming, error codes - lands in
   conventions.md and environments-and-delivery.md.
5. Owner review of the whole documentation set, which opens G-01 (DEC-33) - lands in this file.

## Gates

Criteria for each gate are defined once in [docs/orchestration/README.md](docs/orchestration/README.md) (section
Human gates). This table records only their state. Open a gate by setting State to `Open` with the date and who
opened it; a `Provisional` gate names the only cards it releases.

| Gate | Name | State | Since | Note |
|---|---|---|---|---|
| G-01 | Documentation set accepted | Closed | - | opens only after the owner reviews the whole set (DEC-33); no provisional opening |
| G-02 | Report design approved | Closed | - | needed before the first P3 report card |
| G-03 | Public GitHub repository ready | Closed | - | `blacklight0101/Rosetta`, created on the owner's request |
| G-04 | Provider access ready | Closed | - | Ollama installed with the model of Q-04; OpenAI key in the environment |
| G-05 | Milestone hand-in approved | Closed | - | the owner submits the M1 URLs by 2026-10-26 |


## Decisions pending

- Open questions Q-01..Q-11 run on their defaults; see [requirements section 4](docs/spec/requirements.md#4-open-questions).
- Deferred ADRs and their triggers are listed in the [ADR index](docs/adr/README.md).

## Session log

- **2026-10-10 (toolchain)** - DEC-40 and ADR-011: researched current practice for the stack; TypeScript 6.0 (7.x waits
  for typescript-eslint), ESLint 10 strict type-checked, Prettier, dependency-cruiser, knip, Vitest 5 coverage, commitlint,
  lefthook, hardened CI. Conventions and environments written; builder and verifier agents written. Q-12 (verifier
  model) open with a default. Pushed to PR #1.
- **2026-10-09 (method)** - DEC-39 and ADR-010: spec-driven (spec-anchored) and test-driven development on every card,
  checked by the verifier. Public repository set up, PR #1 open. Ollama 0.40.2 installed in `E:\Ollama\app`, models kept in
  `G:\Ollama Models` (qwen3.5:9b, gemma4:e4b, llama3.1:8b added).
- **2026-10-09 (round 3)** - DEC-24..DEC-37: zip download, Clean Architecture (ADR-009), PostgreSQL if a database is
  ever needed, difficulty 1-10 builder selection, full owner control with a conversation journal, GitHub issue/PR flow.
  DEC-38 keeps the conversation journal private; `docs/journal/` holds curated summaries only. Not committed.
- **2026-10-09** - Project chosen and documentation set scaffolded from the kick-off interview with BlackLigth
  (blacklight0101): DEC-01..DEC-23, Q-01..Q-11, RFC-001, requirements, ADR-002..ADR-008. Demo target chosen
  (eShopLegacyWebForms, MIT). Owner hardware checked (RTX 4060 Ti 8 GB, 32 GB RAM, Ollama not installed). Not
  committed.
