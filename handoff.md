# Rosetta - Handoff

_Last updated 2026-10-11. Phase **P0 - documentation**. No code yet. Work is on branch `docs/kickoff`, PR #1._

## Current state

- `README.md`, `CLAUDE.md` (rules), this file.
- `docs/rfc/RFC-001-rosetta.md` - design proposal, **Status: Proposed**.
- `docs/spec/requirements.md` - release 1 requirements RF-001..RF-1012 and RNF-001..RNF-013, **Status: Proposed**;
  open questions in its section 4.
- `docs/adr/` - ADR-001..ADR-012; counts by status in the [index](docs/adr/README.md).
- `docs/decision-log.md` - decisions DEC-01..DEC-55.
- `docs/journal/` - curated session summaries (the conversation journal is private, outside the repository; DEC-38).
- `docs/conventions.md` and `docs/environments-and-delivery.md` - written 2026-10-10 (toolchain, lint, CI, baseline).
- `.claude/agents/` - builders for difficulty bands (haiku, sonnet, opus, fable), `verifier`, `verifier-fable`;
  `orchestrator` still a scaffold.
- `docs/architecture.md` - written 2026-10-10: layers, layout, state lists, ports, agent loop.
- `docs/design-system.md` v1, `docs/design-system-brief.md` and `docs/design/tokens.css` - written 2026-10-11; design
  board (private Artifact): https://claude.ai/artifact/465wJUMV3RCHvDVAJG2oEm - awaiting owner review (G-02).
- `docs/data-model.md` - written 2026-10-10 (all file formats); Q-15 and Q-16 answered (DEC-54, DEC-55).
- Not yet filled: `docs/design-system.md`, `docs/design-system-brief.md`, `docs/roadmap.md`,
  `docs/process-flows.md`, `docs/orchestration/`.

## Resume point

State (2026-10-10, end of session): documentation P0 in progress on `docs/kickoff` (PR #1, not merged; the owner
merges). Written: README, CLAUDE.md, RFC-001, requirements (RF-001..RF-1012), ADR-001..ADR-012, decision log
DEC-01..DEC-55, architecture, data model, conventions, environments and delivery, builder and verifier agents,
journal. Every open question Q-01..Q-16 is answered or runs on its default.

Next, in this order (ask the owner before each):
1. ~~Design system v1 and the design brief~~ DONE 2026-10-11; the owner reviews the design board and approves it
   at G-02 or asks for changes (folded in as v2).
2. Roadmap (P0..P4 with exit criteria) and process flows.
3. Build plan: `docs/orchestration/README.md`, `tasks.md` with cards rated 1-10 (DEC-32), one GitHub issue per
   card, and the orchestrator agent.
4. Run `check_docs.py --without legacy`, a light review, fix what is mechanical.
5. Owner reviews the whole set and merges PR #1; G-01 opens only then (DEC-33).

Blockers: none.

## Agenda for the next session (ask the owner first)

1. ~~Round 3 of questions~~ DONE 2026-10-09: DEC-24..DEC-37.
2. ~~File formats walk-through~~ DONE 2026-10-10: DEC-43; data-model.md written, awaiting owner review.
3. ~~Conventions and delivery~~ DONE 2026-10-10: DEC-40, ADR-011.
4. ~~Design system v1 + brief with live web UI mock-ups~~ DONE 2026-10-11: board published; owner review pending (G-02).
5. Roadmap, process flows, build plan.
6. Owner review of the whole documentation set, which opens G-01 (DEC-33).

## Gates

Criteria for each gate are defined once in [docs/orchestration/README.md](docs/orchestration/README.md) (section
Human gates). This table records only their state. Open a gate by setting State to `Open` with the date and who
opened it; a `Provisional` gate names the only cards it releases.

| Gate | Name | State | Since | Note |
|---|---|---|---|---|
| G-01 | Documentation set accepted | Closed | - | opens only after the owner reviews the whole set (DEC-33); no provisional opening |
| G-02 | Design board approved (web UI and report) | Closed | - | v1 board published 2026-10-11; needed before the web UI shell card and the first report card |
| G-03 | Public GitHub repository ready | Closed | - | `blacklight0101/Rosetta`, created on the owner's request |
| G-04 | Provider access ready | Closed | - | Ollama installed with the model of Q-04; OpenAI key in the environment |
| G-05 | Milestone hand-in approved | Closed | - | the owner submits the M1 URLs by 2026-10-26 |


## Decisions pending

- Open questions Q-01..Q-16 are answered or run on their defaults; see [requirements section 4](docs/spec/requirements.md#4-open-questions).
- Deferred ADRs and their triggers are listed in the [ADR index](docs/adr/README.md).

## Session log

- **2026-10-11 (design system)** - design-system.md v1, the brief and the token file written; design board v1 published
  as a private Artifact (tokens sheet, start a run, live run, API calls and logs, history with delete, report and
  replay), light and dark, all token pairs WCAG AA (lowest 3.14:1 for control borders). Next: owner reviews the board
  (G-02); then roadmap, flows, build plan.
- **2026-10-10 (end of day)** - Q-15 answered: USD (DEC-54). Q-16 answered: delete button for snapshots and runs in
  the web UI, cost ledger untouched (DEC-55, RF-1012). Resume point rewritten. Next: design system.
- **2026-10-10 (data model)** - data-model.md written: folder map, every file format, event list, call log, cost
  ledger, schema versions. Q-10 answered (DEC-53, models on G:). Q-15 (currency) and Q-16 (clean-up command) open with
  defaults. Next: design system v1 and brief with live-page mock-ups.
- **2026-10-10 (Q-13, Q-14)** - DEC-51: the whole web UI is aimed at M1, with a postponement order if the date is at
  risk; DEC-52: Preact + Vite, Playwright + axe. Next: data-model.md.
- **2026-10-10 (formats and web UI)** - DEC-43..DEC-50: file formats, report look, always English, a live local web UI
  showing spawned agents (ADR-012, RF-1000..RF-1009, RF-506), runs from CLI and browser, input only from public
  GitHub snapshots pinned to a commit (RF-120..RF-126); project tokens and cost always visible (RF-428, RF-1010); provider call observability and application log (RF-408, RF-009, RF-1011). ADR-002 amended. Q-13 (web UI in M1) and Q-14 (front-end
  library) open with defaults. Pushed to PR #1.
- **2026-10-10 (toolchain)** - DEC-40 and ADR-011: researched current practice for the stack; TypeScript 6.0 (7.x waits
  for typescript-eslint), ESLint 10 strict type-checked, Prettier, dependency-cruiser, knip, Vitest 5 coverage, commitlint,
  lefthook, hardened CI. Conventions and environments written; builder and verifier agents written. Q-12 answered by DEC-41
  (Opus 5.5 verifier for 1-9, Fable for 10); DEC-42 secret scanning, push protection and Dependabot enabled. Pushed to PR #1.
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
