# Rosetta

Rosetta is an open-source tool for developers and tech leads who inherit a legacy codebase and need to understand it
before they can replace it. Give it a public GitHub repository URL; it pins the commit, maps the code without AI, then sends a team of AI agents through it to
write a functional specification: features, business rules, data entities, integrations and open questions, where
every claim cites the file and lines it comes from and a verifier agent rejects what the code does not support.
From that specification it produces a tool-agnostic modernisation hand-off package (target architecture, decision
records, roadmap and task cards) that any team can build from in its own way. It works with any legacy stack, runs
against any AI provider (local models through Ollama, OpenAI, Anthropic and OpenAI-compatible services), and keeps
the cost of every run visible and capped. A local web page shows every agent it spawns, live, and the published
report replays their work.

**Status: documentation phase (P0).** No code exists yet. This repository holds the design documents that
development will follow. See [docs/README.md](docs/README.md) for the full map.

## Release 1 scope in three lines

- Release 1 covers the full pipeline on one machine: `scan`, `understand` (agents plus verifier), the open-question
  loop, the HTML report and `plan` (the hand-off package), with cost control, on any legacy stack.
- The first milestone (2026-10-26) is a working slice: `scan` and `understand` on one area of the demo legacy app
  with a local model, plus the published sample report, slides and video.
- Later: a Claude Code plugin run mode, a second demo target in a different stack and a provider comparison report;
  rebuilding the legacy system is deliberately not part of Rosetta.

## Scope decisions (agreed at kick-off)

Snapshot of the kick-off decisions; the canonical record is [docs/decision-log.md](docs/decision-log.md).

| Question | Chosen | Instead of |
|---|---|---|
| Name and code | **Rosetta** (working name), code `RST` | - |
| Product owner | **BlackLigth (blacklight0101)**, sole owner; master final project | - |
| Replaces a system | **No.** Rosetta analyses third-party legacy codebases | - |
| First milestone (2026-10-26) | **Docs plus a working slice**, public repo, sample report on GitHub Pages, slides, video | Docs plus a compiling skeleton; docs only |
| Repository | **`C:\BuildingFolder\Rosetta`, local git, public GitHub `blacklight0101/Rosetta`** | Local only, GitHub later |
| Document language | **English** | Spanish; mixed |
| Stack | **TypeScript on Node.js** | .NET 10; Python |
| AI access | **Own agent loop behind a provider interface** (Ollama first, then OpenAI, then Anthropic) | Claude Agent SDK (Claude only); Claude Code plugin only |
| Last stage | **A tool-agnostic hand-off package**; no rebuild | An optional rebuild stage |
| Legacy stacks | **Any stack**: universal scan plus language packs | C# / WebForms only |
| Demo target | **Microsoft eShopLegacyWebForms** (MIT) first; a different-stack target later | BlogEngine.NET |
| Cost control | **Estimate, hard caps, live meter, price table, cost report** | Logging only |
| Builders | **Claude agents build, the owner reviews** | The owner codes by hand |

## Read the documents in this order

1. [docs/rfc/RFC-001-rosetta.md](docs/rfc/RFC-001-rosetta.md) - the design proposal: problem, goals and non-goals, alternatives, proposed design, phases, success metrics.
2. [docs/spec/requirements.md](docs/spec/requirements.md) - requirements with acceptance criteria, open questions and traceability.
3. [docs/adr/README.md](docs/adr/README.md) - the architecture decision records.
4. [docs/decision-log.md](docs/decision-log.md) - the product owner's decisions (DEC-nn) and where each is applied;
   [docs/journal/](docs/journal/) - a summary of each working session.
5. [docs/architecture.md](docs/architecture.md) - the living architecture reference.
6. [docs/design-system.md](docs/design-system.md) - the terminal output and HTML report design.
7. [docs/roadmap.md](docs/roadmap.md) - phases with exit criteria, later releases and what is deliberately not built.

Rules for anyone (human or AI agent) changing this repository are in [CLAUDE.md](CLAUDE.md).
The current state and next steps are in [handoff.md](handoff.md).

## Stack (decided in the ADRs)

TypeScript on Node.js, a command-line interface, no server and no database
([ADR-002](docs/adr/ADR-002-typescript-node-cli.md)); an own agent loop behind a swappable `LlmProvider` interface
([ADR-003](docs/adr/ADR-003-provider-swappable-agent-loop.md)); Clean Architecture
([ADR-009](docs/adr/ADR-009-clean-architecture.md)); tests with Vitest. No database; PostgreSQL if one is ever needed (DEC-37). The rest is in the
[ADR index](docs/adr/README.md).

## Related

- Product owner: BlackLigth (blacklight0101). Master en Desarrollo con IA (BIG School), final project.
- Demo legacy application (read-only, MIT):
  [dotnet-architecture/eShopModernizing](https://github.com/dotnet-architecture/eShopModernizing), folder
  `eShopLegacyWebFormsSolution`.
- License: MIT.
- Repository created 2026-10-09.
