# docs/ - index

Source of truth for the design of Rosetta. Notes kept elsewhere (a vault, a wiki) may mirror this table and link
here; they never hold a second copy of these documents.

| Document | Purpose | Status | Date |
|---|---|---|---|
| [rfc/RFC-001-rosetta.md](rfc/RFC-001-rosetta.md) | Design proposal: problem, goals and non-goals, alternatives, proposed design, impact, phases, success metrics | Proposed | 2026-10-09 |
| [spec/requirements.md](spec/requirements.md) | Requirements with Given/When/Then acceptance criteria, non-functional requirements, open questions, reserved ranges, traceability | Proposed | 2026-10-09 |
| [decision-log.md](decision-log.md) | The product owner's decisions (DEC-nn), what each answers and where it is applied | Living | 2026-10-09 |
| [journal/](journal/) | Curated per-session summary of what was decided and why, with DEC and Q ids; no conversations | Living | 2026-10-09 |
| [adr/README.md](adr/README.md) | Architecture decision records index, counts by status, deferred decisions | Living | 2026-10-09 |
| [architecture.md](architecture.md) | Layers and dependency rule, solution layout, domain model and state lists, use cases, ports, agent loop, security, testing approach | Living | 2026-10-10 |
| [data-model.md](data-model.md) | No database: the file formats Rosetta reads and writes (configuration, snapshot cache, code map, run folder, cards, events, call and application logs, cost ledger) and their schema versions | Proposed | 2026-10-10 |
| [conventions.md](conventions.md) | Compiler and lint rules, names, types, async, errors and the RST error-code catalogue, tests, formatting, commits | Proposed | 2026-10-10 |
| [environments-and-delivery.md](environments-and-delivery.md) | Environments, secrets, source control, CI gates, package and tool baseline, versioning and releases | Proposed | 2026-10-10 |
| [design-system.md](design-system.md) | Live web UI, published report and terminal output: tokens (`design/tokens.css`), components, status badges, patterns, accessibility, verification | Accepted (v1) | 2026-10-11 |
| [design-system-brief.md](design-system-brief.md) | The brief for the design board | Superseded | 2026-10-11 |
| [roadmap.md](roadmap.md) | Phases P0..Pn with exit criteria, later releases with entry conditions, backlog by requirement id, deliberately not built | Living | 2026-10-09 |
| [process-flows.md](process-flows.md) | Stakeholder flowcharts (Mermaid) with requirement ids in captions; source of any exported page or PDF | Reference | 2026-10-09 |
| [orchestration/README.md](orchestration/README.md) | Build protocol: roles, builder tiers, card life cycle, builder rules, verifier checklist and verdict format, human gates G-nn, parallelism, stop conditions | Living | 2026-10-09 |
| [orchestration/tasks.md](orchestration/tasks.md) | Task cards P1-01..Pn-nn with builder tier, size, dependencies, gate, reads, do, delivers, done-when checks, refs and status; totals by tier and phase | Living | 2026-10-09 |

`legacy-sources.md` is not written: Rosetta replaces no system (DEC-03).

Agent definitions used by the orchestration protocol live in `.claude/agents/` (`orchestrator`, `builder-haiku`,
`builder-sonnet`, `builder-opus`, `builder-fable`, `verifier`, `verifier-fable`); the difficulty of a card selects
the builder (DEC-32).

## Identifier schemes

Ids are never renumbered or reused. A withdrawn item keeps its id and reads `Withdrawn YYYY-MM-DD - see <id>`.

| Id | Meaning | Owned by (canonical list) |
|---|---|---|
| `RF-nnn` | Functional requirement; one range of a hundred per module (for example RF-001..RF-099 CLI, RF-100..RF-199 scan); three digits up to RF-999, four from RF-1000 | [spec/requirements.md](spec/requirements.md) section 5, ranges in section 1 |
| `RNF-nnn` | Non-functional requirement | [spec/requirements.md](spec/requirements.md) section 6 |
| `Q-nn` | Open question with owner, needed-by phase, default and status (`Open`, `Default applies`, `Answered (DEC-nn)`, `Withdrawn`) | [spec/requirements.md](spec/requirements.md) section 4 |
| `DEC-nn` | Product owner decision, with what it answers and where it is applied | [decision-log.md](decision-log.md) |
| `ADR-nnn` | Architecture decision record, file `adr/ADR-nnn-kebab-title.md`; status `Proposed`, `Accepted`, `Superseded by ADR-nnn` or `Amended` (dated note) | [adr/README.md](adr/README.md) |
| `RFC-nnn` | Design proposal | [rfc/](rfc/) |
| `G-nn` | Human gate; criteria in the orchestration protocol, state in `handoff.md` | [orchestration/README.md](orchestration/README.md) |
| `P0..Pn` | Phase with exit criteria | [roadmap.md](roadmap.md) |
| `P<phase>-nn` | Task card, for example `P1-03` | [orchestration/tasks.md](orchestration/tasks.md) |

## Where counts and shared lists live

State each of these in its canonical place only; other documents link there.

| Fact | Canonical place |
|---|---|
| ADRs by status | [adr/README.md](adr/README.md) (Totals line under the index) |
| Cards by tier and by phase | [orchestration/tasks.md](orchestration/tasks.md) (Totals table at the top) |
| Open questions and their defaults | [spec/requirements.md](spec/requirements.md) section 4 |
| Requirement id ranges per module | [spec/requirements.md](spec/requirements.md) section 1 |
| State lists (claim status, run end state, agent task state) | [architecture.md](architecture.md) (domain model) |
| Error codes `RST-xxxx` | [conventions.md](conventions.md) |
| File formats and schema versions | [data-model.md](data-model.md) |
| Package baseline and versions | [environments-and-delivery.md](environments-and-delivery.md) |
| Phase scope and exit criteria | [roadmap.md](roadmap.md) |
| Gate criteria / gate state | [orchestration/README.md](orchestration/README.md) / [../handoff.md](../handoff.md) |

## Status vocabulary for documents

- **Proposed** - written, not yet reviewed by the product owner and the reviewers named in the document.
- **Accepted** - reviewed and approved; changes go through a decision (DEC-nn) or an ADR.
- **Living** - an index, register or plan that changes as work proceeds; always current.
- **Reference** - kept for the record or derived from other documents; never the source of a fact.
- **Superseded** - replaced by the document named in its header; kept, never deleted.

## Planned documents (not written yet)

| Document | When | Content |
|---|---|---|
| `docs/releases.md` | P1, milestone card | release notes per version, starting with the M1 milestone |
| `docs/golden-set.md` | P2, evaluation card | how the golden set for the demo app was built and how runs are scored |
| `docs/providers.md` | P1, provider setup card | how to set up Ollama, OpenAI, Anthropic and OpenAI-compatible providers, with tested models |

## How to add things

- **A requirement**: next free id in its module's range in `spec/requirements.md`; fill title, release, MoSCoW,
  source, story, Given/When/Then, verification. Add it to the traceability matrix. Never renumber.
- **An open question**: next free `Q-nn` in the spec's section 4 with owner, needed-by phase and a default; Status
  `Open`, or `Default applies` once work proceeds on the default.
- **A decision by the product owner**: next free `DEC-nn` in `decision-log.md`; name what it answers; apply it and
  fill "Where applied"; set the answered question to `Answered (DEC-nn)`.
- **An ADR**: copy `adr/_template.md` to `adr/ADR-nnn-<kebab-title>.md`, status `Proposed`, add a row to
  `adr/README.md` and update its Totals line. When superseding, set the old one to `Superseded by ADR-nnn`; never
  delete. A decision the product owner took directly may be written as `Accepted` with its DEC-nn in References.
- **A task card**: next free `P<phase>-nn` in `orchestration/tasks.md`, in the card format of that file; update the
  Totals table.
