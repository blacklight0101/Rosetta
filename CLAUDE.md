# Rosetta - Project Instructions

Rules of the road for anyone (including Claude) working in this repository. The user-facing overview is
[README.md](README.md); the current state is [handoff.md](handoff.md); the design is under `docs/`.

## Mission and scope

Rosetta is a new open-source command-line tool (it replaces no system) that turns a legacy codebase into a verified
functional specification and a tool-agnostic modernisation hand-off package:
public GitHub repository URL (pinned to a commit) -> `scan` (deterministic code map) -> `understand` (agents write evidence-cited cards, a verifier
checks them) -> owner answers open questions -> `report` (HTML) -> `plan` (architecture, ADRs, roadmap, task cards).
Release 1 is the whole pipeline on one developer machine with cost control; the first milestone (2026-10-26) is a
`scan` + `understand` slice on the demo app. Rebuilding the legacy system is never part of Rosetta. Audience:
developers and tech leads; it runs locally as a CLI with a live loopback web UI that shows every agent and the project's tokens and cost, and talks to AI providers over their APIs. Phases are in
[docs/roadmap.md](docs/roadmap.md).

## Repository and deployment

| Key | Value |
|---|---|
| Local path | `C:\BuildingFolder\Rosetta` |
| Short code | `RST` (prefix for names that must be unique across systems, see `docs/conventions.md`) |
| Product owner | BlackLigth (blacklight0101) |
| Version control | git, branch `main`; remote `origin` = public GitHub `blacklight0101/Rosetta` (created at gate G-03); never push unless asked |
| Branching | branch off `main` per change -> review -> fast-forward or squash merge -> linear history |
| Hosting target | None: a CLI plus a loopback-only web UI on the user's machine ([ADR-002](docs/adr/ADR-002-typescript-node-cli.md), [ADR-012](docs/adr/ADR-012-local-web-ui-and-github-sources.md)); the sample report is published as a static site on GitHub Pages |
| Data store | No database. Files only: configuration and the run output folder ([docs/data-model.md](docs/data-model.md)) |
| Read-only references | Snapshots of the public GitHub repositories being analysed, including `dotnet-architecture/eShopModernizing` |

## Sources of truth

When two documents disagree, the one higher in this list wins and the other is corrected in the same change. A
decision-log row that is newer than the conflicting text always wins: the text was not updated when the decision was
applied, and fixing it is part of applying the decision.

1. `docs/spec/requirements.md` - what the system must do (`RF-nnn` / `RNF-nnn`) and the open questions (`Q-nn`).
   New behaviour gets an id there **before** code is written.
2. `docs/decision-log.md` - the product owner's decisions (`DEC-nn`) and where each is applied.
3. `docs/adr/` - why it is built this way. A decision that affects several developers or is hard to revert gets an
   ADR **before** it is implemented. ADRs are never deleted; they are superseded or amended with a dated note.
4. `docs/architecture.md` - how the pieces fit; updated in the same change that alters the structure.
   `docs/data-model.md` - every table, constraint and grant; a migration and this document change together.
   `docs/conventions.md` - names, error handling, user-facing behaviour when something is down.
   `docs/environments-and-delivery.md` - environments, secrets placement, package baseline, versioning, deployment.
   `docs/design-system.md` - tokens, components, patterns; a screen uses only what is documented there.
5. `docs/roadmap.md` - phases with exit criteria; `docs/process-flows.md` - stakeholder diagrams derived from 1-4.
6. `handoff.md` - the living state. Update it at the end of every working session.
7. `docs/orchestration/` - the build plan: `README.md` (protocol, builder tiers, verifier, human gates `G-nn`) and
   `tasks.md` (task cards `P<phase>-nn`). Agents live in `.claude/agents/`. The orchestrator edits only the Status
   line of a card; every finished card is verified before it is merged.


## Hard rules for the documents

- **Never renumber or reuse an id** (`RF`, `RNF`, `Q`, `ADR`, `DEC`, `DEF`, `G`, `P<phase>-nn`, `RFC`). A dropped item
  keeps its id and reads `Withdrawn YYYY-MM-DD - see <id>`.
- **ADRs are never deleted.** A replaced decision is marked `Superseded by ADR-nnn`; a partial change adds a dated
  note and the status `Amended`. The index `docs/adr/README.md` is updated in the same change.
- **Never invent an answer.** Anything the product owner has not decided becomes an open question `Q-nn` in the spec
  with an owner, a "needed by" phase and a stated default; the Status reads `Default applies` until answered.
- **Ask with defaults.** When asking the product owner, number the questions and give a default for each, so that
  "defaults except 4 and 9" is a complete answer. Record every answer as a `DEC-nn` row and apply it everywhere it
  lands in the same change.
- **One canonical place per fact.** Counts (ADRs by status, cards by tier and phase), state lists, permission codes,
  migration numbers and id ranges are stated in the one document that owns them (see `docs/README.md`); every other
  document links there instead of repeating the number.
- **Documents are written in English.** Plain, direct prose; Markdown tables for registers; Mermaid for diagrams;
  no emojis.
- **Traceability both ways.** A requirement names its ADRs and cards in the spec's traceability matrix; a card names
  the requirement and ADR ids it implements; a decision names where it is applied.

## Hard rules specific to this system

- **Never write to a snapshot.** Legacy code comes only from public GitHub repositories, pinned to a commit and
  cached read-only; agent tools are read-only; every output goes to the run output folder. (DEC-17, DEC-48,
  [ADR-006](docs/adr/ADR-006-read-only-tools-and-data-egress.md), [ADR-012](docs/adr/ADR-012-local-web-ui-and-github-sources.md), RF-005, RF-122)
- **Analysed code and model output are untrusted.** Repository content reaches a model only inside labelled data
  blocks; model and repository text is rendered as text, never HTML; every guard fails closed and logs a security
  event. ([ADR-013](docs/adr/ADR-013-untrusted-code-and-model-output.md), [threat model](docs/security/threat-model.md),
  RF-145, RF-507, RF-1013)
- **The web server is loopback-only.** It binds `127.0.0.1`, requires the session token, checks `Host` and `Origin`
  and never sends a secret to the browser. (DEC-46, ADR-012, RF-1009)
- **Never send a file a run did not ask for, a path listed in `.rosettaignore`, or an unmasked secret to a
  provider.** All provider traffic goes through the egress guard. (DEC-16, ADR-006, RF-140..RF-149)
- **Never call a provider SDK outside its adapter.** Agents, orchestrator and verifier talk only to the
  `LlmProvider` port; provider-specific types never leak past the adapter. (DEC-09,
  [ADR-003](docs/adr/ADR-003-provider-swappable-agent-loop.md))
- **Every model call is metered and capped.** It passes through the budget guard, which records tokens and cost per
  role and stops the run cleanly when a cap is reached; no code path bypasses it. (DEC-13,
  [ADR-007](docs/adr/ADR-007-cost-control.md), RF-420..RF-429)
- **Every finding cites evidence.** A card without at least one `path:startLine-endLine` citation is invalid; the
  verifier never deletes a rejected claim, it marks it. (DEC-18, DEC-19,
  [ADR-005](docs/adr/ADR-005-evidence-cards-and-two-step-verifier.md))
- **No stack-specific logic outside a language pack.** The universal scan and the agents must work on a repository in
  any language; C#-, Java- or PHP-specific parsing lives in its pack. (DEC-11,
  [ADR-004](docs/adr/ADR-004-universal-scan-and-language-packs.md))
- **Prompts and card formats are versioned files, not string literals in code.** Every run records the prompt
  versions, models and settings it used, so a run can be explained and repeated. (RNF-004)
- **No real model in automated tests.** Tests use the fake provider with recorded responses; a live provider runs
  only in an explicitly opted-in evaluation. ([ADR-008](docs/adr/ADR-008-testing-with-recorded-responses.md))
- **Nothing from the owner's employer enters this public repository**, not as a test fixture, an example or a
  screenshot. (DEC-03)
- **No API key or secret is committed.** Keys come from environment variables or a git-ignored `.env`. (RNF-003)

## Stack rules

<!-- STACK-RULES:BEGIN -->
- **Runtime:** Node.js LTS (exact version in `docs/environments-and-delivery.md`), TypeScript in `strict` mode,
  ES modules. No `any` without a comment that says why.
- **Architecture:** Clean Architecture ([ADR-009](docs/adr/ADR-009-clean-architecture.md)). `domain` imports nothing
  outside itself; `application` (use cases and ports) imports only `domain`; `infrastructure` (providers, guards, file
  system, language packs, writers) implements the ports; `presentation` (CLI) holds the single composition root.
  Dependencies point inward only; the rule is checked by `npm run verify`. Details in `docs/architecture.md`.
- **Database:** none in release 1. If one is ever needed it is PostgreSQL, behind an infrastructure adapter (DEC-37).
- **Errors:** domain errors are typed results or typed error classes with a stable code (`RST-xxxx`, catalogue in
  `docs/conventions.md`); the CLI prints the code and a plain message, never a stack trace unless `--verbose`.
- **Spec-driven (SDD, spec-anchored):** no card without the requirement ids it implements; behaviour the
  specification does not describe stops the card and becomes a new `RF` or `Q-nn` first; any behaviour change edits
  `docs/spec/requirements.md` in the same pull request ([ADR-010](docs/adr/ADR-010-spec-driven-and-test-driven-development.md)).
- **Test-driven (TDD):** red, green, refactor on every card. Each Given/When/Then scenario becomes a Vitest test named
  after its requirement id; a `test:` commit with failing tests comes before the `feat:`/`fix:` commit that makes them
  pass. Levels unit / integration / end-to-end with the split in `docs/conventions.md`.
- **Quality gates ([ADR-011](docs/adr/ADR-011-toolchain-and-quality-gates.md)):** `npm run verify` runs typecheck,
  lint (zero warnings), format check, dependency-cruiser, knip and tests with coverage; it must pass before any card is
  reported done, and CI runs the same gates. Never weaken a gate to make it pass.
- **Coding rules:** `docs/conventions.md` (types parsed at boundaries, no `any`/`!`/casts, determinism ports, timeouts
  and abort signals, error-code catalogue, size limits, named exports).
- **Packages:** the baseline list in `docs/environments-and-delivery.md`; any new runtime dependency needs an ADR.
<!-- STACK-RULES:END -->

## Read-only paths

- Snapshots under `rosetta-out/sources/` (for example of `dotnet-architecture/eShopModernizing`): input for runs
  only; never edit them and never copy their files into this repository except as small, cited excerpts in test
  fixtures (MIT licence, attribution kept).

## Commit policy and GitHub workflow (DEC-33, DEC-35)

- **The product owner has full control.** Nothing reaches `main` without the owner's approval of its pull request;
  agents never merge, never push to `main`, never force-push and never rewrite published history.
- **Trace everything:** one GitHub issue per task card; one branch per issue (`task/<card-id>-<slug>` in lower case,
  or `docs/<topic>` for documentation that belongs to no card; exact names in `docs/conventions.md`); one pull
  request per branch, filled from the template, citing the card, `RF`, `ADR` and `DEC` ids and closing its issue.
- **Before review:** CI (`npm run verify` on Windows and Linux) is green and the verifier's verdict is posted on the
  pull request. The owner reviews, approves and merges with squash so `main` stays linear; the branch is deleted.
- Commits use Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`) and end with `Refs:` naming the ids.
- Milestones group issues by phase; every release is a tag and a GitHub release (DEC-29).
- Commit only when asked; the working tree is clean before a multi-file change starts.

## Documentation protocol

- Requirement change -> edit `docs/spec/requirements.md` (keep ids stable, add new ones in the module's range, never
  renumber) and its traceability matrix.
- Decision by the product owner -> new row in `docs/decision-log.md`, then apply it and fill "Where applied".
- Architectural decision -> new `docs/adr/ADR-nnn-<kebab-title>.md` from `docs/adr/_template.md`, plus a row in
  `docs/adr/README.md`.
- Structural change -> `docs/architecture.md` in the same change; schema change -> `docs/data-model.md`.
- Flow change -> `docs/process-flows.md`, then regenerate any exported page or PDF made from it.
- Working session with the owner -> a curated summary in `docs/journal/YYYY-MM-DD-<topic>.md`: what was decided and
  why, with DEC and Q ids; no conversation, no quotes, no secrets, no employer details, no personal data. The
  conversation record itself is private and lives outside this repository (DEC-33, DEC-38).
- Session end -> `handoff.md` (resume point, agenda, gates, session log entry at the top).

## Planned solution layout (scaffolded in Phase 1, not before)

```text
src/domain/          entities, value objects, domain rules (claims, citations, budgets)
src/application/     use cases (scan, understand, verify, answer, report, plan, estimate, export) and ports
src/infrastructure/  LLM providers, egress and budget guards, file system, language packs, writers, zip
src/presentation/    command-line interface and composition root
prompts/         versioned agent prompts and card templates
tests/           unit, integration and end-to-end tests, recorded provider responses, golden set
site/            the published sample report (GitHub Pages)
```

The detailed layout is in [docs/architecture.md](docs/architecture.md).
