# Data model

| | |
|---|---|
| **Status** | Proposed (2026-10-10); becomes Accepted when the owner accepts the documentation set at gate G-01 |
| **Decisions** | DEC-14 and DEC-37 (no database), DEC-43 (file formats), DEC-48 (GitHub snapshots), DEC-49 (cost ledger), DEC-50 (call and application logs); [ADR-004](adr/ADR-004-universal-scan-and-language-packs.md), [ADR-005](adr/ADR-005-evidence-cards-and-two-step-verifier.md), [ADR-006](adr/ADR-006-read-only-tools-and-data-egress.md), [ADR-007](adr/ADR-007-cost-control.md), [ADR-012](adr/ADR-012-local-web-ui-and-github-sources.md) |
| **Sources** | [RFC-001](rfc/RFC-001-rosetta.md), [requirements](spec/requirements.md) (RF/RNF ids cited per file), [architecture](architecture.md) sections 5 and 14 |
| **Owner of changes** | any change to a file format = a schema change in code + a `schemaVersion` bump when it is not additive + an edit of this document, in the same pull request; the verifier rejects one without the others |

Rosetta has **no database** in release 1 (DEC-14). Everything it keeps is a file: the project configuration, the
snapshot cache, the code map, one folder per run, and a few project-wide logs. This document is the contract
between the domain model ([architecture](architecture.md) section 5), the adapters that read and write files, the
web UI and the builders. The relational sections of the template (grants, migrations, history import) are replaced
by their file equivalents or marked not applicable. If a database is ever needed it is PostgreSQL behind an
infrastructure adapter (DEC-37), and this document gains its tables then.

## 1. Conventions

| Topic | Rule |
|---|---|
| Formats | structured data is **JSON** (UTF-8, no BOM, LF, two-space indent); append-only logs are **JSON Lines** (`.jsonl`, one object per line); human documents are **Markdown**; cards are Markdown with a **YAML header**; the configuration is **YAML** (DEC-25, DEC-43) |
| Schema version | every JSON, JSON Lines and YAML file and every card header carries `schemaVersion` (an integer per file kind, starting at 1). Readers accept the current and the previous version; a newer version than the reader knows is refused with an error code (DEC-43, section 7) |
| Validation | every file is parsed with its zod schema when read; nothing is cast. Schemas live in `application` (domain files) or `infrastructure` (adapter files); the domain imports no third-party package (ADR-009) |
| Field names | `camelCase`; ids and enum values exactly as defined below; no abbreviations except `id`, `sha`, `url` |
| Enumerations | strings from the canonical state lists in [architecture](architecture.md) section 5 (`ClaimStatus`, `CardType`, `OpenQuestionState`, `AgentTaskState`, `RunEndState`, `MapLevel`, `Confidence`) or listed in this document; never integer codes |
| Times | instants are ISO 8601 UTC strings with milliseconds and `Z` (`2026-10-10T14:03:22.415Z`), taken from the `Clock` port; durations are integer milliseconds with an `Ms` suffix |
| Paths | relative to the **repository root** of the snapshot (not to the subpath), forward slashes, no leading `./`, case as in the repository (RF-124, RF-125) |
| Citations | `path:startLine-endLine`, 1-based, inclusive, `startLine <= endLine` (ADR-005); stored as an object `{ path, startLine, endLine }` in JSON and as the string form in Markdown |
| Money | cost is stored as an integer `costMicros` (millionths of the price-table currency) plus `currency` (ISO 4217); never a floating-point amount. Displays round to 4 decimals below 1 and to 2 above |
| Tokens | integers `inputTokens`, `outputTokens`, `cachedInputTokens`; `usageSource` is `reported` or `estimated` (RF-421) |
| Determinism | files that must be byte-identical for the same input (`codemap.json`, `cards/index.json`) sort arrays by a stated key and objects by key, and contain no times (RF-106) |
| Atomic writes | JSON and Markdown files are written to a temporary name in the same folder and renamed; JSON Lines files are appended one complete line per write. A reader ignores a truncated last line and logs a warning |
| Secrets | every file passes through secret masking before it is written; no file ever holds an API key, a token or a header value (RNF-003, RF-141) |
| Line endings | LF in every file Rosetta writes, on every operating system |

## 2. Folder map

The project folder is where `rosetta init` ran. Everything Rosetta writes is inside `rosetta-out/` (RF-005).

```text
<project>/
  rosetta.config.yaml                 configuration (3.1)
  .rosettaignore                      ignore rules (3.2)
  rosetta-out/
    sources/
      <owner>__<repo>@<sha>/          one snapshot per commit, read-only (3.3)
        snapshot.json
        files/...                     the repository tree at that commit
    codemap.json                      code map of the last scan (3.4)
    scan-summary.md                   readable scan summary (3.5)
    answers.md                        answers to open questions (3.16)
    cost-ledger.jsonl                 every model call of the project (3.13)
    logs/rosetta-YYYY-MM-DD.jsonl     application log (3.14)
    runs/
      <runId>/                        one folder per run (3.6..3.15)
        manifest.json
        events.jsonl
        provider-calls.jsonl
        egress.log.jsonl
        cost.json, cost.md
        cards/<TYPE>/<CARD-ID>.md, cards/index.json
        spec.md
        coverage.json, coverage.md
        transcripts/<agentTaskId>.jsonl
        report/                       static report (RF-500..RF-506)
        handoff/                      hand-off package (RF-600..RF-699)
    exports/<runId>.zip               zip exports (RF-008)
```

`<runId>` is `yyyyMMdd-HHmmss-<stage>` in UTC (for example `20261010-140322-understand`), unique in the project; a
second run in the same second gets the suffix `-2` (RF-003).

## 3. Files

### 3.1 `rosetta.config.yaml`

| | |
|---|---|
| Purpose | the project's source, providers, models per role, caps, scan and output settings; no secret values |
| Writer | `rosetta init` (template with comments); then the developer |
| Readers | every command, through the `ConfigSource` port |
| Spec | RF-001, RF-002, RF-405, RF-420..RF-423, RF-1000, RF-009 |

| Section | Field | Type | Default | Notes |
|---|---|---|---|---|
| (root) | `schemaVersion` | int | 1 | |
| `source` | `url` | string | - | public GitHub URL as given to `init` (RF-120) |
| | `ref` | string | default branch | branch, tag or SHA; resolved per run (RF-121) |
| | `subpath` | string | none | folder of the repository to analyse (RF-124) |
| `providers` | `<name>.kind` | enum | - | `ollama`, `openai`, `openai-compatible`, `anthropic`, `fake` |
| | `<name>.baseUrl` | string | per kind | required for `openai-compatible`; Ollama `http://localhost:11434` |
| | `<name>.apiKeyEnv` | string | per kind | the **name** of the environment variable holding the key (RF-002) |
| | `<name>.toolMode` | enum | `native` | `native` or `text` (RF-205) |
| | `<name>.timeoutSeconds` | int | 120 | per call |
| | `<name>.maxRetries` | int | 3 | RF-406 |
| `roles` | `reader`, `verifier`, `planner`, `summariser` | object | - | each `{ provider, model, maxOutputTokens, temperature?, maxTurns? }`; `maxTurns` for `reader` only (RF-201, RF-405) |
| `budget` | `run.maxCostMicros`, `run.maxTokens` | int | template values | hard caps per run (RF-422) |
| | `roles.<role>.maxCostMicros`, `roles.<role>.maxTokens` | int | none | caps per role (RF-423) |
| | `confirmAboveCostMicros` | int | template value | estimate threshold that asks to continue (RF-425) |
| | `prices` | list | none | overrides of the shipped price table, same shape as 3.18 |
| `scan` | `maxFileBytes` | int | 1 000 000 | larger files are listed as `skipped: too large` (RF-100) |
| | `areaTokenBudget` | int | 60 000 | RF-104 |
| | `areas` | list | none | manual areas `{ name, include: [glob] }` (RF-104) |
| | `excerptMaxLines` | int | 400 | RF-144 |
| `output` | `folder` | string | `rosetta-out` | must be inside the project folder |
| | `transcripts` | bool | true | `--no-transcripts` overrides per run (DEC-43) |
| `ui` | `port` | int | 0 (free port) | RF-1000 |
| | `openBrowser` | bool | true | `--no-ui` overrides per run |
| `logging` | `retentionDays` | int | 14 | RF-009 |

Unknown keys are an error (RF-002), so a typo never silently changes behaviour.

### 3.2 `.rosettaignore`

Gitignore syntax, matched against repository-relative paths (RF-140). The `init` template lists common secret and
binary patterns (`*.pfx`, `*.key`, `*.env`, `appsettings.*.json` with secrets, `*.mdf`, images and archives).
No `schemaVersion`: the format is the standard gitignore syntax.

### 3.3 Snapshot cache: `sources/<owner>__<repo>@<sha>/`

| | |
|---|---|
| Purpose | the legacy code at one commit, downloaded once and read-only afterwards |
| Writer | `GitHubSnapshotFetcher` only, once per commit (RF-122) |
| Readers | scanner, agent tools, verifier, through `RepositoryReader` |
| Spec | RF-120..RF-126, RF-005 |

- The archive is extracted into `sources/.partial-<random>/`; every entry path is normalised and refused if it would
  land outside that folder (RF-122). When extraction and hashing finish, the folder is renamed to its final name, so
  a half-finished download never looks complete. Leftover `.partial-*` folders are deleted at start-up.
- The repository tree goes under `files/`; `snapshot.json` sits next to it, outside the analysed tree.
- After the rename, files are marked read-only where the operating system allows it; the reader opens files
  read-only in any case.

`snapshot.json`:

| Field | Type | Notes |
|---|---|---|
| `schemaVersion` | int | 1 |
| `url` | string | canonical `https://github.com/<owner>/<repo>` |
| `owner`, `repo` | string | as returned by the GitHub API (case preserved) |
| `commitSha` | string | 40 hex characters |
| `resolvedFrom` | string | the ref that was asked for |
| `downloadedAt` | instant | |
| `fileCount`, `totalBytes` | int | |
| `snapshotHash` | string | `sha256:` of the sorted list of `path` + file SHA-256 pairs; recorded in each run manifest (RF-126) |
| `licence` | string | SPDX id reported by GitHub, or `unknown` |

### 3.4 `codemap.json`

| | |
|---|---|
| Purpose | the deterministic map of the analysed code |
| Writer | `RunScan` (RF-105) |
| Readers | every later stage; `codemap_query` tool; web UI coverage map |
| Spec | RF-100..RF-112, RF-124 |

| Field | Type | Notes |
|---|---|---|
| `schemaVersion` | int | 1 |
| `source` | object | `{ owner, repo, commitSha, subpath }` |
| `files[]` | list, sorted by `path` | `{ path, language, lines, estimatedTokens, sha256, artefactKinds[], mapLevel, skipped? }`; `skipped` is `too-large`, `binary` or absent |
| `areas[]` | list, sorted by `name` | `{ name, files[] (paths), estimatedTokens, mapLevel, origin }`; `origin` is `folder`, `references` or `config` (RF-104) |
| `symbols[]` | list, sorted by `path`, `startLine` | `{ path, kind, name, startLine, endLine, container? }` from language packs (RF-110, RF-111) |
| `links[]` | list | `{ from, to, kind }`, for example an `.aspx` page to its code-behind class (RF-111) |
| `sqlStatements[]` | list | `{ path, line, verb, text }`, text cut to 500 characters (RF-103) |
| `entities[]` | list | candidate entities `{ name, path, startLine, source }` (RF-111) |
| `languagePacks[]` | list | `{ name, version }` used |

No times and no absolute paths, so two scans of the same commit are byte-identical (RF-106). The file hash
(`codemapHash`, SHA-256 of the file) goes into the run manifest.

### 3.5 `scan-summary.md`

Readable summary of the code map: source and commit, languages, artefact counts, areas with file and token counts
and map level (RF-105). Generated; never read back.

### 3.6 `runs/<runId>/manifest.json`

| | |
|---|---|
| Purpose | what a run was, what it used and how it ended; the key to repeat it |
| Writer | the use case of the run: at start, and at end (RF-003) |
| Readers | report, history in the web UI (RF-1008), resume (RF-006), export |
| Spec | RF-003, RF-126, RF-141, RNF-002, RNF-004 |

| Field | Type | Notes |
|---|---|---|
| `schemaVersion` | int | 1 |
| `runId`, `stage` | string | `stage`: `scan`, `understand`, `verify`, `report`, `plan` |
| `rosettaVersion` | string | |
| `startedAt`, `endedAt` | instant | `endedAt` empty while running |
| `endState` | `RunEndState` | empty while running; set exactly once |
| `exitCode` | int | RF-007 |
| `resumedFrom` | string | the earlier `runId` when resumed (RF-006) |
| `source` | object | `{ url, owner, repo, ref, commitSha, subpath, snapshotHash }` (RF-126) |
| `codemapHash` | string | |
| `options` | object | the normalised command options |
| `roles` | object | per role `{ provider, kind, model, toolMode, maxOutputTokens, temperature, maxTurns }` |
| `promptVersions` | object | prompt file name to version (RNF-004) |
| `priceTable` | object | `{ version, currency }` |
| `caps` | object | run and role caps in force |
| `masking` | object | count per secret kind (RF-141) |
| `totals` | object | `{ inputTokens, outputTokens, cachedInputTokens, costMicros, calls }` |
| `agentTasks[]` | list | `{ agentTaskId, area, role, state (AgentTaskState), turns, cards }` |

### 3.7 Cards: `cards/<TYPE>/<CARD-ID>.md` and `cards/index.json`

| | |
|---|---|
| Purpose | the findings: one file per card, YAML header plus readable body |
| Writer | `RunUnderstand` (cards), `RunVerify` (claim statuses), consolidation (RF-250) |
| Readers | report, plan, web UI, the developer |
| Spec | RF-202..RF-204, RF-240, RF-241, RF-300..RF-304 |

Card ids are numbered **per run** in order of area and appearance: `FEAT-001`, `BR-001`, `ENT-001`, `INT-001`,
`OQ-001` (RF-203, DEC-43). The YAML header is the authoritative data; the Markdown body is generated from it, with
every citation rendered as a GitHub permalink (RF-125), and is never parsed back.

Header fields:

| Field | Type | Notes |
|---|---|---|
| `schemaVersion` | int | 1 |
| `id`, `type` | string, `CardType` | |
| `title`, `summary` | string | English (DEC-45) |
| `area`, `agentTaskId` | string | |
| `confidence` | `Confidence` | set by the agent (architecture section 5) |
| `claims[]` | list | `{ claimId, text, citations[], status (ClaimStatus), verdict? }`; `claimId` is `<card id>.c<n>`; `verdict` is `{ step: citation \| judgement, reason, model, at }` |
| `question`, `whyItMatters` | string | `OQ` only (RF-202) |
| `questionState` | `OpenQuestionState` | `OQ` only (RF-241) |
| `mergedFrom[]` | list | card ids merged by consolidation (RF-250) |

A rejected or invalid claim is never removed; only its status and verdict change (RF-302).

`cards/index.json` lists every card `{ id, type, title, area, path, claimCounts per status }`, sorted by `id`.

### 3.8 `spec.md`, `coverage.json`, `coverage.md`

- `spec.md`: the cards per area as one readable specification with links to the card files (RF-204).
- `coverage.json`: per area `{ area, files: [{ path, read: [{ startLine, endLine }] }], readTokenShare }`; feeds the
  web UI coverage map (RF-1005) and the report. `coverage.md` is its readable form (RF-230).

### 3.9 `events.jsonl` (run events)

| | |
|---|---|
| Purpose | the ordered story of a run, streamed live to the web UI and replayed by the report |
| Writer | `JsonlEventLog` behind the `RunEventSink` port (RF-1006) |
| Readers | web UI (late subscribers read it before live events), report replay (RF-506) |
| Spec | RF-004, RF-1002..RF-1006, RF-506 |

Envelope of every line:

| Field | Type | Notes |
|---|---|---|
| `schemaVersion` | int | 1 |
| `seq` | int | 1, 2, 3 ... within the run, no gaps |
| `at` | instant | |
| `runId` | string | |
| `type` | string | one of the list below |
| `agentTaskId` | string | when the event belongs to an agent task |
| `data` | object | the payload of that type |

Event types (canonical list):

| Type | Payload `data` |
|---|---|
| `run.started` | `{ stage, source, roles, caps, estimate? }` |
| `source.resolved` | `{ url, ref, commitSha }` |
| `source.downloaded` | `{ fileCount, totalBytes, durationMs, cached }` |
| `scan.completed` | `{ files, areas, mapLevels }` |
| `agent.planned` | `{ area, role, model }` |
| `agent.started` | `{ area, role, model }` |
| `agent.turn` | `{ turn, inputTokens, outputTokens }` |
| `agent.tool.called` | `{ turn, tool, args }` where `args` holds paths, line ranges and patterns, never file content |
| `agent.tool.result` | `{ turn, tool, ok, linesReturned?, refusedReason? }` |
| `agent.card.proposed` | `{ cardId, type, title, claims }` |
| `agent.ended` | `{ state (AgentTaskState), turns, cards }` |
| `verify.citation.checked` | `{ claimId, ok, reason? }` |
| `verify.claim.judged` | `{ claimId, status, reason }` |
| `usage.recorded` | `{ callId, role, provider, model, tokens, costMicros, runTotals, projectTotals }` (RF-1003, RF-1010) |
| `budget.warning` | `{ scope (run or role), sharePercent }` at 50, 80 and 95 percent |
| `budget.capReached` | `{ scope, capMicros, spentMicros }` |
| `question.answered` | `{ cardId }` (RF-1007) |
| `run.ended` | `{ endState, exitCode, totals }` |

New event types may be added without a version bump; a reader ignores types it does not know. Application log
entries are not run events: the web UI logs panel receives them on its own stream (RF-1011).

### 3.10 `provider-calls.jsonl`

| | |
|---|---|
| Purpose | one record per provider call attempt, for observability |
| Writer | the `ObservedProvider` decorator through `ProviderCallRecorder` (RF-408) |
| Readers | web UI API calls panel (RF-1011), the developer |
| Spec | RF-408, RF-406, RNF-003 |

| Field | Type | Notes |
|---|---|---|
| `schemaVersion` | int | 1 |
| `seq` | int | order in the run |
| `callId` | string | `<runId>#<n>`; the same for every attempt of one logical call |
| `attempt` | int | 1 for the first attempt (RF-406) |
| `runId`, `agentTaskId`, `role` | string | |
| `provider`, `kind`, `model` | string | |
| `endpointHost` | string | host only, never a full URL with a query |
| `requestId` | string | the provider's request id when it returns one |
| `startedAt` | instant | |
| `timeToFirstTokenMs`, `latencyMs` | int | |
| `inputTokens`, `outputTokens`, `cachedInputTokens`, `usageSource` | int, enum | |
| `costMicros`, `currency` | int, string | |
| `finishReason` | string | normalised: `stop`, `length`, `tool_use`, `error` |
| `status` | enum | `ok`, `retried`, `failed`, `refused-by-cap` |
| `errorCode` | string | `RST-xxxx` when not `ok` |
| `httpStatus` | int | when there was an HTTP response |
| `ollama` | object | Ollama only: `{ loadDurationMs, promptEvalDurationMs, evalDurationMs, tokensPerSecond }` |
| `transcriptRef` | string | `transcripts/<agentTaskId>.jsonl#<line>` when transcripts are on |

### 3.11 `egress.log.jsonl`

One line per model call: `{ schemaVersion, seq, at, callId, provider, model, role, agentTaskId, excerpts: [{ path,
startLine, endLine }], maskedCounts }` - exactly what left the machine and where (RF-142). Content is never copied
here.

### 3.12 `cost.json` and `cost.md`

Written when the run ends (RF-426): `{ schemaVersion, runId, currency, priceTableVersion, totals, byRole[],
byAgentTask[], byProvider[], byModel[] }`, each entry with the token fields, `calls` and `costMicros`. `cost.md` is
the readable table.

### 3.13 `cost-ledger.jsonl` (project)

| | |
|---|---|
| Purpose | every model call of every run of the project; the source of the project totals |
| Writer | the budget guard, one line after each call (RF-428) |
| Readers | web UI header (RF-1010), `rosetta cost`, report dashboard |
| Spec | RF-428, RF-1010, DEC-49 |

Line: `{ schemaVersion, at, runId, stage, callId, attempt, role, provider, model, inputTokens, outputTokens,
cachedInputTokens, usageSource, costMicros, currency, priceTableVersion }`. The cost of each line is fixed when the
call is made and never recomputed. Totals are the sum of the lines; the web UI keeps a running sum in memory and
re-reads the file only at start-up. Lines in different currencies are totalled per currency.

### 3.14 Application log: `logs/rosetta-YYYY-MM-DD.jsonl`

Line: `{ schemaVersion, at, level, logger, message, code?, runId?, agentTaskId?, callId?, data? }`; `level` is
`debug`, `info`, `warn` or `error`. One file per UTC day; files older than `logging.retentionDays` are deleted at
start-up (RF-009). Every entry passes the secret masking.

### 3.15 `transcripts/<agentTaskId>.jsonl`

The masked messages exchanged with the model for one agent task, one message per line `{ schemaVersion, seq, at,
callId, role (system, user, assistant, tool), content, toolCalls? }`. Written unless `--no-transcripts` (DEC-43).
Content is exactly what was sent after masking, so it may contain excerpts of the legacy code.

### 3.16 `answers.md`

Generated skeleton, then edited by the developer (RF-240, Q-11). One section per open question:

```markdown
## OQ-003 - Is a catalog item with zero stock still shown?

- Card: runs/20261010-140322-understand/cards/OQ/OQ-003.md
- Context: Catalog/Default.aspx.cs:41-58 filters on ...
- Answer:
```

The heading carries the card id and the run, so a later run matches answers by card id and question text; an
existing answer is never overwritten.

### 3.17 Report and hand-off folders

`report/` (static site, RF-500..RF-506) and `handoff/` (RF-600..RF-699) are generated from the files above. Their
inner structure is defined by the report and plan cards in P3 and documented in this section then.

### 3.18 Price table

Shipped as `prices/default-prices.yaml` in the Rosetta repository: `{ schemaVersion, version (date),
currency, models: [{ provider kind, model, inputPerMillionMicros, outputPerMillionMicros,
cachedInputPerMillionMicros }] }`. Ollama models have price 0. Overrides in the configuration use the same entry
shape (RF-420, RF-427).

## 4. Reserved for later releases

| Release | File or folder | Spec |
|---|---|---|
| R2 | `comparisons/<id>/` (comparing runs, providers or models) | RF-900..RF-999 |
| R2 | plugin packaging metadata | RF-700..RF-799 |

## 5. Rules carried by the schemas (verifier checklist)

| Rule | Where |
|---|---|
| Every claim has at least one valid citation shape | card schema (RF-202) |
| A claim is never removed; statuses follow the `ClaimStatus` transitions | card writer and `Claim` entity (RF-302) |
| Every file carries `schemaVersion`; unknown newer versions are refused | every schema (DEC-43) |
| `codemap.json` is byte-identical for the same commit | sorting rules and no times (RF-106) |
| No secret in any file | masking on every writer; output scan test (RNF-003) |
| Snapshot entries never escape their folder | extractor path check (RF-122) |
| A snapshot is written once and never modified | `SourceFetcher` is the only writer (RF-005) |
| Event `seq` has no gaps; `run.ended` is the last event | `JsonlEventLog` (RF-1006) |
| Cost never stored as floating point | `costMicros` fields |
| A run's `endState` is set exactly once | `Run` aggregate (RF-003) |

## 6. Access

Not applicable as database grants. File access rules instead:

- Rosetta writes only inside `rosetta-out/` (RF-005); `rosetta.config.yaml` and `.rosettaignore` are the only
  files it creates outside it, once, at `init`.
- Snapshots are read-only after the fetch (3.3).
- The web server serves only `rosetta-out/` content and its own static assets, never paths outside them, and never
  configuration values that name secrets (RF-1009).

## 7. Schema versions (instead of migrations)

- Each file kind has its own `schemaVersion`, starting at 1.
- An additive change (a new optional field, a new event type) keeps the version. A change that renames, removes or
  changes the meaning of a field raises it.
- Readers accept the current and the previous version and upgrade the previous one in memory; old run folders are
  never rewritten (DEC-43).
- The version table below is updated in the same pull request as the change.

| File kind | Current version |
|---|---|
| configuration, snapshot, code map, manifest, card, card index, coverage, events, provider calls, egress, cost, cost ledger, application log, transcript, price table | 1 |

## 8. Test data strategy

- Unit tests use in-memory adapters (`MemorySink`, `MemoryLogger`, memory file system); no disk.
- Integration tests create a temporary project folder per test and delete it afterwards; snapshots come from small
  fixture archives under `tests/fixtures/snapshots/`, including one with a path-traversal entry (RF-122).
- Provider traffic comes from recorded responses under `tests/recordings/` through the fake provider (ADR-008);
  GitHub traffic from a fake GitHub client.
- Fixture code from the demo app is limited to small cited excerpts (MIT, attribution kept).

## 9. Retention

| Data | Retain | Action |
|---|---|---|
| Application logs | `logging.retentionDays` (14) | deleted at start-up |
| `.partial-*` snapshot folders | until next start-up | deleted |
| Snapshots, runs, exports | until the developer deletes them | none automatic (Q-16) |
| Cost ledger | the life of the project | never purged by Rosetta: it is the project total |

## 10. Seed data

| Seed | Where | Used by |
|---|---|---|
| Configuration template with comments | `templates/rosetta.config.yaml` | `rosetta init` |
| `.rosettaignore` template | `templates/.rosettaignore` | `rosetta init` |
| Default price table | `prices/default-prices.yaml` | budget guard, estimator |
| Prompts | `prompts/<role>/` | agent loop (RNF-004) |
| Demo target | `https://github.com/dotnet-architecture/eShopModernizing/tree/master/eShopLegacyWebFormsSolution` | README quick start, milestone run (RF-801) |

## 11. History import

Not applicable: Rosetta replaces no system.

## 12. Open points

- Q-15: currency of costs. Default: the shipped price table is in USD, as providers publish it, and costs are
  shown in USD; no conversion in R1.
- Q-16: should Rosetta offer a command to delete old snapshots and runs? Default: no command in R1; the developer
  deletes folders under `rosetta-out/` by hand, and the cost ledger keeps the totals.
