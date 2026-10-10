# Architecture (living document)

| | |
|---|---|
| **Status** | Living |
| **Date** | 2026-10-10 |
| **Owner** | BlackLigth (blacklight0101) |
| **Related** | [RFC-001](rfc/RFC-001-rosetta.md) - [Requirements](spec/requirements.md) - [ADRs](adr/README.md) - [Conventions](conventions.md) - [Data model](data-model.md) - [Environments](environments-and-delivery.md) |

How Rosetta's pieces fit. This document is the canonical home of the **solution layout** (section 4), the **state
lists** (section 5) and the **port names** (section 7). It is updated in the same pull request that changes the
structure. Decisions and their trade-offs are in the ADRs; rules for writing code are in
[conventions.md](conventions.md).

## 1. Context

```mermaid
flowchart LR
  DEV[Developer]
  subgraph Machine["Developer's machine"]
    WEB[Browser<br/>live web UI]
    RST[Rosetta CLI<br/>+ loopback server]
    OUT[(rosetta-out/<br/>snapshots, runs)]
    OLL[Ollama]
  end
  GH[GitHub<br/>public repositories]
  CLOUD[Cloud providers<br/>OpenAI, Anthropic,<br/>OpenAI-compatible]
  PAGES[GitHub Pages<br/>sample report]
  DEV -- commands --> RST
  DEV -- GitHub URL, answers --> WEB
  WEB -- HTTP + server-sent events, 127.0.0.1 --> RST
  RST -- resolve ref, download snapshot --> GH
  RST -- reads snapshot, writes runs --> OUT
  RST -- HTTP --> OLL
  RST -- HTTPS, masked excerpts --> CLOUD
  OUT -. published by the owner .-> PAGES
```

Rosetta has one actor (the developer), reads legacy code only as commit-pinned snapshots of public GitHub
repositories, talks to model providers over their APIs, and shows its work live in a local web page (ADR-012).
Everything it produces is a file in the output folder.

## 2. Containers and components

There is one container: a Node.js 24 process started per command. While a run or `rosetta ui` is active it also
serves the web UI on the loopback interface (ADR-012). No hosted service, no database. Inside it:

| Component | Layer | Responsibility |
|---|---|---|
| CLI | presentation | parse commands, load and validate configuration, print progress and results, map errors to exit codes |
| Web server and UI | presentation | loopback HTTP server, session token, server-sent events, the single-page app and its API (start runs, answers, history) |
| Composition root | presentation | create every adapter and inject it into the use cases; the only place that knows concrete classes |
| Use cases | application | `scan`, `understand`, `verify`, `answer`, `report`, `plan`, `estimate`, `export`, `providers test` |
| Agent loop and orchestrator | application | plan agent tasks per area, run the tool-calling loop, collect cards |
| Verifier | application | step 1 citation check, step 2 model judgement (ADR-005) |
| Domain model | domain | code map, areas, cards, claims, citations, statuses, budgets, prices, runs |
| Provider adapters | infrastructure | Ollama, OpenAI, OpenAI-compatible, Anthropic, fake (tests) |
| Guards | infrastructure | egress guard (ADR-006), budget guard (ADR-007) as decorators of the provider port |
| GitHub source | infrastructure | parse URLs, resolve refs to SHAs, download and extract snapshots safely, build permalinks |
| File system adapters | infrastructure | snapshot reader (read-only, ignore rules), output writer (only inside the output folder) |
| Event sinks | infrastructure | terminal progress, server-sent events broadcaster, `events.jsonl` log |
| Scanner and language packs | infrastructure | universal layer, tree-sitter packs (ADR-004) |
| Writers | infrastructure | Markdown cards, JSON index, specification, HTML report, hand-off package, zip |

## 3. Layers and the dependency rule

Clean Architecture ([ADR-009](adr/ADR-009-clean-architecture.md)):

```mermaid
flowchart TB
  P[presentation<br/>CLI, composition root] --> A
  P --> I
  I[infrastructure<br/>adapters] --> A
  I --> D
  A[application<br/>use cases, ports] --> D[domain<br/>entities, value objects, rules]
```

- `domain` imports nothing outside `domain` and no third-party package; boundary schemas (zod) live in
  `application` (model output, tool arguments) and `infrastructure` (files, configuration).
- `application` imports `domain` and its own ports; it never imports `infrastructure` or `presentation`.
- `infrastructure` implements `application` ports; provider SDKs, tree-sitter, `yazl` and `node:fs` appear only here.
- `presentation` wires everything in one composition root; no business logic.
- No cycles anywhere. Enforced by dependency-cruiser in `npm run verify` (RNF-013, ADR-011).

## 4. Repository and solution layout

Canonical layout; card Delivers paths must match it. Created by the first P1 scaffolding card.

```text
src/
  domain/
    code-map/           CodeMap, FileEntry, Area, Artefact, MapLevel
    cards/              Card, CardType, Claim, Citation, ClaimStatus, Verdict, card ids
    budget/             Money, TokenUsage, Price, PriceTable, Budget, Cap
    runs/               Run, RunManifest, RunEndState, AgentTaskState, RunEvent types
    sources/            GitHubRepoRef, CommitSha, Permalink
    errors/             domain error codes and Result type
  application/
    ports/              port interfaces (section 7)
    use-cases/          one file per use case (section 6)
    agent/              agent loop, tool definitions, orchestrator, card parsing and repair
    verifier/           citation check, judgement step
    estimate/           cost estimator
  infrastructure/
    providers/          ollama/, openai/, openai-compatible/, anthropic/, fake/
    guards/             egress-guard, secret-masker, budget-guard
    github/             url parser, ref resolver, snapshot downloader and extractor
    files/              snapshot-reader, ignore-rules, output-writer
    events/             terminal-progress, sse-broadcaster, jsonl-event-log
    scan/               universal/, packs/csharp/
    writers/            markdown/, json/, html-report/, handoff/, zip/
    config/             YAML loader and schema
    system/             clock, id generator, logger
  presentation/
    cli/                commands, progress rendering, exit codes
    web/                loopback HTTP server, session token, API routes, server-sent events
    composition-root.ts
web/                    front-end source of the web UI and report components (Preact + Vite, DEC-52)
prompts/                versioned prompts per role (reader/, verifier/, planner/, summariser/)
tests/
  unit/                 mirrors src/
  integration/          mirrors src/
  e2e/                  CLI journeys
  contracts/            contract suites per port
  recordings/           recorded provider responses (ADR-008)
  fixtures/             small legacy samples per stack
eval/                   golden set and the evaluation runner (RNF-006)
site/                   published sample report (RF-800)
```

## 5. Domain model

| Concept | Kind | Invariants |
|---|---|---|
| `CodeMap` | aggregate | file paths unique and relative with forward slashes; every file in exactly one area; byte-identical output for the same input (RF-106) |
| `Area` | entity in `CodeMap` | non-empty; total tokens at most the configured area budget (RF-104) |
| `Card` | aggregate | id unique in the run (`FEAT-001` style, RF-203); at least one claim; `OQ` cards carry a question |
| `Claim` | entity in `Card` | at least one citation; status changes only through the transitions below; never removed (RF-302) |
| `Citation` | value object | `path:startLine-endLine`, `1 <= startLine <= endLine` |
| `Budget` | aggregate per run | spent never exceeds the cap: a call is refused when its worst case would cross it (RF-422) |
| `PriceTable` | value object | prices per million tokens for input, output and cached input, one currency, a date |
| `Run` | aggregate | one stage; manifest written at start and at end; an end state always recorded (RF-003, RNF-002) |

**State lists** (canonical):

| State list | Values | Transitions |
|---|---|---|
| `ClaimStatus` | `Proposed`, `CitationInvalid`, `Supported`, `Rejected`, `Unverified` | `Proposed` -> `CitationInvalid` (step 1) / `Supported` / `Rejected` (step 2) / `Unverified` (stopped); `Unverified` -> `Supported` / `Rejected` (resumed). Final: `CitationInvalid`, `Supported`, `Rejected`. Matches RFC-001 section 4.4. |
| `CardType` | `FEAT`, `BR`, `ENT`, `INT`, `OQ` | - |
| `OpenQuestionState` | `Open`, `Answered` | `Open` -> `Answered` when an answer is recorded and the area re-run (RF-241) |
| `AgentTaskState` | `Planned`, `Running`, `Done`, `TurnLimitReached`, `InvalidOutput`, `Failed`, `StoppedByCap` | `Planned` -> `Running` -> one of the other five |
| `RunEndState` | `Completed`, `CapReached`, `Failed`, `Interrupted` | set once when the run ends |
| `MapLevel` | `coarse`, `symbols` | per file, from the scan (RF-110) |
| `Confidence` | `High`, `Medium`, `Low` | set by the agent, never by the verifier |

## 6. Application services (use cases)

| Use case | Command | Requirements |
|---|---|---|
| `InitProject` | `rosetta init <path>` | RF-001 |
| `RunScan` | `rosetta scan` | RF-100..RF-112 |
| `EstimateRun` | `rosetta estimate <stage>` | RF-425 |
| `RunUnderstand` | `rosetta understand [--area] [--resume] [--with-answers]` | RF-200..RF-250, RF-006 |
| `RunVerify` | part of `understand`; `rosetta verify <run-id>` to resume | RF-300..RF-304 |
| `RecordAnswers` | `answers.md`; `rosetta answer` (Could) | RF-240..RF-242 |
| `BuildReport` | `rosetta report <run-id> [--format md]` | RF-500..RF-505 |
| `BuildPlan` | `rosetta plan <run-id> --target "<stack>"` | RF-600..RF-603 |
| `ExportZip` | `rosetta export <run-id> --zip [--handoff]` | RF-008 |
| `TestProviders` | `rosetta providers test` | RF-407 |

Each use case is a class with one public `execute` method that takes a typed request and returns a typed `Result`.
Use cases never print; they publish run events through the `RunEventSink` port.

## 7. Ports and adapters

| Port | Purpose | Adapters |
|---|---|---|
| `LlmProvider` | chat with tools; returns text, tool calls, usage (ADR-003) | `OllamaProvider`, `OpenAiProvider`, `OpenAiCompatibleProvider`, `AnthropicProvider`, `FakeProvider` (recordings) |
| `SourceFetcher` | resolve a GitHub URL and ref to a commit and provide its snapshot (ADR-012) | `GitHubSnapshotFetcher`, `FakeSourceFetcher` |
| `RepositoryReader` | list files, read line ranges, grep in a snapshot; read-only, ignore rules applied | `NodeRepositoryReader` |
| `OutputWriter` | write and read files inside the output folder only | `NodeOutputWriter` |
| `LanguagePack` | symbols, references, routes for some extensions (ADR-004) | `CSharpPack` (tree-sitter) |
| `ConfigSource` | load and validate the configuration | `YamlConfigSource` |
| `Clock` | current time | `SystemClock`, `FixedClock` (tests) |
| `IdGenerator` | run ids | `TimestampIdGenerator`, `SequenceIdGenerator` (tests) |
| `Logger` | structured application log with levels and correlation ids (RF-009) | `TerminalLogger`, `JsonlFileLogger`, `FanOutLogger`, `MemoryLogger` (tests) |
| `ProviderCallRecorder` | one record per provider call attempt (RF-408), written by an `ObservedProvider` decorator around every provider | `JsonlProviderCallLog`, `MemoryProviderCallLog` |
| `RunEventSink` | typed run events for the terminal, the web UI and the replay log (RF-004, RF-424, RF-1006) | `TerminalProgress`, `SseBroadcaster`, `JsonlEventLog`, `FanOutSink`, `MemorySink` |
| `ArchiveWriter` | zip a folder (RF-008) | `YazlArchiveWriter` |
| `UserPrompt` | yes/no confirmations (cloud warning, estimate threshold) | `TerminalPrompt`, `AutoAnswerPrompt` (`--yes`, tests) |

The egress guard and the budget guard are **decorators** of `LlmProvider`: the composition root wraps every real
provider as `BudgetGuard(EgressGuard(provider))`, so no call can bypass them (ADR-006, ADR-007). Every port has a
contract test suite in `tests/contracts/` that its real adapters and its fakes all pass (ADR-008).

## 8. The agent loop

```mermaid
sequenceDiagram
  participant O as Orchestrator
  participant L as Agent loop
  participant P as LlmProvider (guarded)
  participant T as Tools (read-only)
  O->>L: area, files, card schema, prompt version, max turns
  loop turn < maxTurns
    L->>P: system + messages + tool definitions
    P-->>L: text and/or tool calls + usage
    alt tool calls
      L->>T: validated arguments (zod)
      T-->>L: result or error result
    else final answer
      L->>L: parse cards (zod); one repair attempt on failure
    end
  end
  L-->>O: cards, transcript, state, usage
```

- **Tools** (RF-201): `list_area_files`, `read_file(path, startLine, endLine)`, `grep(pattern, pathGlob)`,
  `codemap_query(symbol | path)`. Arguments are validated; invalid calls return an error result the model can correct.
- **Tool protocol**: native tool calling when the model supports it; a JSON-in-text protocol otherwise (RF-205),
  selected per model in configuration.
- **Concurrency**: the orchestrator runs agent tasks with a configurable parallelism (default 1 for Ollama on 8 GB,
  higher for cloud providers); every task shares one `AbortSignal` for Ctrl+C and caps.
- **Prompt caching**: the system prompt, tool definitions and card schema form a stable prefix so providers that
  cache (Anthropic, OpenAI) charge less for repeated turns.
- **Multi-agent pattern** (DEC-57): a **code-driven orchestrator** (no model decides the routing) fans out one
  `reader` agent per area in parallel, the `verifier` is the evaluator of every claim, and the `summariser` is the
  reducer that merges cards across areas (RF-250). Agents never hand off to each other and never talk directly; they
  share nothing but the code map and the orchestrator's inputs. Each role has least privilege: readers get the
  read-only tools for their area, the verifier sees only the cited lines, the summariser sees only cards. The cost of
  the pattern (every agent re-reads context, so tokens grow with the number of agents) is bounded by the caps of
  ADR-007. Frameworks that own this loop (LangGraph, Google ADK) are not used (ADR-003, DEC-58).
- **Untrusted content** (ADR-013): tool results enter the conversation only inside delimited repository-content
  blocks, never in the system prompt (RF-145); `grep` runs in a worker with limits (RF-146).
- **Context limit**: each task tracks its prompt size; when a configured share of the model's context is reached, the
  task ends with its cards so far (`TurnLimitReached`) rather than failing.

## 9. Provider integration

| Concern | Rule |
|---|---|
| Calls | synchronous HTTP per turn, streamed when the adapter supports it, with a timeout and an `AbortSignal` |
| Retries | only in adapters: exponential back-off with jitter on rate limits, timeouts and server errors; honour retry-after (RF-406) |
| Failures | permanent errors (bad key, unknown model) stop the task with partial cards saved; the run continues unless every task is affected |
| Usage | every adapter returns input, output and cached tokens; estimated and flagged when the provider reports none (RF-421) |
| Idempotency | not needed: provider calls have no side effects; a retried call may cost twice and is metered twice |

## 10. Security

- No users or accounts (DEC-14). Provider keys come from environment variables named in the configuration; adapters
  read them at start-up and never log them (RNF-003).
- The web server listens only on `127.0.0.1`, requires the session token, checks `Host` and `Origin`, and never sends
  secrets to the browser (RF-1009).
- Snapshot extraction rejects archive entries that would land outside the snapshot folder (RF-122).
- The repository reader resolves every path against the snapshot root and refuses anything outside it or matched by
  ignore rules (RF-140); the output writer does the same for the output folder (RF-005).
- Model output is data: it is parsed with schemas, never executed, never used as a shell command or an unchecked path.
- The egress guard masks secrets before any call and logs what was sent (RF-141, RF-142); if masking fails the call
  is blocked (fail closed).
- Downloads use https to GitHub hosts only, with size and entry limits, and refuse link entries (RF-127).
- Repository and model text is rendered as text only; the page and the report carry a content security policy and no
  referrer; the session token leaves the address bar after load (RF-507, RF-1013).
- Refused requests, refused reads, skipped links and blocked calls are logged as security events (RF-009).
- The trust boundaries, their threats and the mapping to OWASP Top 10:2025 and the OWASP Top 10 for LLM applications
  are in the [threat model](security/threat-model.md) (ADR-013).

**Secure by default** (RNF-014):

| Default | Value | Changed only by |
|---|---|---|
| Web server address | `127.0.0.1`, free port, session token | `ui.port` (address never configurable) |
| Cloud egress | confirmation before the first call | `--yes` per run |
| Secret masking | on | never |
| Built-in deny list | on (RF-147) | `scan.allowDenied`, recorded in the run |
| Transcripts | masked | `--no-transcripts` to skip them |
| Telemetry | none | never |

## 11. Error handling

| Layer | Rule |
|---|---|
| domain | pure functions; invariant violations return a typed `Result` error; no exceptions for expected cases |
| application | returns `Result`; turns infrastructure exceptions into task states (`Failed`) with the error code |
| infrastructure | throws `Error` subclasses with an `RST-xxxx` code and the original as `cause` |
| presentation | maps errors to exit codes (RF-007) and prints code, message and next step |

Codes and ranges: [conventions.md](conventions.md) section 6.

## 12. Cross-cutting rules

- **Time**: only through `Clock`; timestamps stored in UTC ISO 8601.
- **Determinism**: stable ordering in every written file; ids from `IdGenerator`; the code map hash identifies input.
- **Paths**: relative to the repository root with forward slashes in every stored value; platform paths only inside
  file system adapters (RNF-001).
- **Configuration**: read once at start-up, validated, passed down as an immutable object.

## 13. Observability

The run folder is the audit trail: `manifest.json`, `egress.log.jsonl`, `cost.json`, agent transcripts and coverage
(RF-003, RF-142, RF-230, RF-426). `--verbose` adds debug logs on standard error. No telemetry.

## 14. Data ownership

| Data | Owner (writer) | Readers |
|---|---|---|
| Snapshots in `sources/` | `SourceFetcher`, once per commit; read-only afterwards | scanner, tools, verifier |
| `events.jsonl` per run | `JsonlEventLog` | web UI (late subscribers), report replay |
| `provider-calls.jsonl` per run | `ObservedProvider` decorator (RF-408) | web UI API calls panel (RF-1011), debugging |
| `logs/rosetta-YYYY-MM-DD.jsonl` | `JsonlFileLogger` (RF-009) | the developer, web UI logs panel |
| `cost-ledger.jsonl` per project | budget guard, one line per call (RF-428) | web UI header totals (RF-1010), `rosetta cost`, report dashboard |
| `codemap.json` | `RunScan` | every later stage |
| Run folders | the use case of that run | report, plan, export |
| `answers.md` | the developer (generated skeleton by `RunUnderstand`) | `RunUnderstand --with-answers`, `BuildPlan` |
| `handoff/` | `BuildPlan` | the modernisation team |

File formats: [data-model.md](data-model.md).

## 15. Deployment view

One Node.js process on the developer's machine per command, serving the web UI on `127.0.0.1` while active; the
browser connects with a session token; Ollama runs locally as its own service; GitHub and cloud providers over HTTPS. The sample report is static files on GitHub Pages. Details:
[environments-and-delivery.md](environments-and-delivery.md).

## 16. Quality attributes

| Requirement | Mechanism |
|---|---|
| RNF-001 portability | path rules (section 12); CI on Windows and Linux |
| RNF-002 robustness | run manifest at start and end; incremental writes per finished task; shared `AbortSignal` |
| RNF-003 secrets | keys only from the environment; egress guard; output scan test |
| RNF-004 reproducibility | manifest with versions, prompt versions, models, code map hash |
| RNF-005 offline tests | fake provider, contract suites, network blocked in tests |
| RNF-006 measured quality | `eval/` golden set and runner |
| RNF-011 local-first | Ollama adapter; snapshot cache; only the first fetch needs GitHub |
| RNF-012 estimate accuracy | estimator calibrated from cost reports |
| RNF-013 Clean Architecture | dependency-cruiser rules (section 3) |

## 17. Testing approach (summary)

| Level | May cross | Examples |
|---|---|---|
| Unit (about 60%) | nothing: no disk, network, clock or randomness | citation parsing, claim transitions, pricing, budget checks, area grouping |
| Integration (about 30%) | one real boundary: the file system in a temporary folder, or recordings through the fake provider | scan of a fixture repository, agent loop with recordings, writers |
| End-to-end (about 10%) | the CLI process on a fixture repository with the fake provider | `init` -> `scan` -> `understand` -> `report` |
| Contract | each port's suite against every adapter and fake | `LlmProvider`, `RepositoryReader`, `OutputWriter` |

Test names start with the requirement id; failing tests are committed first (ADR-010). Rules:
[conventions.md](conventions.md) section 7.

## 18. Open architecture questions

| Question | Link | Default |
|---|---|---|
| Which local model runs the reader role? | Q-04 | chosen by the P1 spike card |
| Target stack input for `plan` | Q-06 | developer passes `--target`; otherwise two options proposed |
| Report rendering approach | ADR index, deferred decisions | decided in the first P3 report card |
| Move to TypeScript 7 | ADR index, deferred decisions | when typescript-eslint supports it |
