# Data model

| | |
|---|---|
| **Status** | Proposed (2026-10-10); becomes Accepted when the owner accepts the documentation set at gate G-01 |
| **Decisions** | DEC-65 (PostgreSQL plus files; replaces DEC-14's "no database"), DEC-37 (PostgreSQL behind adapters), DEC-61 (data folder on a volume), DEC-62, DEC-64, DEC-66 (accounts, keys, isolation), DEC-43 (file formats), DEC-48 (GitHub snapshots), DEC-49 (cost ledger), DEC-50 (call and application logs); [ADR-004](adr/ADR-004-universal-scan-and-language-packs.md), [ADR-005](adr/ADR-005-evidence-cards-and-two-step-verifier.md), [ADR-006](adr/ADR-006-read-only-tools-and-data-egress.md), [ADR-007](adr/ADR-007-cost-control.md), [ADR-012](adr/ADR-012-local-web-ui-and-github-sources.md), [ADR-015](adr/ADR-015-accounts-sessions-and-user-secrets.md), [ADR-016](adr/ADR-016-postgresql-and-files.md) |
| **Sources** | [RFC-001](rfc/RFC-001-rosetta.md), [requirements](spec/requirements.md) (RF/RNF ids cited per file), [architecture](architecture.md) sections 5 and 14 |
| **Owner of changes** | any change to a file format = a schema change in code + a `schemaVersion` bump when it is not additive + an edit of this document, in the same pull request; any change to a table = a new numbered migration + an edit of section 4; the verifier rejects one without the others |

Rosetta keeps its data in two places (DEC-65, [ADR-016](adr/ADR-016-postgresql-and-files.md)):

- **PostgreSQL** holds what needs transactions, ownership and sums across users: accounts, sessions, encrypted
  provider keys, projects and their settings, the run index, the cost ledger, server settings and the audit trail
  (section 4).
- **The data folder** (`ROSETTA_DATA_DIR`, a volume) holds large trees of files: the shared snapshot cache, one
  workspace per user with the run folders, and the daily logs (sections 2 and 3).

This document is the contract between the domain model ([architecture](architecture.md) section 5), the adapters,
the web UI and the builders. The database never stores file contents; files never store passwords, sessions or keys.

## 1. Conventions

| Topic | Rule |
|---|---|
| Formats | structured data is **JSON** (UTF-8, no BOM, LF, two-space indent); append-only logs are **JSON Lines** (`.jsonl`, one object per line); human documents are **Markdown**; cards are Markdown with a **YAML header**; project settings are JSON in the database (DEC-25, DEC-43, DEC-65) |
| Schema version | every JSON and JSON Lines file, every card header and every settings document carries `schemaVersion` (an integer per file kind, starting at 1). Readers accept the current and the previous version; a newer version than the reader knows is refused with an error code (DEC-43, section 7) |
| Validation | every file is parsed with its zod schema when read; nothing is cast. Schemas live in `application` (domain files) or `infrastructure` (adapter files); the domain imports no third-party package (ADR-009) |
| Field names | `camelCase`; ids and enum values exactly as defined below; no abbreviations except `id`, `sha`, `url` |
| Enumerations | strings from the canonical state lists in [architecture](architecture.md) section 5 (`ClaimStatus`, `CardType`, `OpenQuestionState`, `AgentTaskState`, `RunEndState`, `MapLevel`, `Confidence`) or listed in this document; never integer codes |
| Times | instants are ISO 8601 UTC strings with milliseconds and `Z` (`2026-10-10T14:03:22.415Z`), taken from the `Clock` port; durations are integer milliseconds with an `Ms` suffix |
| Paths | relative to the **repository root** of the snapshot (not to the subpath), forward slashes, no leading `./`, case as in the repository (RF-124, RF-125) |
| Citations | `path:startLine-endLine`, 1-based, inclusive, `startLine <= endLine` (ADR-005); stored as an object `{ path, startLine, endLine }` in JSON and as the string form in Markdown |
| Money | cost is stored as an integer `costMicros` (millionths of the price-table currency, USD per DEC-54) plus `currency` (ISO 4217); never a floating-point amount. Displays round to 4 decimals below 1 and to 2 above |
| Tokens | integers `inputTokens`, `outputTokens`, `cachedInputTokens`; `usageSource` is `reported` or `estimated` (RF-421) |
| Determinism | files that must be byte-identical for the same input (`codemap.json`, `cards/index.json`) sort arrays by a stated key and objects by key, and contain no times (RF-106) |
| Atomic writes | JSON and Markdown files are written to a temporary name in the same folder and renamed; JSON Lines files are appended one complete line per write. A reader ignores a truncated last line and logs a warning |
| Secrets | every file passes through secret masking before it is written; no file ever holds an API key, a token or a header value (RNF-003, RF-141); in the database, keys are stored only encrypted and passwords and session ids only hashed (ADR-015) |
| SQL names | tables and columns `snake_case`, tables plural; primary keys `id`; foreign keys `<table singular>_id`; times `timestamptz` named `*_at`; money `bigint` named `*_micros`; enumerations are `text` with a `CHECK` constraint; conventions.md section 2 |
| Ownership | every table with user data has a `user_id` column, and every repository query filters on it (RF-1105) |
| Line endings | LF in every file Rosetta writes, on every operating system |

## 2. Folder map

Everything Rosetta writes to disk is inside the data folder `<data>` = `ROSETTA_DATA_DIR` (RF-005, RF-1305).
Folder names come from ids, never from request text.

```text
<data>/
  sources/
    <owner>__<repo>@<sha>/            one snapshot per commit, shared by all users, read-only (3.3)
      snapshot.json
      files/...                       the repository tree at that commit
  logs/rosetta-YYYY-MM-DD.jsonl       application log (3.14)
  users/<userId>/                     one workspace per user (RF-1105)
    projects/<projectId>/
      codemap.json                    code map of the last scan (3.4)
      scan-summary.md                 readable scan summary (3.5)
      answers.md                      answers to open questions (3.16)
      runs/
        <runId>/                      one folder per run (3.6..3.15)
          manifest.json
          events.jsonl
          provider-calls.jsonl
          egress.log.jsonl
          cost.json, cost.md
          cards/<TYPE>/<CARD-ID>.md, cards/index.json
          spec.md
          coverage.json, coverage.md
          transcripts/<agentTaskId>.jsonl
          report/                     static report (RF-500..RF-506)
          handoff/                    hand-off package (RF-600..RF-699)
      exports/<runId>.zip             zip exports (RF-008)
```

`<userId>` and `<projectId>` are the UUIDs of their rows (section 4). `<runId>` is `yyyyMMdd-HHmmss-<stage>` in UTC
(for example `20261010-140322-understand`), unique in the project; a second run in the same second gets the suffix
`-2` (RF-003). The project cost ledger moved from `cost-ledger.jsonl` to the `cost_ledger` table (3.13).

## 3. Files

### 3.1 Project settings (`projects.settings`)

Changed 2026-10-11 (DEC-59, DEC-65): the former `rosetta.config.yaml` is now a JSON document in the `settings`
column of the `projects` table, edited on the project's settings page. The source fields moved to columns of
`projects`; the `output` and `ui` sections are gone.

| | |
|---|---|
| Purpose | the project's providers, models per role, caps, scan settings and ignore rules; no secret values |
| Writer | `CreateProject` (defaults); then the user on the settings page |
| Readers | every run use case, through the `ConfigSource` port |
| Spec | RF-002, RF-010, RF-405, RF-420..RF-423, RF-009 |

| Section | Field | Type | Default | Notes |
|---|---|---|---|---|
| (root) | `schemaVersion` | int | 1 | |
| `providers` | `<name>.kind` | enum | - | `ollama`, `openai`, `openai-compatible`, `anthropic`, `fake` |
| | `<name>.baseUrl` | string | per kind | required for `openai-compatible`; Ollama: the server's `ROSETTA_OLLAMA_URL` (locally `http://host.docker.internal:11434`) |
| | `<name>.keySource` | enum | `user-then-server` | `user` (only the user's stored key) or `user-then-server` (RF-1104); the key itself is never in the settings |
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
| | `ignoreRules` | string | the default template | gitignore syntax, replaces `.rosettaignore` (3.2) |
| `output` | `transcripts` | bool | true | skip transcripts for this project (DEC-43) |

Unknown keys are an error (RF-002), so a typo never silently changes behaviour.

### 3.2 `.rosettaignore`

Changed 2026-10-11: the rules are the `scan.ignoreRules` field of the project settings (3.1), not a file. Gitignore
syntax, matched against repository-relative paths (RF-140). The default template lists common secret and binary
patterns (`*.pfx`, `*.key`, `*.env`, `appsettings.*.json` with secrets, `*.mdf`, images and archives).
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
| `roles` | object | per role `{ provider, kind, model, modelVersion, modelDigest?, toolMode, maxOutputTokens, temperature, maxTurns }`; `modelVersion` is the exact id the provider reports, `modelDigest` the Ollama digest (RNF-004) |
| `promptVersions` | object | prompt file name to `{ version, sha256 }` (RNF-004) |
| `security` | object | `{ deniedReads, refusedRequests, skippedLinks, blockedCalls, allowDenied[] }` counts and lifted deny patterns (RF-009, RF-127, RF-147) |
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
| Readers | report, plan, web UI, the user |
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
| Readers | web UI API calls panel (RF-1011), the user |
| Spec | RF-408, RF-406, RNF-003 |

| Field | Type | Notes |
|---|---|---|
| `schemaVersion` | int | 1 |
| `seq` | int | order in the run |
| `traceId` | string | one per run (32 hex characters) |
| `spanId`, `parentSpanId` | string | the call's span (16 hex) and its agent task's span |
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

Tracing vocabulary (DEC-57): a run is a trace, an agent task a span, a provider call a child span. Field names map to
the OpenTelemetry GenAI semantic conventions so an exporter can be added later without renaming (deferred, ADR index):
`provider` -> `gen_ai.system`, `model` -> `gen_ai.request.model`, `modelVersion` -> `gen_ai.response.model`,
`inputTokens` -> `gen_ai.usage.input_tokens`, `outputTokens` -> `gen_ai.usage.output_tokens`, `finishReason` ->
`gen_ai.response.finish_reasons`, `requestId` -> `gen_ai.response.id`. Nothing is sent anywhere (no telemetry).

### 3.11 `egress.log.jsonl`

One line per model call: `{ schemaVersion, seq, at, callId, provider, model, role, agentTaskId, excerpts: [{ path,
startLine, endLine }], maskedCounts }` - exactly what left the machine and where (RF-142). Content is never copied
here.

### 3.12 `cost.json` and `cost.md`

Written when the run ends (RF-426): `{ schemaVersion, runId, currency, priceTableVersion, totals, byRole[],
byAgentTask[], byProvider[], byModel[] }`, each entry with the token fields, `calls` and `costMicros`. `cost.md` is
the readable table.

### 3.13 Cost ledger (the `cost_ledger` table)

Changed 2026-10-11 (DEC-65): the project's `cost-ledger.jsonl` became the `cost_ledger` table (section 4), so caps can
sum across users and the server (RF-1106).

| | |
|---|---|
| Purpose | every model call of every run of every user; the source of all totals and caps |
| Writer | the budget guard, one row per call, in the transaction that checks the caps (RF-428) |
| Readers | web UI header (RF-1010), cost page, caps (RF-1106), administration page, report dashboard |
| Spec | RF-428, RF-1010, RF-1106, DEC-49 |

The cost of each row is fixed when the call is made and never recomputed. Totals are sums over the rows; rows in
different currencies are totalled per currency. Rows are never deleted with runs or projects (DEC-55).

### 3.14 Application log: `<data>/logs/rosetta-YYYY-MM-DD.jsonl` and standard output

Line: `{ schemaVersion, at, level, logger, message, code?, runId?, agentTaskId?, callId?, data? }`; `level` is
`debug`, `info`, `warn` or `error`; `userId` is added when a request or run has one. The same entries go to standard
output as JSON lines at `ROSETTA_LOG_LEVEL` and above. One file per UTC day; files older than `ROSETTA_LOG_RETENTION_DAYS` (default 14) are deleted at
start-up and daily (RF-009). Every entry passes the secret masking.

### 3.15 `transcripts/<agentTaskId>.jsonl`

The masked messages exchanged with the model for one agent task, one message per line `{ schemaVersion, seq, at,
callId, role (system, user, assistant, tool), content, toolCalls? }`. Written unless the project setting `output.transcripts` is false (DEC-43).
Content is exactly what was sent after masking, so it may contain excerpts of the legacy code.

### 3.16 `answers.md`

Generated skeleton, then edited by the user on the answers page (RF-240, RF-1007, Q-11). One section per open question:

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

### 3.19 Evaluation results: `eval/<date>-<id>/`

Written by `npm run eval` (RNF-006, RNF-015, RF-305), inside the Rosetta repository's git-ignored `eval-out/`, never
in a user's project: `experiment.json` `{ schemaVersion, id, at, rosettaVersion, roles (with modelVersion and
modelDigest), promptVersions (with sha256), goldenSetVersion, repetitions }` and `results.json` with per-case scores
per repetition, precision, recall, the spread across repetitions, cost per supported claim, and, with the calibration
set, the verifier's agreement rate.

## 4. Tables (PostgreSQL)

Added 2026-10-11 (DEC-65, ADR-016). PostgreSQL 17. Every table is created by a numbered migration (section 7). Ids
are UUIDs generated by the application (`IdGenerator`) unless stated. All `*_at` columns are `timestamptz` set from
the `Clock` port.

**`users`** (RF-1100..RF-1103, RF-1107)

| Column | Type | Rules |
|---|---|---|
| `id` | `uuid` | primary key |
| `user_name` | `text` | 3..40 characters `[a-z0-9._-]`; unique on `lower(user_name)` |
| `display_name` | `text` | 1..80 characters |
| `role` | `text` | `CHECK (role IN ('admin','user'))` |
| `state` | `text` | `CHECK (state IN ('Active','MustChangePassword','Disabled'))`; `Locked` is derived from `locked_until` |
| `password_hash` | `text` | `scrypt$N$r$p$salt$hash` (base64); never selected by list queries |
| `failed_sign_ins` | `int` | reset to 0 on success |
| `locked_until` | `timestamptz` null | set for 15 minutes after the fifth failure |
| `server_keys_allowed` | `boolean` | default `true` (RF-1104) |
| `daily_cap_micros` | `bigint` null | null = the server default (RF-1106) |
| `created_at`, `updated_at`, `last_sign_in_at` | `timestamptz` | `last_sign_in_at` null until the first sign-in |

**`sessions`** (RF-1101)

| Column | Type | Rules |
|---|---|---|
| `id_hash` | `bytea` | primary key; SHA-256 of the 256-bit session id; the id itself is never stored |
| `user_id` | `uuid` | references `users`, `ON DELETE CASCADE`; indexed |
| `csrf_secret` | `bytea` | per-session secret for the CSRF token |
| `created_at`, `last_seen_at`, `expires_at` | `timestamptz` | `expires_at` = min(`last_seen_at` + 8 h, `created_at` + 7 days) |
| `ip`, `user_agent` | `text` | for the administrator's view and audit; user agent cut to 200 characters |

**`provider_keys`** (RF-1104)

| Column | Type | Rules |
|---|---|---|
| `user_id` | `uuid` | references `users`; part of the primary key |
| `provider` | `text` | `CHECK (provider IN ('openai','anthropic','openai-compatible'))`; part of the primary key |
| `base_url` | `text` null | required for `openai-compatible` |
| `ciphertext`, `iv`, `auth_tag` | `bytea` | AES-256-GCM; the additional authenticated data is `user_id:provider` |
| `key_version` | `int` | which `ROSETTA_SECRET_KEY` generation encrypted it |
| `last4` | `text` | the last four characters, for display |
| `created_at`, `updated_at` | `timestamptz` | |

**`projects`** (RF-010, RF-1105)

| Column | Type | Rules |
|---|---|---|
| `id` | `uuid` | primary key; also the workspace folder name |
| `user_id` | `uuid` | references `users`; indexed |
| `name` | `text` | defaults to `<owner>/<repo>` |
| `source_url`, `ref`, `subpath` | `text` | normalised GitHub URL; `ref` empty = default branch; `subpath` empty = root; unique on (`user_id`, `source_url`, `ref`, `subpath`) |
| `settings` | `jsonb` | the document of 3.1, validated by its zod schema on every write and read |
| `created_at`, `updated_at` | `timestamptz` | |

**`runs`** (RF-003, RF-1108)

| Column | Type | Rules |
|---|---|---|
| `id` | `uuid` | primary key |
| `project_id` | `uuid` | references `projects`, `ON DELETE CASCADE` |
| `user_id` | `uuid` | references `users`; equals the project's owner |
| `run_key` | `text` | the `<runId>` folder name; unique per project |
| `stage` | `text` | `CHECK (stage IN ('scan','understand','verify','report','plan','test'))` |
| `queue_state` | `text` | `RunQueueState` (architecture section 5) |
| `end_state` | `text` null | `RunEndState`; set once |
| `queued_at`, `started_at`, `ended_at` | `timestamptz` | the last two null until reached |
| `cost_micros`, `input_tokens`, `output_tokens`, `cached_input_tokens` | `bigint` | running totals for lists; the ledger is the source of truth |

**`cost_ledger`** (RF-428, RF-1106)

| Column | Type | Rules |
|---|---|---|
| `id` | `bigint` | identity primary key |
| `at` | `timestamptz` | indexed with `user_id` and alone (server month) |
| `user_id` | `uuid` | references `users` (accounts are disabled, never deleted) |
| `project_id`, `run_id` | `uuid` | no foreign key: rows outlive deleted projects and runs (DEC-55) |
| `stage`, `role`, `provider`, `model` | `text` | |
| `call_id` | `text` | matches `provider-calls.jsonl`; `attempt` `int` |
| `key_source` | `text` | `CHECK (key_source IN ('user','server','none'))`; `none` for Ollama |
| `input_tokens`, `output_tokens`, `cached_input_tokens` | `bigint` | |
| `usage_source` | `text` | `reported` or `estimated` |
| `cost_micros` | `bigint` | fixed at call time |
| `currency` | `char(3)` | `USD` (DEC-54) |
| `price_table_version` | `text` | |

The budget guard takes `pg_advisory_xact_lock` on the user and on the server before it sums the caps and reserves a
call's worst case, so two parallel runs cannot both pass the last free cent (RF-1106).

**`server_settings`** (RF-1106, RF-1108)

One row per key: `key text` primary key, `value jsonb`, `updated_at`, `updated_by uuid`. Keys:
`caps` (`runMicros`, `userDayMicros`, `serverMonthMicros`), `queue` (`maxRunning`), `providers` (which server keys
are offered, Ollama URL). Defaults are inserted by a migration.

**`audit_events`** (RF-1109)

| Column | Type | Rules |
|---|---|---|
| `id` | `bigint` | identity primary key |
| `at` | `timestamptz` | indexed |
| `actor_user_id` | `uuid` null | null for anonymous sign-in attempts |
| `action` | `text` | for example `auth.sign_in`, `auth.locked`, `user.created`, `key.saved`, `admin.workspace_opened`, `request.refused` |
| `target_type`, `target_id` | `text` null | |
| `ip` | `text` | |
| `outcome` | `text` | `CHECK (outcome IN ('ok','refused','failed'))` |
| `detail` | `jsonb` | masked; never a password, key or session id |

**`schema_version`** (RF-1302): `version int` primary key, `name text`, `checksum text` (SHA-256 of the file),
`applied_at timestamptz`.

### 4.1 Reserved for later releases

| Release | File, folder or table | Spec |
|---|---|---|
| R2 | `comparisons/<id>/` (comparing runs, providers or models) | RF-900..RF-999 |
| out of scope (DEC-60) | plugin packaging metadata | RF-700..RF-799 |

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
| Every user-data query filters on the actor's `user_id` | repositories; access matrix test (RF-1105) |
| No password, session id or key in plain text in any table or file | `ScryptPasswordHasher`, `SessionStore`, `AesGcmSecretBox`; output scan test (RF-1104) |
| SQL is parameterised | lint rule against template literals in `query` (ADR-016) |

## 6. Access

**Database roles** (ADR-016):

| Role | Rights | Used by |
|---|---|---|
| `rosetta_migrator` | owns the schema; `CREATE`, `ALTER`, `DROP` | the migration runner at start-up only (`DATABASE_MIGRATOR_URL`, or `DATABASE_URL` when the host offers one role) |
| `rosetta_app` | `SELECT`, `INSERT`, `UPDATE`, `DELETE` on the tables; `INSERT`, `SELECT` only on `cost_ledger` and `audit_events` (no update or delete) | the server (`DATABASE_URL`) |

When the host provides a single database user, both roles collapse into it and the runbook records that.

**Files**:

- Rosetta writes only inside `<data>` (RF-005); workspace paths are built from ids, then resolved and checked to be
  inside `<data>/users/<actor userId>/`.
- Snapshots are read-only after the fetch (3.3) and are never listed to users.
- The web server serves workspace files only through routes that check the owner (RF-1105), and its own static
  assets; it never serves `<data>` directly.

## 7. Migrations and schema versions

**Database migrations** (RF-1302): files `db/migrations/NNNN_snake_name.sql`, four digits, applied in order, each in
a transaction, recorded in `schema_version` with its checksum. An applied file is never edited; a fix is a new
migration. Number blocks: `0001..0099` release 1 (`0001_accounts`, `0002_projects_runs`, `0003_cost_ledger_audit`,
`0004_server_settings_defaults`), `0100..` later releases.

**File schema versions**:

- Each file kind has its own `schemaVersion`, starting at 1.
- An additive change (a new optional field, a new event type) keeps the version. A change that renames, removes or
  changes the meaning of a field raises it.
- Readers accept the current and the previous version and upgrade the previous one in memory; old run folders are
  never rewritten (DEC-43).
- The version table below is updated in the same pull request as the change.

| File kind | Current version |
|---|---|
| project settings, snapshot, code map, manifest, card, card index, coverage, events, provider calls, egress, cost, application log, transcript, price table | 1 |

## 8. Test data strategy

- Unit tests use in-memory adapters (`MemorySink`, `MemoryLogger`, memory file system); no disk.
- Integration tests create a temporary project folder per test and delete it afterwards; snapshots come from small
  fixture archives under `tests/fixtures/snapshots/`, including one with a path-traversal entry (RF-122).
- Provider traffic comes from recorded responses under `tests/recordings/` through the fake provider (ADR-008);
  GitHub traffic from a fake GitHub client.
- Fixture code from the demo app is limited to small cited excerpts (MIT, attribution kept).
- Database integration tests start one disposable PostgreSQL container per test run, apply every migration, and give
  each test its own schema or a transaction rolled back at the end; unit tests use the memory repositories.
- Test accounts and passwords are generated by the test helpers; none is a real credential.

## 9. Retention

| Data | Retain | Action |
|---|---|---|
| Application logs | `ROSETTA_LOG_RETENTION_DAYS` (14) | deleted at start-up and daily |
| `.partial-*` snapshot folders | until next start-up | deleted |
| Runs, projects, exports | until the user deletes them | delete button in the web UI with confirmation (RF-1012, DEC-55); never automatic |
| Snapshots | until the administrator deletes them | delete button on the administration page (RF-1012) |
| Sessions | until expiry or sign-out | expired rows deleted hourly |
| Audit events | 180 days | deleted daily |
| Users | the life of the deployment | disabled, never deleted (the ledger refers to them) |
| Cost ledger | the life of the deployment | never purged, also not when runs or projects are deleted: it is the source of every total and cap |

## 10. Seed data

| Seed | Where | Used by |
|---|---|---|
| Bootstrap administrator | `ROSETTA_ADMIN_USER`, `ROSETTA_ADMIN_PASSWORD` at first start | `BootstrapAdmin` (RF-1102) |
| Server settings defaults | migration `0004_server_settings_defaults` | caps, queue (RF-1106, RF-1108) |
| Default project settings and ignore rules | `templates/project-settings.json`, `templates/ignore-rules.txt` | `CreateProject` (RF-010) |
| Default price table | `prices/default-prices.yaml` | budget guard, estimator |
| Prompts | `prompts/<role>/` | agent loop (RNF-004) |
| Demo target | `https://github.com/dotnet-architecture/eShopModernizing/tree/master/eShopLegacyWebFormsSolution` | README quick start, milestone run (RF-801) |

## 11. History import

Not applicable: Rosetta replaces no system.

## 12. Open points

None. Q-15 was answered by DEC-54 (USD) and Q-16 by DEC-55 (delete button in the web UI). The tables of section 4
were added by DEC-65 on 2026-10-11.
