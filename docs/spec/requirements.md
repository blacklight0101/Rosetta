# Rosetta - Requirements (Release 1)

| | |
|---|---|
| **Status** | Proposed (becomes Accepted after the review that opens gate G-01) |
| **Date** | 2026-10-09 |
| **Owner** | BlackLigth (blacklight0101) |
| **Reviewers** | BlackLigth (blacklight0101), product owner |
| **Related** | [RFC-001](../rfc/RFC-001-rosetta.md) - [ADRs](../adr/README.md) - [Decision log](../decision-log.md) - [Architecture](../architecture.md) - [Roadmap](../roadmap.md) |

## 1. Introduction

### 1.1 Scope

Release 1 (R1) is a command-line tool that a developer runs on their own machine against a legacy repository in any
language. It maps the repository (`scan`), has AI agents write evidence-cited cards that a verifier checks
(`understand`), collects the developer's answers to open questions, renders an HTML report (`report`) and writes a
tool-agnostic modernisation hand-off package (`plan`), with cost control on every model call and a swappable AI
provider (DEC-05, DEC-09, DEC-10, DEC-11, DEC-13). A subset of R1, marked **M1** below, is the milestone due
2026-10-26 (DEC-04). Later releases appear only in section 7.

### 1.2 How to read an id

- `RF-nnn` functional requirement, `RNF-nnn` non-functional requirement, `Q-nn` open question (section 4),
  `DEC-nn` a decision by the product owner in [decision-log.md](../decision-log.md) (a requirement cites it as
  `Decision DEC-nn`), `ADR-nnn` an architecture decision record.
- Ids are **never renumbered or reused**. A dropped requirement keeps its id and reads
  `Withdrawn YYYY-MM-DD - see <id>`.
- **Release** says when it ships: `R1 (M1)` is part of the 2026-10-26 milestone, `R1` ships later in release 1.
  **MoSCoW** (Must, Should, Could, Won't) says how negotiable it is inside that release.
- **Source** says where the behaviour comes from: a decision, an interview, a regulation.
- A **deferred requirement** (section 7) is a reserved range and an intent, not a commitment, until it is promoted
  into section 5 with acceptance criteria.

### 1.3 Id ranges

Each module owns a range of a hundred functional ids; inside a range, ids are grouped in tens by topic. A new module
takes the next free range. This table is the canonical list of ranges.

| Range | Module | Release |
|---|---|---|
| RF-001..RF-099 | CLI, configuration and runs | R1 |
| RF-100..RF-199 | Scan and file access (RF-140..RF-149: data egress) | R1 |
| RF-200..RF-299 | Understand: agents, cards, coverage, open questions | R1 |
| RF-300..RF-399 | Verifier | R1 |
| RF-400..RF-499 | Providers (RF-400..RF-419) and cost control (RF-420..RF-429) | R1 |
| RF-500..RF-599 | Report | R1 |
| RF-600..RF-699 | Plan: the hand-off package | R1 |
| RF-700..RF-799 | Claude Code plugin run mode | R2 (deferred) |
| RF-800..RF-899 | Milestone hand-in artefacts | R1 (M1) |
| RF-900..RF-999 | Multi-target evaluation and provider comparison | R2 (deferred) |
| RNF-001..RNF-099 | Non-functional requirements, grouped in tens by quality (see section 6) | all |

### 1.4 Acceptance criteria

Acceptance criteria are written Given / When / Then. `Must` requirements carry full scenarios (the happy path and
every failure the requirement names), `Should` at least one scenario, `Could` a one-line criterion. Every
requirement ends with a `Verification:` line that names the test level or manual check that proves it.
Every scenario becomes at least one automated test named after the requirement id, written before the code
(ADR-010).

## 2. Actors

| Actor | Kind | Role in R1 |
|---|---|---|
| Developer | person | installs and configures Rosetta, runs every command, answers open questions, reads the report, hands the package on (RF-001..RF-699) |
| Modernisation team | person | receives the hand-off package and builds the new system in its own way; never runs Rosetta (RF-600..RF-699) |
| Legacy repository | system | the read-only input: a folder of source code in any language (RF-100..RF-149) |
| Ollama | system | local model server; zero-cost provider (RF-401) |
| OpenAI API | system | cloud provider (RF-402) |
| Anthropic API | system | cloud provider (RF-404) |
| OpenAI-compatible APIs | system | OpenRouter, Groq, DeepSeek, Gemini's compatible endpoint and similar (RF-403) |
| GitHub Pages | system | hosts the published sample report (RF-800) |

## 3. Glossary

| Term | Meaning |
|---|---|
| Legacy repository | The folder being analysed. Rosetta never writes inside it (RF-005). |
| Project | One legacy repository plus its Rosetta configuration file and output folder. |
| Output folder | The folder where every run writes; it must be outside the legacy repository. Layout in [data-model.md](../data-model.md). |
| Run | One execution of one stage (`scan`, `understand`, `verify`, `report`, `plan`), stored in its own run folder with a manifest. |
| Code map | The deterministic result of `scan` (`codemap.json`): files, languages, sizes, token estimates, entry points, artefacts, symbols and references where a language pack exists, and areas. |
| Map level | How rich the code map is for a file: `coarse` (universal layer only) or `symbols` (a language pack ran). |
| Area | A named group of files that belong together (for example a folder or feature); the unit of work for one agent task. |
| Language pack | A plug-in that adds symbols, references and routes for one language, built on tree-sitter or another parser. |
| Role | A job a model does: `reader` (area agents), `verifier`, `planner`, `summariser`. Each role has its own provider, model and optional cap. |
| Agent task | One agent's job in a run, for one area, with its own turn limit, transcript and usage. |
| Card | One finding, stored as Markdown with a metadata header. Types: `FEAT` feature, `BR` business rule, `ENT` data entity, `INT` integration, `OQ` open question. |
| Claim | One checkable statement inside a card. |
| Citation | A reference `path:startLine-endLine` (path relative to the legacy repository root) that supports a claim. |
| Claim status | `Proposed`, `CitationInvalid`, `Supported`, `Rejected`, `Unverified` (canonical list in [architecture.md](../architecture.md)). |
| Confidence | The agent's own rating of a claim: `High`, `Medium`, `Low`. Separate from the verifier's status. |
| Verdict | The verifier's result for one claim: the status and a one-line reason. |
| Answer | The developer's answer to an `OQ` card, kept in the project's answers file. |
| Egress | Any content sent to a provider. Every egress passes the egress guard (RF-140..RF-149). |
| Budget guard | The component that meters every model call and enforces caps (RF-421, RF-422). |
| Price table | Per provider and model: price per million input tokens, output tokens and cached input tokens, and currency. |
| Cost report | Tokens and cost of a run by role, agent task, provider and model (RF-426). |
| Hand-off package | The output of `plan`: specification, target architecture, ADRs, data mapping, roadmap and task cards (RF-600..RF-699). |
| Golden set | Hand-checked findings for a demo repository used to score runs (RNF-006). |
| Recorded response | A saved provider response replayed by the fake provider in tests (ADR-008). |
| M1 | The milestone due 2026-10-26 (DEC-04). |

## 4. Open questions

Answers are recorded in the Status column. A question never blocks work silently: it has an owner, the phase or card
that needs the answer, and a default that applies until it is answered. Status is one of `Open`,
`Default applies`, `Answered (DEC-nn)` or `Withdrawn`. An answered question keeps its row; the answer itself lives in
the decision log.

| Id | Question | Owner | Needed by | Default | Status |
|---|---|---|---|---|---|
| Q-01 | When is the master's final delivery (after the M1 milestone)? | Product owner | P2 | Phases P2..P4 are sized, not dated, until the date is known | Default applies |
| Q-02 | What format and length should the M1 video have? | Product owner | P1 (video card) | About 5 minutes: an animated explainer made with Claude plus a clip of a real terminal run | Default applies |
| Q-03 | In which language are the slides and the video? | Product owner | P1 (slides card) | Spanish (the master is taught in Spanish); the repository stays English | Default applies |
| Q-04 | Which local model runs the `reader` role on the owner's machine (8 GB VRAM)? | Product owner, with the spike card | P1 (spike card) | The best 7-9B tool-calling coding model that fits in 8 GB, chosen by a spike that runs one area and scores it | Default applies |
| Q-05 | Which second demo target, in a different stack, follows the milestone? | Product owner | P4 | An old open-source PHP or Java business application under MIT or Apache-2.0, chosen after M1 | Default applies |
| Q-06 | Does `plan` take the target stack from the developer, or propose it? | Product owner | P3 | The developer passes `--target "<stack>"`; without it, `plan` proposes two target options as an ADR with trade-offs and asks the developer to choose | Default applies |
| Q-07 | Is "Rosetta" the final name and package name? | Product owner | P3 | Keep "Rosetta" as the display name; the package name is chosen when publishing (Q-08) to avoid registry conflicts | Default applies |
| Q-08 | Is Rosetta published to the npm registry in R1? | Product owner | P3 | No: R1 runs from source with `npm` scripts; a scoped package is published in R2 | Default applies |
| Q-09 | Which Node.js version is the baseline? | Product owner | P1-01 | The current Node.js LTS line installed on the owner's machine, pinned in `.nvmrc` and `package.json` engines | Answered (DEC-27) |
| Q-10 | Where are Ollama and its models installed? | Product owner | P1 (spike card) | Ollama for Windows, models in `E:\Ollama\models` through the `OLLAMA_MODELS` environment variable (drive C: has 17 GB free) | Default applies |
| Q-11 | How does the developer answer open questions? | Product owner | P2 | An `answers.md` file generated from the `OQ` cards, edited in any editor; an interactive `rosetta answer` prompt is a Should | Default applies |
| Q-12 | Which model runs the build verifier? | Product owner | first P1 card | Claude Opus 5.5 for cards of difficulty 1-9 and Claude Fable for difficulty 10 (agents `verifier` and `verifier-fable`) | Default applies |

## 5. Functional requirements (R1)

### 5.1 CLI, configuration and runs (RF-001..RF-099)

**RF-001 Initialise a project** - R1 (M1) - Must - Source DEC-14 - ADR-002
As a developer I want `rosetta init <legacy-path>` to create a configuration file, an output folder and a
`.rosettaignore` template so that I can start analysing in one command.
- Given an existing legacy folder, when I run `rosetta init <legacy-path>`, then `rosetta.config.yaml`, `.rosettaignore` and the output folder are created in the current folder with commented defaults.
- Given a configuration file already exists, when I run `init` again, then nothing is overwritten and the CLI exits with an error code and a message naming the existing file.
- Given a path that does not exist, when I run `init`, then the CLI exits with an error code and no file is created.
Verification: integration tests on a temporary folder.

**RF-002 Validate configuration** - R1 (M1) - Must - Source DEC-09, DEC-13 - ADR-003, ADR-007
As a developer I want the configuration (providers, models per role, caps, price table, paths) validated before any
work starts so that a typo never costs money.
- Given a valid configuration, when any command starts, then it loads and continues.
- Given an unknown provider, a missing model for a role, a negative cap or an output folder inside the legacy repository, when any command starts, then it stops before any model call with one error line per problem, each with an error code.
- Given an API key referenced by environment variable name, when the variable is missing, then the command stops before any model call and names the variable, never a value.
Verification: unit tests on the schema; integration test per failure.

**RF-003 Record every run** - R1 (M1) - Must - Source RNF-004 - ADR-005
As a developer I want every run stored in its own folder with a manifest so that I can explain and repeat any
result.
- Given any stage runs, when it starts, then a run folder `runs/<yyyyMMdd-HHmmss>-<stage>/` is created with `manifest.json` holding the Rosetta version, stage, options, code map hash, prompt versions, provider, model and settings per role, and caps.
- Given the run ends for any reason (done, cap reached, error, interrupted), when it ends, then the manifest records the end state and time.
Verification: integration tests with the fake provider, including an interrupted run.

**RF-004 Show progress** - R1 (M1) - Must - Source DEC-13 - ADR-007
As a developer I want to see what the run is doing and what it costs while it runs so that I can stop it early.
- Given an `understand` run, when it runs in a terminal, then each agent task shows its area, turn count and status, and a live meter shows tokens and cost so far against the cap.
- Given `--json`, when the run ends, then a machine-readable summary is printed to standard output and progress goes to standard error.
Verification: end-to-end test capturing output; manual check in a terminal.

**RF-005 Never modify the legacy repository** - R1 (M1) - Must - Source DEC-17 - ADR-006
As a developer I want a guarantee that Rosetta never writes inside the analysed repository so that my code is safe.
- Given any command, when it writes a file, then the path is inside the output folder; any write outside it fails with an error code.
- Given an output folder configured inside the legacy repository, when a command starts, then it stops with an error code (RF-002).
- Given an agent, when it asks for a tool that writes, then no such tool exists: the agent tool set is read-only.
Verification: unit tests on the file-system adapter; integration test comparing a hash of the legacy folder before and after a full run.

**RF-006 Resume a stopped run** - R1 - Should - Source DEC-13 - ADR-007
As a developer I want to resume a run that stopped at a cap or failed so that finished work is not paid for twice.
- Given a run that stopped with unfinished agent tasks, when I run `rosetta understand --resume <run-id>` with a raised cap, then only unfinished tasks and unverified claims are processed and the results join the same run.
Verification: integration test with the fake provider.

**RF-007 Stable exit codes and error codes** - R1 (M1) - Must - Source interview 2026-10-09 - ADR-002
As a developer I want predictable exit codes and error codes so that I can script Rosetta and look errors up.
- Given success, when a command ends, then it exits 0; given a usage or configuration error, it exits 2; given a run stopped by a cap, it exits 3; given any other failure, it exits 1.
- Given any failure, when it is printed, then it shows an `RST-xxxx` code, a plain message and the next step; the stack trace appears only with `--verbose`.
Verification: unit tests on the error mapper; integration tests per exit code.

**RF-008 Export a run as a zip file** - R1 (M1) - Must - Source DEC-24 - ADR-009
As a developer I want to download a run, or a hand-off package, as one zip file with its full folder structure so
that I can share or archive it in one piece.
- Given a finished run, when I run `rosetta export <run-id> --zip`, then a zip file with the run folder's complete structure is written to the output folder and its path is printed.
- Given a hand-off package, when I run `rosetta export <run-id> --handoff --zip`, then only the `handoff/` folder is zipped.
- Given a run that is still in progress, when I export it, then the CLI refuses with an error code.
Verification: integration test that unzips the file and compares the tree with the run folder.

### 5.2 Scan and file access (RF-100..RF-199)

**RF-100 Walk the repository** - R1 (M1) - Must - Source DEC-11 - ADR-004
As a developer I want `rosetta scan` to list every relevant file so that later stages see the whole system.
- Given a legacy repository, when I run `scan`, then every file is listed except default ignores (version-control folders, build output such as `bin/`, `obj/`, `node_modules/`, `packages/`, and binary files) and paths matching `.rosettaignore`.
- Given a file larger than the configured limit, when scanning, then it is listed with a `skipped: too large` reason and never read by agents.
Verification: integration tests on fixture repositories.

**RF-101 Detect languages and size** - R1 (M1) - Must - Source DEC-11 - ADR-004
As a developer I want each file's language, line count and estimated tokens so that cost and coverage can be planned.
- Given any file, when scanning, then its language is detected by extension and content heuristics (unknown is a valid value), and its line count and estimated token count are recorded.
Verification: unit tests per language mapping.

**RF-102 Find entry points and artefacts in any stack** - R1 (M1) - Must - Source DEC-11 - ADR-004
As a developer I want pages, entry points, configuration, database scripts and dependency manifests identified for
any stack so that agents know where behaviour starts.
- Given files such as `.aspx`, `.asp`, `.jsp`, `.php`, controllers, `Program`/`main` files, `web.config`/`app.config`/`.properties`/`.ini`, `.sql` scripts and manifests (`packages.config`, `*.csproj`, `pom.xml`, `composer.json`, `package.json`), when scanning, then each is tagged with its artefact kind.
- Given an unfamiliar stack, when scanning, then files with no known kind are still listed and available to agents.
Verification: unit tests per artefact rule; fixture repositories in two stacks.

**RF-103 Extract embedded SQL** - R1 (M1) - Should - Source DEC-11 - ADR-004
As a developer I want SQL statements found in string literals and `.sql` files listed with their location so that
data rules are not missed.
- Given a string literal or script containing `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `EXEC` or `CREATE`, when scanning, then the statement and its `path:line` are recorded in the code map.
Verification: unit tests with fixture strings.

**RF-104 Group files into areas** - R1 (M1) - Must - Source DEC-11 - ADR-004
As a developer I want the repository split into areas so that each agent task stays small enough for its model.
- Given a scanned repository, when areas are built, then files are grouped by folder and, where a language pack provides references, by references; no area exceeds the configured token budget per area, and oversized groups are split.
- Given areas defined in the configuration, when scanning, then they replace the automatic grouping for the files they match.
Verification: unit tests on grouping; fixture with an oversized folder.

**RF-105 Write the code map** - R1 (M1) - Must - Source DEC-11 - ADR-004
As a developer I want `codemap.json` and a readable `scan-summary.md` so that I and the agents can see the system at a glance.
- Given a finished scan, when it is written, then `codemap.json` validates against its schema and `scan-summary.md` lists languages, artefact counts, areas with file and token counts, and the map level per area.
Verification: schema validation test; snapshot test of the summary.

**RF-106 Deterministic scan** - R1 (M1) - Must - Source RNF-004 - ADR-004
As a developer I want the same repository to give the same code map so that runs can be compared.
- Given an unchanged repository, when `scan` runs twice, then both `codemap.json` files are byte-identical (stable ordering; times only in the manifest).
Verification: integration test running scan twice.

**RF-110 Language pack interface** - R1 (M1) - Must - Source DEC-11 - ADR-004
As a maintainer I want a plug-in interface for languages so that support for a new language never touches the core.
- Given a language pack registered for some extensions, when scanning, then the pack adds symbols (types, functions, methods), references and routes for those files and their map level is `symbols`.
- Given a pack that fails on one file, when scanning, then that file falls back to `coarse` with a warning and the scan continues.
Verification: unit tests with a test pack; integration test with a failing pack.

**RF-111 C# language pack** - R1 (M1) - Must - Source DEC-12 - ADR-004
As a developer analysing .NET code I want C# symbols and WebForms links so that agents can follow the code.
- Given C# files, when scanning, then classes, interfaces, methods and properties with their line ranges are recorded.
- Given an `.aspx`/`.ascx`/`.master` file with a code-behind, when scanning, then the page is linked to its code-behind class.
- Given an Entity Framework `DbContext`, when scanning, then its entity sets are recorded as candidate entities.
Verification: unit tests on fixtures taken from the demo app (cited, MIT).

**RF-112 Coarse fallback for any language** - R1 (M1) - Must - Source DEC-11 - ADR-004
As a developer with an unusual stack I want Rosetta to work without a language pack so that no stack is excluded.
- Given a repository in a language with no pack, when the full pipeline runs, then scan, understand and report complete, and the report states the map level per area.
Verification: end-to-end test on a small fixture in a language without a pack.

**RF-140 Ignore file** - R1 (M1) - Must - Source DEC-16 - ADR-006
As a developer I want paths in `.rosettaignore` never scanned or read so that I control what leaves my machine.
- Given a pattern in `.rosettaignore` (gitignore syntax), when scanning or when an agent asks to read a matching path, then the path is absent from the code map and the read is refused with a reason the agent sees.
Verification: unit tests on matching; integration test of a refused read.

**RF-141 Mask secrets before egress** - R1 (M1) - Must - Source DEC-16 - ADR-006
As a developer I want secrets masked before any content goes to a provider so that credentials never leak.
- Given content with a connection-string password, an API key, a token, a private key block or a `password=` setting, when it is about to be sent, then each secret is replaced by `[MASKED:<kind>]` and the count per kind is added to the run record.
- Given masking removes a value, when the agent reads the content, then line numbers are unchanged so citations stay valid.
Verification: unit tests with a fixture of secret patterns.

**RF-142 Record egress** - R1 (M1) - Must - Source DEC-16 - ADR-006
As a developer I want a record of exactly what was sent where so that I can audit a run.
- Given any model call, when it is made, then the run's egress log records the provider, model, role, agent task, and the path and line range of every file excerpt included.
Verification: integration test with the fake provider.

**RF-143 Warn before using a cloud provider** - R1 (M1) - Must - Source DEC-16 - ADR-006
As a developer I want to confirm before code leaves my machine so that I never send it by accident.
- Given a run whose roles use a non-local provider, when it starts in an interactive terminal, then it names the providers and asks for confirmation; `--yes` skips the question.
- Given a non-interactive session without `--yes`, when the run starts, then it stops with an error code before any call.
Verification: integration tests for both cases.

**RF-144 Limit excerpt size** - R1 - Should - Source DEC-16 - ADR-006
As a developer I want a maximum number of lines per read so that one call cannot send a huge file.
- Given a read request beyond the configured maximum, when it is served, then it is cut to the maximum and the agent is told the remaining range.
Verification: unit test.

### 5.3 Understand: agents, cards, coverage, open questions (RF-200..RF-299)

**RF-200 Plan agent tasks per area** - R1 (M1) - Must - Source DEC-15 - ADR-003
As a developer I want `rosetta understand` to create one agent task per area, or only for the areas I name, so that
work is split and controllable.
- Given a code map, when I run `understand`, then one agent task per area is planned and run with the `reader` role.
- Given `--area <name>` (repeatable), when I run `understand`, then only those areas run; an unknown name stops the run with an error code listing valid names.
Verification: integration tests with the fake provider.

**RF-201 Run the agent loop with read-only tools** - R1 (M1) - Must - Source DEC-09, DEC-17 - ADR-003, ADR-006
As a developer I want each agent to explore its area with tools so that it reads what it needs and nothing else.
- Given an agent task, when it runs, then the agent may call `list_area_files`, `read_file(path, startLine, endLine)`, `grep(pattern, pathGlob)` and `codemap_query(symbol or path)`, all read-only and all passing the egress guard.
- Given the agent reaches the configured maximum turns, when the next turn would start, then the task ends, its cards so far are saved, and the task is marked `turn limit reached`.
- Given a tool call with invalid arguments, when it is executed, then the agent receives an error result it can correct, and the error is logged.
Verification: integration tests with recorded responses including a bad tool call.

**RF-202 Produce valid cards** - R1 (M1) - Must - Source DEC-18 - ADR-005
As a developer I want every agent result in one strict card format so that cards can be checked and rendered.
- Given an agent's final answer, when it is parsed, then each card validates against the card schema: type, title, area, summary, claims, each claim with at least one citation, confidence, and for `OQ` the question and why it matters.
- Given invalid output, when parsing fails, then the agent gets one repair attempt with the validation errors; if that also fails, the raw output is saved and the task is marked `invalid output`.
Verification: unit tests on the schema and parser; integration test of the repair path.

**RF-203 Stable card ids** - R1 (M1) - Must - Source DEC-18 - ADR-005
As a developer I want readable ids such as `BR-007` so that cards can be referenced in discussion and in the plan.
- Given cards from a run, when ids are assigned, then each type is numbered `FEAT-001`, `BR-001`, `ENT-001`, `INT-001`, `OQ-001` in order of area and appearance, unique within the run.
Verification: unit test.

**RF-204 Write cards and the specification** - R1 (M1) - Must - Source DEC-18 - ADR-005
As a developer I want each card as a Markdown file plus an index and a readable specification so that I can read
and link the results.
- Given a finished agent task, when results are written, then each card is a Markdown file with a metadata header under `cards/<type>/`, `cards/index.json` lists all cards, and `spec.md` presents them per area with links.
Verification: snapshot tests of output files.

**RF-205 Support models without native tool calling** - R1 (M1) - Should - Source Q-04 - ADR-003
As a developer using a small local model I want a text protocol for tools so that models without native tool calling still work.
- Given a model configured with `toolMode: text`, when the agent runs, then tool calls are requested and parsed as JSON blocks in plain text, with the same validation as native calls.
Verification: integration test with recorded text-protocol responses.

**RF-230 Coverage per area** - R1 - Must - Source RFC-001 risks - ADR-005
As a developer I want to know which files each agent actually read so that silent gaps are visible.
- Given a finished agent task, when results are written, then a coverage table lists every file in the area as read (with line ranges) or not read, and the run summary shows the percentage of area tokens read.
Verification: integration test with the fake provider.

**RF-240 Collect open questions** - R1 - Must - Source DEC-15 - ADR-005
As a developer I want all `OQ` cards gathered into one answers file so that I can answer them in one place.
- Given a run with `OQ` cards, when it ends, then `answers.md` in the project folder lists each open question with its card id, context and an empty answer field; existing answers are kept.
Verification: integration test.

**RF-241 Re-run with answers** - R1 - Must - Source DEC-15 - ADR-003
As a developer I want my answers used when areas are analysed again so that the specification improves.
- Given answered questions, when I run `understand --with-answers`, then the affected areas run again with the answers as context, the answered `OQ` cards are marked `Answered`, and new or changed cards are listed in the run summary.
Verification: integration test with recorded responses.

**RF-242 Answer interactively** - R1 - Could - Source Q-11 - ADR-002
`rosetta answer` walks through unanswered questions in the terminal and writes `answers.md`.
Verification: manual check.

**RF-250 Consolidate cards across areas** - R1 - Should - Source interview 2026-10-09 - ADR-005
As a developer I want duplicate entities and rules found by several agents merged so that the specification has no repeats.
- Given cards from several areas describing the same entity or rule, when consolidation runs with the `summariser` role, then they are merged into one card keeping every citation, and the merge is recorded.
Verification: integration test with recorded responses.

### 5.4 Verifier (RF-300..RF-399)

**RF-300 Check citations exist** - R1 (M1) - Must - Source DEC-19 - ADR-005
As a developer I want every citation checked against the repository so that invented references are caught at no cost.
- Given a claim, when step 1 runs, then each citation's file must exist in the code map and its line range must lie inside the file; otherwise the claim becomes `CitationInvalid` with the reason.
Verification: unit tests with valid and invalid citations.

**RF-301 Judge each claim against its evidence** - R1 - Must - Source DEC-19 - ADR-005
As a developer I want a model to check that the cited lines support each claim so that unsupported statements are flagged.
- Given a claim that passed step 1, when step 2 runs with the `verifier` role, then the model sees the claim and only the cited lines with a small margin, and returns `Supported` or `Rejected` with a one-line reason.
- Given a verifier answer that is not one of the allowed values, when it is parsed, then the claim gets one retry and otherwise stays `Unverified`.
Verification: integration tests with recorded responses.

**RF-302 Keep rejected claims** - R1 (M1) - Must - Source DEC-19 - ADR-005
As a developer I want rejected and invalid claims kept and visible so that nothing is silently removed.
- Given any verdict, when results are written, then the card keeps every claim with its status and reason; outputs never delete a claim.
Verification: integration test.

**RF-303 Verification summary** - R1 - Must - Source DEC-19 - ADR-005
As a developer I want counts per status and area so that I can judge the run's reliability.
- Given a verified run, when it ends, then the summary shows claims per status per area and the overall supported share.
Verification: snapshot test.

**RF-304 Leave claims unverified when stopped** - R1 - Should - Source DEC-13 - ADR-007
As a developer I want claims not yet checked when a cap is reached marked `Unverified` so that I can resume verification later (RF-006).
- Given a cap reached during verification, when the run stops, then the claims not yet judged are `Unverified`.
Verification: integration test.

### 5.5 Providers and cost control (RF-400..RF-499)

**RF-400 One provider port** - R1 (M1) - Must - Source DEC-09 - ADR-003
As a maintainer I want all model access through one interface so that providers are swappable.
- Given any agent, verifier or planner call, when it is made, then it goes through the `LlmProvider` port with a system prompt, messages and tool definitions, and returns text, tool calls and usage (input, output and cached input tokens) in one shape for every provider.
Verification: a contract test suite run against every adapter with recorded responses.

**RF-401 Ollama adapter** - R1 (M1) - Must - Source DEC-09, DEC-23 - ADR-003
As a developer I want to run every role on local models so that development costs nothing and code stays local.
- Given Ollama running locally with the configured model, when a role uses provider `ollama`, then calls succeed with native tool calling where the model supports it, or the text protocol (RF-205).
- Given Ollama not running or the model not pulled, when the run starts, then it stops before any work with an error code and the command to fix it.
Verification: contract test with recorded responses; manual run against Ollama.

**RF-402 OpenAI adapter** - R1 (M1) - Must - Source DEC-09 - ADR-003
As a developer I want to use OpenAI models for any role so that I can use stronger models where it matters.
- Given an OpenAI key in the environment and a configured model, when a role uses provider `openai`, then calls succeed with tool calling and usage is reported, including cached tokens when the API reports them.
Verification: contract test with recorded responses; one manual live call.

**RF-403 OpenAI-compatible adapter** - R1 - Should - Source DEC-09 - ADR-003
As a developer I want any OpenAI-compatible service through a base URL and key so that new providers need no code.
- Given a provider of kind `openai-compatible` with a base URL and key variable, when a role uses it, then calls succeed through the same contract.
Verification: contract test with recorded responses.

**RF-404 Anthropic adapter** - R1 - Should - Source DEC-09 - ADR-003
As a developer I want to use Claude models with prompt caching so that long agent loops cost less.
- Given an Anthropic key and model, when a role uses provider `anthropic`, then calls succeed with tool calling, the stable prompt prefix is marked for caching, and cached-token usage is reported.
Verification: contract test with recorded responses; one manual live call.

**RF-405 Model per role** - R1 (M1) - Must - Source DEC-09 - ADR-003
As a developer I want to choose the provider and model for each role so that I can balance cost and quality.
- Given a configuration that sets `reader`, `verifier`, `planner` and `summariser` to different providers and models, when a run uses each role, then each call goes to its configured model and the cost report shows them separately.
Verification: integration test with two fake providers.

**RF-406 Retry and fail cleanly** - R1 (M1) - Must - Source RFC-001 failure paths - ADR-003
As a developer I want temporary provider errors retried and permanent ones to stop only the affected task so that a run survives hiccups.
- Given a rate limit, timeout or server error, when a call fails, then it is retried with exponential back-off up to the configured attempts, honouring any retry-after hint.
- Given retries are exhausted or the error is permanent (bad key, unknown model), when the call fails, then the agent task stops, its partial cards are saved, and the run continues with other tasks unless the error affects every task.
Verification: unit tests with a fake provider that fails on demand.

**RF-407 Test provider access** - R1 (M1) - Should - Source interview 2026-10-09 - ADR-003
As a developer I want `rosetta providers test` to check every configured provider and model with one tiny call so that I find setup problems before a long run.
- Given configured providers, when I run the command, then each role shows reachable or the error, and the cost of the test calls.
Verification: integration test with fake providers.

**RF-420 Price table** - R1 (M1) - Must - Source DEC-13 - ADR-007
As a developer I want an editable price table per provider and model so that cost figures match what I pay.
- Given the default price table and my overrides in the configuration, when cost is computed, then input, output and cached input tokens are priced per million tokens in the table's currency; Ollama models cost zero.
Verification: unit tests on pricing.

**RF-421 Meter every call** - R1 (M1) - Must - Source DEC-13 - ADR-007
As a developer I want every model call metered so that cost is never invisible.
- Given any model call, when it returns, then the budget guard records its tokens and cost against the run, role, agent task, provider and model before the result reaches the caller.
- Given a provider that reports no usage, when the call returns, then tokens are estimated, marked `estimated`, and still counted.
Verification: unit tests; contract test asserts every adapter returns usage.

**RF-422 Hard cap per run** - R1 (M1) - Must - Source DEC-13 - ADR-007
As a developer I want a token and cost cap per run that stops the run cleanly so that I never overspend.
- Given a run cap, when the next call's worst case (prompt tokens plus maximum output) would exceed it, then the call is not made, running tasks stop, all results so far are saved, and the run ends with exit code 3 and the state `cap reached`.
- Given no cap configured, when a run with a paid provider starts, then the default cap from the configuration template applies.
Verification: integration tests with the fake provider.

**RF-423 Cap per role** - R1 - Should - Source DEC-13 - ADR-007
As a developer I want a separate cap per role so that the verifier cannot consume the readers' budget.
- Given role caps, when a role reaches its cap, then only that role's calls stop.
Verification: integration test.

**RF-424 Live cost meter** - R1 (M1) - Must - Source DEC-13 - ADR-007
As a developer I want to see tokens and cost grow during the run so that I can interrupt it.
- Given a run in a terminal, when calls complete, then the meter updates with tokens and cost so far, the cap, and the share used.
Verification: end-to-end output test.

**RF-425 Estimate before running** - R1 - Must - Source DEC-13 - ADR-007
As a developer I want `rosetta estimate` and a pre-run estimate so that I know the cost before spending.
- Given a code map and configuration, when I run `rosetta estimate understand`, then it shows the expected tokens and cost per role as a low, likely and high range, with the assumptions used.
- Given an `understand` run whose likely estimate exceeds the configured confirmation threshold, when it starts interactively, then it shows the estimate and asks to continue.
Verification: unit tests on the estimator; RNF-012 measures accuracy.

**RF-426 Cost report** - R1 (M1) - Must - Source DEC-13 - ADR-007
As a developer I want a cost report saved with every run so that I can compare providers and runs.
- Given any run that made model calls, when it ends, then `cost.md` and `cost.json` list tokens (input, output, cached) and cost by role, agent task, provider and model, with totals and the price table version.
Verification: snapshot test.

**RF-427 Unpriced models** - R1 - Should - Source DEC-13 - ADR-007
As a developer I want a warning when a paid model has no price so that the cap cannot be bypassed by a missing price.
- Given a non-local model missing from the price table, when the run starts, then it stops with an error code unless `--allow-unpriced` is given, in which case cost is shown as unknown and only the token cap applies.
Verification: integration test.

### 5.6 Report (RF-500..RF-599)

**RF-500 HTML report** - R1 - Must - Source DEC-05 - ADR-005
As a developer I want an HTML report of a run so that I and others can explore the findings.
- Given a finished run, when I run `rosetta report <run-id>`, then a static site is written with a dashboard (cards by type, claims by status, coverage, cost), a page per area, a page per card, the open questions and the cost report.
Verification: snapshot tests of generated pages; manual check in a browser.

**RF-501 Self-contained and publishable** - R1 - Must - Source DEC-04 - ADR-002
As a developer I want the report to work from the file system and on GitHub Pages so that I can share it without a server.
- Given the generated report, when it is opened from disk or served from a sub-path, then every page, style and link works with no external network request.
Verification: end-to-end test with a headless browser from disk and from a sub-path.

**RF-502 Show the evidence** - R1 - Must - Source DEC-19 - ADR-005
As a reader I want each claim's cited lines shown next to it so that I can check it in seconds.
- Given a claim with citations, when its card page is shown, then each citation displays the cited lines with a few lines of context, line numbers, and the claim status and reason.
Verification: snapshot test.

**RF-503 Filter findings** - R1 - Should - Source interview 2026-10-09 - ADR-002
As a reader I want to filter cards by type, area and status so that I can focus.
- Given the cards list, when a filter is chosen, then only matching cards are shown, without a server.
Verification: end-to-end test.

**RF-505 Download everything from the report** - R1 - Must - Source DEC-24 - ADR-009
As a reader of a published report I want a "Download all" link so that I get every card, the specification and the
folder structure without cloning anything.
- Given a generated report, when it is written, then it includes a zip of the run (RF-008) and, when a hand-off package exists, a second zip of it, linked from the dashboard; the links work from disk and on GitHub Pages.
Verification: end-to-end test that downloads and unzips both files.

**RF-504 Markdown report for the milestone** - R1 (M1) - Must - Source DEC-04, DEC-18 - ADR-005
As a developer I want a Markdown report before the HTML one exists so that the milestone has a readable output.
- Given a finished run, when I run `rosetta report <run-id> --format md`, then `report.md` links the specification, every card, the coverage and the cost report.
Verification: snapshot test.

### 5.7 Plan: the hand-off package (RF-600..RF-699)

**RF-600 Produce the hand-off package** - R1 - Must - Source DEC-10 - ADR-005
As a developer I want `rosetta plan` to turn verified findings and answers into a modernisation package so that a team can start building.
- Given a run with verified cards and answers, when I run `rosetta plan <run-id> --target "<stack>"`, then a `handoff/` folder is written using only `Supported` claims and answered questions; `Rejected`, invalid and unverified claims are listed as excluded with their ids.
- Given no `--target`, when `plan` runs, then it proposes target options as decided by Q-06.
Verification: integration test with recorded responses.

**RF-601 Package contents** - R1 - Must - Source DEC-10 - ADR-005
As a modernisation team I want a complete, standard package so that we can plan the work without asking.
- Given a produced package, when it is opened, then it contains a README with reading order, a requirements specification, a target architecture, ADRs for the main decisions, a mapping of legacy entities to target entities, a roadmap with phases and exit criteria, task cards with acceptance criteria, and a risks and open-questions list.
Verification: schema and structure test of the package; manual review against the demo app.

**RF-602 Trace the plan to the code** - R1 - Must - Source DEC-19 - ADR-005
As a modernisation team I want every requirement in the package linked to its source cards and citations so that we can check any statement in the legacy code.
- Given a requirement in the package, when it is read, then it lists the card ids it comes from and those cards list their citations.
Verification: structure test: no requirement without a source card.

**RF-603 Tool-agnostic output** - R1 - Must - Source DEC-10 - ADR-005
As a modernisation team I want plain Markdown with no dependency on Rosetta, a build tool or an AI vendor so that we can use it any way we like.
- Given the package, when it is read outside Rosetta, then it is plain Markdown and Mermaid, with no Rosetta-specific syntax.
Verification: structure test.

### 5.8 Milestone hand-in artefacts (RF-800..RF-899)

**RF-800 Publish the sample report** - R1 (M1) - Must - Source DEC-04 - ADR-002
As the product owner I want the demo run's report published on GitHub Pages so that the milestone has a deployment URL.
- Given a finished demo run, when the publish step runs, then the report is copied to `site/` and served by GitHub Pages for the public repository, and the README links it.
Verification: manual check of the public URL.

**RF-801 Reproducible quick start** - R1 (M1) - Must - Source DEC-04 - ADR-002
As a reviewer I want the README to reproduce the demo run with a local model so that I can check the tool works.
- Given a clean machine with Node.js and Ollama, when I follow the README quick start, then the demo `scan` and `understand` on the chosen area complete.
Verification: manual walk-through on a clean folder.

**RF-802 Slides and video** - R1 (M1) - Must - Source DEC-04 - -
As the product owner I want slides and a video that present Rosetta so that the milestone hand-in is complete.
- Given the milestone, when it is handed in, then the slides URL and the video URL are linked from the README; the format follows Q-02 and Q-03.
Verification: manual check of both URLs.

## 6. Non-functional requirements

| Id | Requirement | Verification |
|---|---|---|
| RNF-001 | **Portability**: runs on Windows, macOS and Linux with the baseline Node.js LTS; paths are handled with the platform's separators and citations always use forward slashes. | CI on Windows and Linux; manual check on the owner's Windows machine |
| RNF-002 | **Robustness**: an interrupted run (Ctrl+C, crash, cap) leaves its run folder consistent: finished cards, the manifest end state and the cost so far are on disk. | integration test that interrupts a run |
| RNF-003 | **Secrets**: no API key, token or masked secret is ever written to the repository, the output folder or a log; keys come only from environment variables or a git-ignored `.env`. | test that scans outputs for key patterns; secret scanning on the public repository |
| RNF-004 | **Reproducibility**: every run records the Rosetta version, the code map hash, prompt versions, provider, model and parameters per role, so it can be explained and repeated. | integration test on the manifest |
| RNF-005 | **Offline tests**: the full automated suite passes with no network, using the fake provider and recorded responses; core logic coverage is at least 80%. | CI with network disabled; coverage report |
| RNF-006 | **Measured quality**: a golden set of hand-checked findings for the demo app scores each evaluated run; R1 targets at least 90% precision of `Supported` claims and at least 70% recall of golden business rules with a cloud verifier; local-model results are measured and reported, not targeted. | `npm run eval` against the golden set |
| RNF-007 | **Performance**: `scan` of the demo app takes under 10 seconds and of a 100,000-line repository under 2 minutes on the owner's machine. | timing in the scan summary |
| RNF-008 | **Usability**: every command has `--help` with an example; every error shows a code, a plain message and the next step. | review of help output; error-mapper tests |
| RNF-009 | **Licensing**: Rosetta is MIT-licensed; any third-party code used as a fixture is a small excerpt with its source and licence cited. | review at each phase exit |
| RNF-010 | **Report accessibility**: the HTML report meets WCAG 2.1 AA for contrast, keyboard navigation and headings, in light and dark themes. | automated accessibility check plus manual keyboard test |
| RNF-011 | **Local-first**: the whole pipeline works with Ollama only and no internet connection. | end-to-end run with the network disabled and Ollama running |
| RNF-012 | **Estimate accuracy**: the actual cost of an `understand` run falls within 30% of the likely estimate on the demo app. | comparison of `estimate` and `cost.json` over three runs |
| RNF-013 | **Clean Architecture**: the domain and application layers import nothing from infrastructure or presentation; dependencies point inward only; checked automatically on every pull request. | dependency rule check in `npm run verify` (ADR-009) |

## 7. Deferred requirements (reserved ids, not commitments)

| Range | Release | Intent |
|---|---|---|
| RF-700..RF-799 | R2 | Claude Code plugin run mode: the same prompts and card formats as skills and subagents, writing the same output folder, so a final run can use a Claude subscription |
| RF-900..RF-999 | R2 | Multi-target evaluation and provider comparison: a second demo target in another stack (Q-05) and a report comparing quality and cost per provider and model |

## 8. Traceability matrix

Each requirement group traces to where its behaviour comes from, the ADRs that shape it, the phase that delivers it
and the task cards that build it. The cards column is filled when the build plan is written and kept current when
cards are added. A requirement with no card, or a card with no requirement, is a finding in review.

| Requirement group | Source | ADR | Phase | Cards |
|---|---|---|---|---|
| RF-001..RF-008 | DEC-13, DEC-14, DEC-17, DEC-24 | ADR-002, ADR-006, ADR-007, ADR-009 | P1 (RF-006: P2) | to be filled with the build plan |
| RF-100..RF-112 | DEC-11, DEC-12 | ADR-004 | P1 | to be filled with the build plan |
| RF-140..RF-144 | DEC-16 | ADR-006 | P1 (RF-144: P2) | to be filled with the build plan |
| RF-200..RF-205 | DEC-15, DEC-18 | ADR-003, ADR-005 | P1 | to be filled with the build plan |
| RF-230..RF-250 | DEC-15, DEC-18 | ADR-003, ADR-005 | P2 | to be filled with the build plan |
| RF-300, RF-302 | DEC-19 | ADR-005 | P1 | to be filled with the build plan |
| RF-301, RF-303, RF-304 | DEC-19 | ADR-005 | P2 | to be filled with the build plan |
| RF-400..RF-407 | DEC-09, DEC-23 | ADR-003 | P1 (RF-403, RF-404: P2) | to be filled with the build plan |
| RF-420..RF-427 | DEC-13 | ADR-007 | P1 (RF-423, RF-425, RF-427: P2) | to be filled with the build plan |
| RF-500..RF-505 | DEC-04, DEC-05, DEC-24, DEC-26 | ADR-002, ADR-005 | P3 (RF-504: P1) | to be filled with the build plan |
| RF-600..RF-603 | DEC-10 | ADR-005 | P3 | to be filled with the build plan |
| RF-800..RF-802 | DEC-04 | ADR-002 | P1 | to be filled with the build plan |
| RNF-001..RNF-013 | DEC-13, DEC-16, DEC-20, DEC-21, DEC-30, DEC-31 | ADR-002, ADR-006, ADR-007, ADR-008, ADR-009 | all | to be filled with the build plan |
| [Decision log](../decision-log.md) (all DEC ids) | - (product owner's decisions) | ADR-002..ADR-008 | all | - |
