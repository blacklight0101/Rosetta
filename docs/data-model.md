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
      planning-brief.json             planning brief for plan (3.20)
      runs/
        <runId>/                      one folder per run (3.6..3.15)
          manifest.json
          events.jsonl
          provider-calls.jsonl
          egress.log.jsonl
          cost.json, cost.md
          cards/<TYPE>/<CARD-ID>.md, cards/index.json
          invalid-output/<agentTaskId>.txt  raw answers of a task that ended InvalidOutput (3.7)
          spec.md
          coverage.json, coverage.md
          transcripts/<agentTaskId>.jsonl
          report/                     static report (RF-500..RF-506)
          handoff/                    hand-off package (RF-600..RF-699)
      exports/<runId>.zip             reserved; the zip export is streamed and writes nothing here (RF-008, architecture `ExportZip`)
```

`<userId>` and `<projectId>` are the UUIDs of their rows (section 4). `<runId>` is `yyyyMMdd-HHmmss-<stage>` in UTC
(for example `20261010-140322-understand`), unique in the project; a second run in the same second gets the suffix
`-2` (RF-003). The project cost ledger moved from `cost-ledger.jsonl` to the `cost_ledger` table (3.13).

## 3. Files

### 3.1 Project settings (`projects.settings`)

Changed 2026-10-11 (DEC-59, DEC-65): the former `rosetta.config.yaml` is now a JSON document in the `settings`
column of the `projects` table, edited on the project's settings page. The source fields moved to columns of
`projects`; the `ui` section is gone and `output` keeps only `transcripts`. Review 2026-10-11 (DEC-107, DEC-112): `scan.allowDenied`, `agents.parallelism` and `budget.allowUnpriced` added; base URLs live only on the key row.

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
| | `<name>.baseUrl` | - | - | not allowed (refused by the schema): an `openai-compatible` base URL is stored with the user's key (`provider_keys.base_url`, RF-1104) and Ollama always uses the server's `ROSETTA_OLLAMA_URL` (DEC-112) |
| | `<name>.keySource` | enum | `user-then-server` | `user` (only the user's stored key) or `user-then-server` (RF-1104); the key itself is never in the settings |
| | `<name>.toolMode` | enum | `native` | `native` or `text` (RF-205) |
| | `<name>.timeoutSeconds` | int | 120 | per call; 10 to 600 |
| | `<name>.maxRetries` | int | 3 | RF-406; 0 to 5 |
| | `<name>.contextTokens` | `auto` or int | `auto` | `ollama` only, refused for other kinds: `auto` picks the largest context that fits the GPU memory Ollama reports; a number (at least 1 024) is sent as `num_ctx` unchanged (RF-401, DEC-114, Q-23) |
| `roles` | `reader`, `verifier`, `planner`, `summariser` | object | - | each `{ provider, model, maxOutputTokens, temperature?, maxTurns? }`; `maxTurns` for `reader` only (RF-201, RF-405); `maxOutputTokens` 256 to 32 768, `maxTurns` 1 to 50 |
| `budget` | `run.maxCostMicros`, `run.maxTokens` | int | template values | hard caps per run (RF-422); cost 0 to 100 000 000 micros (100 USD), tokens 0 to 50 000 000 |
| `budget` | `roles.<role>.maxCostMicros`, `roles.<role>.maxTokens` | int, optional | none | caps of one role's calls in a run (RF-423); added to the run caps, never replacing them, so role caps may add up to more than the run cap and the run cap still binds. A role at its cap has its calls refused with `RST-1600` while the run's other roles go on; the run then ends `CapReached` when it has finished. Not applied to a provider test (RF-407) |
| | `confirmAboveCostMicros` | int | template value | estimate threshold that asks to continue (RF-425); 0 up to the run cost cap |
| | `prices` | list | none | overrides of the shipped price table, same shape as 3.18; applied only to calls with the user's own keys (DEC-107) |
| | `allowUnpriced` | bool | false | run a non-local model missing from the price table, only with the user's own key (RF-427, DEC-112) |
| `scan` | `maxFileBytes` | int | 1 000 000 | larger files are listed as `skipped: too large` (RF-100); 1 000 to 5 000 000 |
| | `areaTokenBudget` | int | 60 000 | RF-104; 4 000 to 200 000 |
| | `areas` | list | none | manual areas `{ name, include: [glob] }` (RF-104) |
| | `excerptMaxLines` | int | 400 | RF-144; 20 to 2 000 |
| | `ignoreRules` | string | the default template | gitignore syntax (3.2) |
| | `allowDenied` | list | `[]` | built-in deny patterns lifted for this project; recorded in the manifest (RF-147) |
| `agents` | `parallelism` | int | 1 for Ollama, 4 otherwise | reader tasks run at the same time (architecture section 8); 1 to 8 |
| `output` | `transcripts` | bool | true | skip transcripts for this project (DEC-43) |

Unknown keys are an error (RF-002), so a typo never silently changes behaviour. The schema is
`src/application/projects/project-settings.ts`; every field is required except the lists and values with no default
(`budget.prices`, `budget.roles`, `scan.areas`, `contextTokens`, `temperature`, `maxTurns`), so a stored document is
complete. A save returns every problem with its dotted field and one of: RST-1001 (unknown provider kind, or a role
naming a provider the project does not define), RST-1002 (a role missing or without a model), RST-1003 (a cap or
price below zero), RST-1004 (a `baseUrl`), RST-1006 (any other value or key that is not allowed); RST-1005 is the
code of the refusal as a whole; a save whose `If-Match` version is no longer the stored one answers RST-1007 with status 409. A new project takes `templates/project-settings.json` with `scan.ignoreRules` from
`templates/ignore-rules.txt`, the provider and model of each role from the server setting `defaultRoles` where set,
only the providers its roles use, and `agents.parallelism` 1 when the reader is Ollama (DEC-106). The numbers in
`templates/project-settings.json` (run cap, confirmation threshold, output limits, turns, timeouts) are
the owner's confirmed defaults (DEC-116); the numeric fields have the allowed ranges of the table above (DEC-117) and a
value outside a range is RST-1006; the placeholder model is `gemma4:e4b`, the best reader measured
so far (providers.md 2.6), until the reader spike (P1-47) decides.

### 3.2 `.rosettaignore`

Changed 2026-10-11: the rules are the `scan.ignoreRules` field of the project settings (3.1). Gitignore syntax,
matched against repository-relative paths (RF-140). A `.rosettaignore` file committed in the analysed repository is
also read and joined to the setting; it can only add exclusions, never lift the setting's rules or the built-in deny
list (DEC-109). The default template lists common secret and binary
patterns (`*.pfx`, `*.key`, `*.env`, `appsettings.*.json` with secrets, `*.mdf`, images and archives).
No `schemaVersion`: the format is the standard gitignore syntax.

### 3.3 Snapshot cache: `sources/<owner>__<repo>@<sha>/`

| | |
|---|---|
| Purpose | the legacy code at one commit, downloaded once and read-only afterwards |
| Writer | `GitHubSnapshotFetcher` only, once per commit (RF-122) |
| Readers | scanner, agent tools, verifier, through `RepositoryReader` |
| Spec | RF-120..RF-126, RF-005 |

- The folder name is lower case (`<owner>__<repo>` as GitHub names are case-insensitive), so a cached commit is
  found however the URL was typed; `snapshot.json` keeps GitHub's spelling.
- The archive is extracted into `sources/.partial-<uuid>/` (id from `IdGenerator`); an entry with an absolute path or
  a `..` segment stops the fetch with `RST-1906` and the partial folder is deleted (RF-122, ADR-019); link entries are
  skipped and counted (RF-127). When extraction and hashing finish, the folder is renamed to its final name, so
  a half-finished download never looks complete. Leftover `.partial-*` folders are deleted at start-up.
- The repository tree goes under `files/`; `snapshot.json` sits next to it, outside the analysed tree.
- After the rename, files are marked read-only where the operating system allows it; the reader opens files
  read-only in any case.
- Two fetches of the same commit take an in-process lock per `owner/repo@sha`; a rename that fails because the
  target exists deletes its own partial folder and uses the existing snapshot (DEC-112).

`snapshot.json`:

| Field | Type | Notes |
|---|---|---|
| `schemaVersion` | int | 1 |
| `url` | string | canonical `https://github.com/<owner>/<repo>` |
| `owner`, `repo` | string | as returned by the GitHub API (case preserved) |
| `commitSha` | string | 40 hex characters |
| `resolvedFrom` | string | the ref that was asked for, or the default branch when the URL had none |
| `downloadedAt` | instant | |
| `fileCount`, `totalBytes` | int | regular files under `files/` |
| `skippedLinks` | int | symbolic and hard link entries skipped during extraction (RF-127) |
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
| `scannerVersion` | optional non-negative int | RF-113: scanner revision, currently 1. New scans record it; older files without it remain readable and are treated as out of date. Increase the revision when scanner behaviour warrants rebuilding existing maps. |
| `source` | object | `{ owner, repo, commitSha, subpath }` |
| `files[]` | list, sorted by `path` | `{ path, language, lines, estimatedTokens, sha256, artefactKinds[], mapLevel, skipped? }`; `skipped` is `too-large`, `binary` or absent; `sha256` is absent on a `too-large` file (it is never read), and `lines` and `estimatedTokens` are 0 on any skipped file; a binary format named by its extension (images, archives, `.dll`) is left out of the list, while a file whose first 8 000 bytes hold a zero byte is listed as `skipped: binary` |
| `areas[]` | list, sorted by `name` | `{ name, files[] (paths), estimatedTokens, mapLevel, origin }`; `origin` is `folder`, `references` or `config` (RF-104) |
| `symbols[]` | list, sorted by `path`, `startLine` | `{ path, kind, name, startLine, endLine, container? }` from language packs (RF-110, RF-111) |
| `links[]` | list, sorted by `from`, `to`, `kind` | `{ from, to, kind, symbol? }`, for example an `.aspx` page to its code-behind file (`to`) and the class named by its `Inherits` attribute (`symbol`); `to` is always a scanned file (RF-111) |
| `sqlStatements[]` | list | `{ path, line, verb, text }`, text cut to 500 characters (RF-103) |
| `entities[]` | list | candidate entities `{ name, path, startLine, source }` (RF-111) |
| `languagePacks[]` | list | `{ name, version }` used |

No times and no absolute paths, so two scans of the same commit are byte-identical (RF-106). The file hash
(`codemapHash`, SHA-256 of the file) goes into the run manifest.

Rules for `areas[]` (RF-104, added with P1-20):

- A file in the `config` areas of the settings (3.1) goes to the first area whose patterns match it (gitignore syntax); every
  other file is grouped automatically. Links never join a configured area.
- Automatic grouping: each top-level folder is one area (`name` is the folder path; files at the root form `(root)`).
  A folder over `scan.areaTokenBudget` is split by sub-folder; its own files stay in an area named after the folder.
  Files that a language pack links (a page and its code-behind) are put in the area of the linking file, with
  `origin` `references`, when together they fit the budget.
- A group still over the budget is cut, in path order and never between linked files, into parts named `<name>#1`,
  `<name>#2`, and so on. A single file larger than the budget is the one allowed exception and forms an area alone.
- An automatic name gets ` (auto)` appended until neither it nor its numbered parts equal a configured name or another
  area's name; two configured areas whose names (parts included) collide are refused.
- `mapLevel` of an area is `symbols` when at least one of its files is `symbols`, else `coarse`.
- Every text taken from a repository (file paths, area names, `subpath`, SQL text, symbol and entity names, link
  symbols) is passed through the secret masker before it is written (RF-141); `sqlStatements[].text` is cut to 500
  characters after masking. The scan keeps up to 1 536 characters of a statement for the masker, and every cut the
  scan makes (that window, and the 4 000-character line limit) falls between words: when it would fall inside a run
  without white space, the whole run is dropped. Every masker rule matches inside one such run (keys, connection
  URLs, `password=value`) or runs to the end of the text once its keyword is seen (key blocks, quoted values,
  `;Password=`, a CDATA value of an XML password element); the one exception is the XML password element without
  CDATA, whose value may start after blanks, may hold spaces and ends at its closing tag on the same line, so a cut
  that falls between the opening tag and the closing tag drops the open element with its value (P1-112, P1-124). So a secret whose end was cut away (for example the `@` of a connection URL) is never kept in part.
  A wider window alone would not be enough: masking shortens the text, so the cut end can reach the first 500
  characters. The 500-character cut after masking falls between words as well, so it never leaves half a marker or
  a bare `scheme://user:` behind. A statement with no white space before a cut keeps an empty text.
- File paths and area names that masking changed and that then share one masked form get `~1`, `~2`, ... in the
  code-unit order of the real names, so two files that differ only by a secret stay distinct. The suffix is an
  ordinal, not a hash, so it cannot confirm a guessed secret. If a masked or suffixed name still equals another name, the map
  is refused (`duplicate-file` or `duplicate-area-name`) and nothing is written.
- Reading `codemap.json` checks the 40-character lower-case `commitSha`, `endLine >= startLine` of a symbol, and
  that each area's `files` are sorted.
- Routes found by a language pack are not written to the code map in this release (3.4 has no field for them).

### 3.5 `scan-summary.md`

Readable summary of the code map: source and commit, the scan duration (the only value that differs between two scans
of one commit, which is why it is here and not in `codemap.json`), languages with files, lines and tokens, artefact
counts, areas with file and token counts, map level and origin (RF-105, RF-112). The files line also counts the
skipped files and the files a language pack claims that stayed `coarse` because the scan-wide parse budget was spent
(`not analysed: parse budget reached`, P1-75). Generated; never read back.

### 3.6 `runs/<runId>/manifest.json`

| | |
|---|---|
| Purpose | what a run was, what it used and how it ended; the key to repeat it |
| Writer | the run lifecycle (`RunLifecycle`) through `RunManifestStore`: when the run is accepted (so the options survive a restart while the run is queued), when it starts, when its source is resolved and when it ends (RF-003, RF-126); the whole file is replaced atomically each time |
| Readers | report, history in the web UI (RF-1008), resume (RF-006), export |
| Spec | RF-003, RF-126, RF-141, RNF-002, RNF-004 |

| Field | Type | Notes |
|---|---|---|
| `schemaVersion` | int | 1 |
| `runId`, `stage` | string | `stage`: `scan`, `understand`, `verify`, `report`, `plan` |
| `rosettaVersion` | string | |
| `startedAt`, `endedAt` | instant | `startedAt` is `null` while the run waits in the queue, `endedAt` while it is not over |
| `endState` | `RunEndState` | `null` while the run is not over; set exactly once |
| `resumedFrom` | string | the earlier `runId` when resumed (RF-006) |
| `source` | object | `{ url, owner, repo, ref, commitSha, subpath, snapshotHash }` (RF-126) |
| `codemapHash` | string | |
| `options` | object | the start request's options (areas, answers option, consent) and the scan settings the run used (`ignoreRules`, `maxFileBytes`, `areas`, `areaTokenBudget`; DEC-121). An understand run records `{ areas?, cloudConsent, withAnswers? }`: `areas` only when the request sent the field, as sent; an absent or empty `areas` list means every area (RF-200, P1-98); `cloudConsent` always (P1-33, RF-143); `withAnswers: true` only when the request asked for the re-run with answers (RF-241, P2-05) |
| `roles` | object | per role `{ provider, kind, model, modelVersion, modelDigest?, toolMode, maxOutputTokens, temperature, maxTurns }`; `modelVersion` is the exact id the provider reports, `modelDigest` the Ollama digest (RNF-004); `contextTokens` and `contextSource` are the Ollama context size sent as `num_ctx` and how it was chosen (`fixed` from the start, or `auto-fit`, `auto-floor`, `auto-model-limit`, `auto-fallback` after the first call; RF-401, DEC-114), `null` until then |
| `promptVersions` | object | prompt file name to `{ version, sha256 }` (RNF-004): the path under `prompts/` (`reader/area.v2.md`), its version (`v2`) and the SHA-256 of its bytes, names in code-unit order; an understand run lists the reader's prompt files, plus `shared/text-tool-protocol.v1.md` when the reader uses Ollama with `toolMode: text` (RF-205), plus `summariser/merge.v1.md` once the summariser has answered a merge call (RF-250), plus `reader/answers.v1.md` when a re-run with answers has a task (RF-241) |
| `security` | object | `{ deniedReads, refusedRequests, skippedLinks, blockedCalls, allowDenied[] }` counts and lifted deny patterns (RF-009, RF-127, RF-147) |
| `priceTable` | object | `{ version, currency }` |
| `catalogue` | object | `{ version, sha256 }` of the principle catalogue (RF-606, RNF-004) that a plan run used, `null` for the other stages and for a manifest written before this field; the version is the one the catalogue README declares and the SHA-256 runs over every catalogue file by name |
| `caps` | object | run and role caps in force |
| `masking` | object | count per secret kind (RF-141): `api-key`, `bearer-token`, `connection-string`, `password`, `private-key` (the kinds of `SecretMasker`, `src/infrastructure/guards/secret-masker.ts`), kinds in name order; the egress guard adds the secrets of content an agent task sends for the first time, so a message repeated by later calls counts once. The counts are numbers and are stored unmasked |
| `totals` | object | `{ inputTokens, outputTokens, cachedInputTokens, costMicros, calls }` |
| `agentTasks[]` | list | `{ agentTaskId, area, role, state (AgentTaskState), turns, cards }`; every planned task is listed `Planned` before the first starts and updated in place, so the list keeps the area order; a task the run never started stays `Planned`. The agent tasks, the budget guard's totals and the egress guard's counts update the file through one queue per run, so none overwrites another (P1-33) |

A field that is not known yet is `null` (or `{}` / `[]` for objects and lists), never absent, so the file always has the
same fields; `source.commitSha` and `source.snapshotHash` are `null` until the source is resolved, and `roles[].modelVersion`
and `modelDigest`, and `contextTokens` and `contextSource` for `auto`, until the first call. The file is masked like every file Rosetta writes (RNF-003). A file with a
newer `schemaVersion` is refused with RST-2106. The queue's run row mirrors the end state, the commit and the snapshot
folder (section 4, `runs`); the folder name is the `runId` of this file and of every event, while URLs use the row's `id`.

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
| `questionState` | `OpenQuestionState` | `OQ` only (RF-241); a re-run with answers changes `Open` to `Answered` in the card file of the run that raised the question, in this field and in the `State:` line of the body, once the area's task ended `Done` and the run's cards were written |
| `mergedAreas[]` | list | the areas of the merged cards, in card order, left out for a card that was not merged; a later merge of the kept card reads them, so cards that all come from one area are never merged (RF-250) |
| `mergedFrom[]` | list | card ids merged by consolidation (RF-250), the kept card's own id first, the union over a chain of merges; the card keeps the id, area and task of its first member and every claim of all members (claim ids renumbered `<id>.c<n>`, status and verdict kept) |

A rejected or invalid claim is never removed; only its status and verdict change (RF-302). The card files, the index
and `spec.md` are written together: each file's previous content is read first, and when a write is refused or fails
part-way every file already written gets its previous content back and a file that did not exist is removed
(RNF-002); a file that cannot be put back is logged and the original refusal is returned, even when the log entry
itself cannot be written. The writer does not lock: card writes to one run folder must be serialised by the caller,
because two writes at once would each take the other's half-written files as the previous content. An understand run
rewrites the whole set after each task ends (the cards of every ended task, ids given in area order), one write at a
time per run folder, so a run that stops keeps the cards of the tasks that ended (P1-33). Every claim passes the citation check
(verifier step 1) before it is written: a citation of a path that is not a file of the code map, a range whose start or end
is not a whole number or that breaks `1 <= start <= end`, or a range that ends after the file's last line, makes the claim `CitationInvalid` with the reason in its verdict
(`{ step: citation, model: citation-check }`); a claim that passes stays `Proposed` until the judgement step (DEC-103).

In the header a citation is the string `path:startLine-endLine`; absent optional fields are left out. Every string is a
double-quoted scalar, so model text cannot add a key. `cards/index.json` has `schemaVersion` and `cards`, and its
`claimCounts` always lists all five statuses.

The valid cards and claims of an answer are kept; invalid claims and cards are dropped and listed in the application log (RF-208).
When no valid card is left after the follow-ups (up to two repairs, or continuations of a cut-off answer), the task ends
`InvalidOutput` (RST-1300). The raw answers of a task that ended `InvalidOutput`, or that kept cards but dropped something, are
saved, masked, in `invalid-output/<agentTaskId>.txt`, separated by `=== attempt n ===` lines; those of a task that was run again
(RF-208) are all kept, the first run's first. A task that ends with no usable card is run once more from the start with a fresh
conversation (an area that met its context limit, in two halves); the retry's transcript and calls carry the id
`<agentTaskId>-retry`, or `<agentTaskId>-retry-1` and `-retry-2` for the halves (3.15).

`cards/index.json` lists every card `{ id, type, title, area, path, claimCounts per status }`, sorted by `id`.

### 3.8 `spec.md`, `coverage.json`, `coverage.md`

- `spec.md`: the cards per area as one readable specification with links to the card files and, for every citation, to the
  cited lines on GitHub (RF-204, RF-125). Areas and cards keep the order of the run (area and appearance order); every claim
  is listed with its status, rejected ones included. The run summary of a re-run with answers (RF-241) adds `## New cards` and `## Changed cards` after the areas, each only when it has cards: a card is new when the earlier run that raised an answered question has no card of the same area, type and title, and changed when it has one whose claim texts differ. A last section, `## Areas without cards`, names every area whose
  reader ended `Done` without a card (suspicious: the answer must say `{"cards": []}` explicitly), so it is seen (P1-33).
- `coverage.json`: `{ schemaVersion: 1, areas }` where each area is
  `{ area, files: [{ path, read: [{ startLine, endLine }] }], tokens, readTokens, readTokenShare, failure? }`, where `failure`
  (RF-208) is present only for an area whose task gave no usable card, in a few words with the code (`invalid output
  (RST-1300)`); feeds the web UI
  coverage map (RF-1005) and the report. Areas keep the order of the run and list only tasks that ended; `files` is
  every file of the area in the area's order, `read` the line ranges the task's tools returned (a read, the lines of
  grep matches, the statements of a code map entry), cut to the file, sorted and merged, empty for a file not read;
  lines of files outside the area are not counted. `tokens` is the area's estimated tokens, `readTokens` each file's
  estimated tokens in proportion to its lines read (rounded per file, then summed), `readTokenShare` their ratio from 0
  to 1 with four decimals (0 for an area without tokens). It holds no times, so the same coverage gives the same bytes. Rewritten with
  the cards after every task that ends (P2-04).
- `coverage.md` is its readable form (RF-230): a `## Run summary` table with, per area and for all areas, the files
  read of the files listed and the percentage of area tokens read, then one `## Area: <name>` table per area with each
  file and its read lines or `not read`. When an area failed (RF-208) a `## Failed areas` list follows the run summary.

### 3.9 `events.jsonl` (run events)

| | |
|---|---|
| Purpose | the ordered story of a run, streamed live to the web UI and replayed by the report |
| Writer | `JsonlEventLog` behind the `RunEventSink` port (RF-1006) |
| Readers | web UI (late subscribers read it before live events, in batches; the last `seq` of a run not in memory comes from the last complete line, read from the end of the file), report replay (RF-506) |
| Spec | RF-1002..RF-1006, RF-506 |

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
| `scan.completed` | `{ files, areas, mapLevels }` where `mapLevels` is `{ coarse, symbols }`, the number of files at each level |
| `agent.planned` | `{ area, role, model }` |
| `agent.started` | `{ area, role, model }` |
| `agent.turn` | `{ turn, inputTokens, outputTokens }` |
| `agent.tool.called` | `{ turn, tool, args }` where `args` holds paths, line ranges and patterns, never file content |
| `agent.tool.result` | `{ turn, tool, ok, linesReturned?, refusedReason? }` |
| `agent.card.proposed` | `{ cardId, type, title, claims }` |
| `agent.ended` | `{ state (AgentTaskState), turns, cards }` |
| `verify.citation.checked` | `{ claimId, ok, reason?, text?, citations? }` where `text` is the claim text and `citations` its cited lines `[{ path, startLine, endLine }]`, so the live run page can list the claim and link its lines (RF-1004); readers that predate the two fields ignore them |
| `verify.claim.judged` | `{ claimId, status, reason }` |
| `usage.recorded` | `{ callId, role, provider, model, tokens, costMicros, runTotals, projectTotals }` (RF-1003, RF-1010), published by the run's budget guards (`RunBudgetEvents`) after each answered call's ledger row, with the call's agent task in the envelope; `tokens`, `runTotals` and `projectTotals` are `{ inputTokens, outputTokens, cachedInputTokens }` (the totals with `costMicros`), the totals starting from the run's ledger rows and the project's totals when the run opened its providers; `costMicros` is 0 for a local model and left out when the model has no price (RF-427); never a prompt, an answer or a key |
| `budget.warning` | `{ scope (run or role), sharePercent }` at 50, 80 and 95 percent, once per level; for `run` the share is the higher of the run cost and run token shares |
| `budget.capReached` | `{ scope, capMicros, spentMicros }` once per run, when a cap first refuses a call and stops the run (parallel calls refused by the same stop give one event); `scope` is the cap's kind (`run-cost`, `user-day`, `own-day`, `server-month`, `run-tokens`) and `spentMicros` what was spent or reserved against it; the run token cap gives `{ scope, capTokens, spentTokens }` instead. A role cap (`role-cost`, `role-tokens`, RF-423) stops only that role, so it adds `role` and is reported once per role and kind, without ending the once-per-run event of the cap that stops the run |
| `question.answered` | `{ cardId }` (RF-1007) |
| `run.ended` | `{ endState, totals, errorCode?, failedAreas? }`; `errorCode` is the `RST` code of a `Failed` run; `failedAreas` (RF-208) is the number of areas of a `Completed` understand run whose task gave no usable card, left out when there are none. A run ends `Failed` only when every task failed (a provider failure), as before |

New event types may be added without a version bump; a reader ignores types it does not know. Each line is masked before
it is stored (RNF-003). A crash can leave a last line without its line break: readers ignore it and the writer removes it
before the next event, so a resumed run continues from the last complete line. A run that is cancelled while queued, or
ended by restart recovery, has only the events it had plus `run.ended`. Application log
entries are not run events: the web UI logs panel receives them on its own stream (RF-1011).

### 3.10 `provider-calls.jsonl`

| | |
|---|---|
| Purpose | one record per provider call attempt, for observability |
| Writer | the `ObservedProvider` decorator through `ProviderCallRecorder` (RF-408); a call the budget guard refuses is recorded by the guard through the same recorder with status `refused-by-cap` |
| Readers | web UI API calls panel (RF-1011): `FileRunCallReader` behind `GET /api/runs/:runId/calls`, owner-scoped, masked again on read, a torn last line ignored; the user |
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
| `modelVersion` | string | the exact model version the provider reported, on an attempt that answered (RNF-004) |
| `endpointHost` | string | host only, never a full URL with a query |
| `requestId` | string | the provider's request id when it returns one |
| `startedAt` | instant | |
| `timeToFirstTokenMs`, `latencyMs` | int | per attempt; without streaming the first token arrives with the answer, so both are equal |
| `inputTokens`, `outputTokens`, `cachedInputTokens`, `usageSource` | int, enum | |
| `costMicros`, `currency` | int, string | |
| `finishReason` | string | normalised: `stop`, `length`, `tool_use`, `error` |
| `status` | enum | `ok`, `retried`, `failed`, `refused-by-cap` |
| `errorCode` | string | `RST-xxxx` when not `ok` |
| `httpStatus` | int | when there was an HTTP response |
| `ollama` | object | Ollama only: `{ loadDurationMs, promptEvalDurationMs, evalDurationMs, tokensPerSecond, contextTokens, contextSource }`; `contextTokens` is the `num_ctx` sent and `contextSource` how it was chosen: `auto-fit` (largest size that fits GPU memory), `auto-floor` (4 096 although the model spills), `auto-model-limit` (the model's trained context), `auto-fallback` (Ollama could not be measured, so the start size was sent, or 4 096 when a larger size had already spilled; reused for 30 seconds, then measured again) or `fixed` (the project's number); both are absent in records written before DEC-114 |
| `transcriptRef` | string | `transcripts/<agentTaskId>.jsonl#<line>` when transcripts are on: the first transcript line the call added, or the transcript's last line when the call repeats the same messages; every attempt of the call carries the same link |

An attempt that failed (`retried` or `failed`) has no usage from the provider: its token fields and `costMicros` are
0, `usageSource` is `estimated` and `finishReason` is `error`.

Tracing vocabulary (DEC-57): a run is a trace, an agent task a span, a provider call a child span. Field names map to
the OpenTelemetry GenAI semantic conventions so an exporter can be added later without renaming (deferred, ADR index):
`provider` -> `gen_ai.system`, `model` -> `gen_ai.request.model`, `modelVersion` -> `gen_ai.response.model`,
`inputTokens` -> `gen_ai.usage.input_tokens`, `outputTokens` -> `gen_ai.usage.output_tokens`, `finishReason` ->
`gen_ai.response.finish_reasons`, `requestId` -> `gen_ai.response.id`. Nothing is sent anywhere (no telemetry).

### 3.11 `egress.log.jsonl`

| | |
|---|---|
| Purpose | exactly what left the machine and where: one line per model call the egress guard let through (RF-142) |
| Writer | the `EgressGuard` through `JsonlEgressLog` (the `EgressLog` port), as the last step before the call is sent (after masking and the manifest counts), so a line always means a sent call; a line that cannot be stored blocks the call (`RST-2107`) |
| Readers | the user (audit), export |
| Spec | RF-141, RF-142, RNF-003 |

| Field | Type | Notes |
|---|---|---|
| `schemaVersion` | int | 1 |
| `seq` | int | 1, 2, 3 ... within the run, no gaps; continues after the complete lines a resumed run's file holds, and a torn last line is removed before the next line |
| `at` | instant | when the guard let the call through |
| `callId` | string | the call's id, as in `provider-calls.jsonl` |
| `provider`, `model`, `role`, `agentTaskId` | string | the provider's name in the project settings |
| `excerpts` | list | `{ path, startLine, endLine }` of every excerpt in the request's data blocks, in message order (a path with a marker look-alike is recorded with its name broken by a bar after `ROSETTA`); each call repeats the earlier messages, so it lists their excerpts again |
| `maskedCounts` | object | the secrets masked in this call's request, per kind of section 3.6 (every kind, zero included) |

Content is never copied here: no excerpt text, no message text, no secret. The line is masked like every file
Rosetta writes, except `maskedCounts`, whose keys are the masker's own kind names. A blocked call writes no line; it is
a `security` log entry and a `blockedCalls` count in the manifest.

### 3.12 `cost.json` and `cost.md`

Written when the run ends (RF-426): `{ schemaVersion, runId, currency, priceTableVersion, totals, byRole[],
byAgentTask[], byProvider[], byModel[] }`, each entry with the token fields, `calls` and `costMicros`. `cost.md` is
the readable table. `totals` also counts `unpricedCalls` (calls of an unpriced model on the user's own key, cost
unknown, RF-427); `priceTableVersion` names every version the calls used, sorted and joined by `, `; each list is
sorted by its key in code-unit order. Both files are built from the run's `cost_ledger` rows and masked. Every
figure is a JSON number that must be a safe integer: a run whose totals pass the largest safe integer (2^53 - 1) is
refused with RST-1605 rather than written with rounded figures.

### 3.13 Cost ledger (the `cost_ledger` table)

Changed 2026-10-11 (DEC-65): the project's `cost-ledger.jsonl` became the `cost_ledger` table (section 4), so caps can
sum across users and the server (RF-1106).

| | |
|---|---|
| Purpose | every model call of every run of every user; the source of all totals and caps |
| Writer | the budget guard: before the call it inserts a `cost_reservations` row in the transaction that checks the caps; after the call it inserts the ledger row and deletes the reservation in one transaction (RF-428, DEC-112) |
| Readers | web UI header (RF-1010), cost page, caps (RF-1106), administration page, report dashboard |
| Spec | RF-428, RF-1010, RF-1106, DEC-49 |

The cost of each row is fixed when the call is made and never recomputed. Totals are sums over the rows; rows in
different currencies are totalled per currency. Rows are never deleted with runs or projects (DEC-55).

### 3.14 Application log: `<data>/logs/rosetta-YYYY-MM-DD.jsonl` and standard output

Line: `{ schemaVersion, at, level, logger, message, code?, runId?, agentTaskId?, callId?, data? }`; `level` is
`debug`, `info`, `warn` or `error`; `userId` is added when a request or run has one. The same entries go to standard
output as JSON lines at `ROSETTA_LOG_LEVEL` and above. One file per UTC day; files older than `ROSETTA_LOG_RETENTION_DAYS` (default 14) are deleted at
start-up and daily (RF-009): a file is deleted when its UTC day is more than that many days before today, and
only files named `rosetta-YYYY-MM-DD.jsonl` are touched. Every entry passes the secret masking: `logger`,
`message`, the ids and every key and string inside `data` are masked as `[MASKED:<kind>]`, with line breaks kept.
A `data` key at any depth whose name contains `password`, `passwd`, `pwd`, `secret`, `token` or `api key`
(`api[_-]?key`), in any case, has its whole value replaced, whatever its type: `[MASKED:api-key]` for an API key
name, `[MASKED:bearer-token]` for a token name, otherwise `[MASKED:password]` (P1-62). A count is
therefore never written under such a name: the Ollama context size is logged as `contextSize`, not `contextTokens`
(P1-112). Records kept by the shared deep masking (provider call lines, transcripts, run events, audit details) apply the
same whole-value rule to a key whose last word is `secret`, `secrets`, `token`, `authorization` or `bearer`
(`accessToken`, `client_secret`, `X-Auth-Token`, `proxyAuthorization`), or whose last two words are `secret key`,
`secret value` or `token value` (`secretKey`, `tokenValue`, `accessTokenValue`), or the plural `tokens` after a word
that names a credential (`access`, `refresh`, `id`, `auth`, `bearer`, `session`, `api`, `jwt`: `refreshTokens`,
`access_tokens`), besides the `password`, `passwd` and `pwd` keys they already had. Keys are split into words at
camelCase, acronym runs, `_`, `-` and digits, and a short suffix that starts with a digit (`2`, `_2FA`) is not a word,
so `Secret2FA` and `Secret_2FA` match; the last words decide, so `inputTokens`, `timeToFirstTokenMs`, `secretCount`
and `primaryKey` keep their values (P1-112, P1-124).
When masking fails the entry is withheld (fail closed, DEC-57): a `warn` entry with logger `security`, code
`RST-2101` and the fixed message `Log entry withheld because secret masking failed.` is written instead, with
nothing of the original entry; it is filtered by its own level, so it reaches standard output at `info`.
The Logs panel (RF-1011, `GET /api/runs/:runId/logs`) reads these files through `FileApplicationLogReader` (at most 31 days, masked again on read) and shows an entry to the owner of a run only when its `runId` is the run's id and any `userId` it carries is the owner's, or its `runId` is the run's key and its `userId` is the owner's. An entry with the key and no user is never shown: the key is unique per project only and a deleted run's entries stay in the files, so it may belong to another user's run that is gone (P1-122). The run's own writers therefore name the owner beside the key: `ownerLogger` for the understand session and for the egress and budget guards that the provider factory builds for the run (their security events and cap refusals), and the queue and the lifecycle directly.

### 3.15 `transcripts/<agentTaskId>.jsonl`

The masked messages exchanged with the model for one agent task, one message per line `{ schemaVersion, seq, at,
callId, role (system, user, assistant, tool), content, toolCalls? }`. Written unless the project setting `output.transcripts` is false (DEC-43).
Content is exactly what was sent after masking, so it may contain excerpts of the legacy code. Writer: the
`ObservedProvider` through `ProviderCallRecorder` (RF-408): the system prompt on the task's first call, then each
call's new messages before it is sent and its answer after. The messages of a task are append-only (each call repeats
the earlier ones unchanged), so only the new ones are written. Every key and string is masked, and every value is
masked again together with its property name, so a secret held under a key such as `password` is masked too, and so
is each item of an array held under such a key; when masking fails nothing is written and the call is not sent
(DEC-57). The agent task id must be a plain file name. `seq` continues after the lines a file already holds, so a
resumed run (RF-006) never repeats a number; a partial last line left by a crash mid-append is counted and kept as
it is, and the next record starts on a new line.
The same holds for `provider-calls.jsonl`.

### 3.16 `answers.md`

Generated skeleton, then edited by the user on the answers page (RF-240, RF-1007, Q-11). One section per open question:

```markdown
## OQ-003 - Is a catalog item with zero stock still shown?

- Card: runs/20261010-140322-understand/cards/OQ/OQ-003.md
- Context: Catalog/Default.aspx.cs:41-58 filters on ...
- Answer:
```

The heading carries the card id and the run, so a later run matches answers by card id and question text; an
existing answer is never overwritten. `RunUnderstand` adds the `OQ` cards of the run when it ends (stopped runs
included): a question whose heading text is already in the file is skipped, new sections are appended after the
existing ones, the question and context are one line each and masked, and the context is the card's first citation
followed by its first claim (P1-33, DEC-98).

A run started with the answers option (RF-241, P2-05) reads the sections whose answer line has text and whose `- Card:` line is exactly `runs/<run folder>/cards/OQ/<card id>.md` for that section's own heading; any other card line (another card, a path out of a run folder) names no run and the section is ignored.

The live run page records answers (`RecordAnswers`, P1-39, RF-1007): a question belongs to the run its `- Card:` line
names, and an answer replaces the text after `- Answer:` on that section's first answer line (a section that lost the
line gets it after its last line). The answer is masked and written on one line (line breaks become spaces, so it can
never start a heading or another field); an empty answer leaves `- Answer:` bare. No other line of the file changes,
and writes to one project's file run one after another. A file saved with CRLF or lone CR (old Mac) line ends, or with a
byte-order mark before its first line, is read like one with LF. Every line keeps its own line end, also in a file that
mixes them; a new answer line or appended section takes the end of the line before it, and the mark is kept, also in a
file that holds only the mark (P1-126, P1-135).

### 3.17 Report and hand-off folders

`report/` (RF-500..RF-506) and `handoff/` (RF-600..RF-699) are generated from the files above. `handoff/` is
defined by the plan cards in P3 and documented in this section then.

`report/` is written by the `BuildReport` use case (P1-43) and holds, all directly in the folder: `report.md` (links the
specification, every card, the cost report and, once P2-04 writes one, the coverage report; a link is written only for a
file the run has), `report.html` (the same report as escaped static HTML, DEC-112), `replay.html` (the run replay: agents,
turns, tool calls, cards, verdicts and cost from `events.jsonl`, as a list that needs no script, with play, pause and
step added by `replay.js` when scripts run), `report.css` and `replay.js`. The pages carry a `<meta>` content security
policy and `referrer` of no-referrer (RF-1013); repository and model text is escaped, and only links that start with
`https://github.com/` stay links (RF-507). The server serves these five files as pages, styles and scripts; every other
file of a run folder is text or a download.

Contents (RF-112). Besides the run facts, the documents and the cards, both report pages list the areas of the code map with
their map level, `coarse` or `symbols`, the value `scan-summary.md` shows. They come from the run's own scan, or for an
understand run from the newest scan of its project that ended `Completed`; a report built without such a scan (none, or
its output is gone) has no areas section. Area names are repository text and are escaped like the other repository text.

Writing the report. Each of the five files is written to a temporary name and renamed over its final name, so a file
is always whole or absent and never half written. The set of files is not written atomically: a build that fails
part-way (RST-1701) can leave some files new and the others from an earlier build (for example a new `report.html`
beside an old `report.md`). Building again writes all five again, with the same bytes for the same run. A run that
recorded no events still builds: its replay page says so and has no controls.

The `<meta>` content security policy of the report pages carries no `frame-ancestors`: browsers ignore that directive
in a `meta` element, only the response header can carry it, and the run file route sets it there (RF-1013, with
`X-Frame-Options: DENY`).

### 3.18 Price table

Shipped as `prices/default-prices.yaml` in the Rosetta repository: `{ schemaVersion, version (date),
currency, models: [{ provider kind, model, inputPerMillionMicros, outputPerMillionMicros,
cachedInputPerMillionMicros }] }`. Ollama models have price 0. Overrides in the configuration use the same entry
shape (RF-420, RF-427). Every price is a whole number of micro-dollars up to 2^53 - 1 and a model is listed once per
provider kind; a file that breaks this stops the server with `RST-1602`. A call priced with a project override
(user's own key only, DEC-107) records the version `<version>+project`.

### 3.19 Evaluation results: `eval-out/<date>-<id>/`

Written by `npm run eval` (RNF-006, RNF-015, RF-305), inside the Rosetta repository's git-ignored `eval-out/`, never
in a user's project: `experiment.json` `{ schemaVersion, id, at, rosettaVersion, roles (with modelVersion and
modelDigest), promptVersions (with sha256), goldenSetVersion, repetitions }` and `results.json` with per-case scores
per repetition, precision, recall, the spread across repetitions, cost per supported claim, and, with the calibration
set, the verifier's agreement rate.

### 3.20 `planning-brief.json` (added 2026-10-11)

The answers saved by Plan setup (RF-605, ADR-018): `{ schemaVersion, savedAt, catalogueVersion,
principles: [entryId], architecture: { style, recommended: [style], evidence: [cardId] },
migration: "strangler-fig" | "parallel-change" | "rewrite", stack: [{ layer, choice, custom }],
context: { teamSize, experience, deadline, keepIntegrations: [text], dataMigration }, buildMethod: { aiAssisted },
defaulted: [questionId] }`. `defaulted` lists the questions that took their default, so the package can list them
as open questions (RF-604). Free-text answers are untrusted input: they reach the planner only inside labelled data
blocks (ADR-013). `plan` copies the brief and the catalogue version into the run manifest (RNF-004).

Rules (P3-06): a question the user did not answer takes its default and is named in `defaulted`, as `principles`,
`architecture`, `migration`, `stack.<layer>` (one per layer of RF-609: `language-runtime`, `backend-framework`,
`front-end`, `database`, `data-access`, `testing`, `hosting`), `context.<field>` and `buildMethod`. The defaults are:
the catalogue entries switched on (DEC-74) for `principles`, `strangler-fig` for `migration` (RF-610),
`layered` for `architecture.style` with no recommendation, `{ aiAssisted: false }`, no `stack` entry for an
unanswered layer, and `null` or an empty list for the context fields; nothing is invented (DEC-80). `principles`
holds catalogue entry ids other than the architecture styles, sorted and without repeats; `stack` holds at most one
entry per layer, in layer order, each choice at most 200 characters; the context texts at most 500 characters, up to
20 integrations, `teamSize` a whole number from 1 to 10000. The file is replaced whole by each save and not touched
when the answers are the same as the stored ones, so `savedAt` moves only with a change. The brief is *out of date*
when `savedAt` is later than the start of the newest `Completed` run of stage `plan` of the project (the package
was written from an earlier brief); a project with no such run is never out of date.

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
| `password_hash` | `text` | `scrypt$N$r$p$salt$hash` (base64); never selected by list queries; never in an error cause |
| `failed_sign_ins` | `int` | reset to 0 on success, and when `first_failed_at` is older than 15 minutes; `CHECK (failed_sign_ins >= 0)` |
| `first_failed_at` | `timestamptz` null | start of the current failure window (RF-1100, DEC-112) |
| `locked_until` | `timestamptz` null | set for 15 minutes after the fifth failure |
| `server_keys_allowed` | `boolean` | default `true` (RF-1104) |
| `daily_cap_micros` | `bigint` null | daily cap on server keys set by the administrator; null = the server default (RF-1106) |
| `own_daily_cap_micros` | `bigint` null | optional daily cap the user sets for their own keys; null = none (DEC-107) |
| `created_at`, `updated_at`, `last_sign_in_at` | `timestamptz` | `last_sign_in_at` null until the first sign-in |

**`sessions`** (RF-1101)

| Column | Type | Rules |
|---|---|---|
| `id_hash` | `bytea` | primary key; SHA-256 of the 256-bit session id (32 bytes, checked); the id itself is never stored |
| `user_id` | `uuid` | references `users`, `ON DELETE CASCADE`; indexed |
| `created_at`, `last_seen_at`, `expires_at` | `timestamptz` | `expires_at` = min(`last_seen_at` + 8 h, `created_at` + 7 days) |
| `ip`, `user_agent` | `text` | for the administrator's view and audit; user agent cut to 200 characters (checked) |

**`provider_keys`** (RF-1104)

| Column | Type | Rules |
|---|---|---|
| `user_id` | `uuid` | references `users`; part of the primary key |
| `provider` | `text` | `CHECK (provider IN ('openai','anthropic','openai-compatible'))`; part of the primary key |
| `base_url` | `text` null | required for `openai-compatible` (`CHECK`); https and a public address, checked on save and on every connect (RF-1104) |
| `ciphertext`, `iv`, `auth_tag` | `bytea` | AES-256-GCM; the additional authenticated data is `user_id:provider` |
| `key_version` | `text` | fingerprint of the key that encrypted it: the AES key is derived from `ROSETTA_SECRET_KEY` with HKDF-SHA256 (info `rosetta/provider-keys/v1`); rows under `ROSETTA_SECRET_KEY_PREVIOUS` are re-encrypted at start-up (DEC-112) |
| `last4` | `text` | the last four characters, for display; at most 4 characters (checked) |
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
| `settings_version` | `integer` | starts at 1 and grows by 1 with every save of `settings` (migration `0009`); a save that names the version it started from (`If-Match`) is applied only if it is still the stored one, tested in the same `UPDATE`, so two tabs never overwrite each other; shown as `settingsVersion` and the `ETag` of the project |

**`runs`** (RF-003, RF-1108)

| Column | Type | Rules |
|---|---|---|
| `id` | `uuid` | primary key |
| `project_id` | `uuid` | references `projects`, `ON DELETE CASCADE` |
| `user_id` | `uuid` | references `users`; equals the project's owner, enforced by a foreign key (`project_id`, `user_id`) to `projects` (`id`, `user_id`), which is unique |
| `run_key` | `text` | the `<runId>` folder name; unique per project |
| `stage` | `text` | `CHECK (stage IN ('scan','understand','verify','report','plan'))` |
| `commit_sha`, `snapshot_key` | `text` null | the pinned commit and the snapshot folder name; indexed, for the history list and the snapshot-in-use check (RF-1008, RF-1012) |
| `queue_state` | `text` | `RunQueueState` (architecture section 5), `CHECK` on the list |
| `end_state` | `text` null | `RunEndState`, `CHECK` on the list; set once; set exactly when `queue_state` is `Ended` (`CHECK`) |
| `queued_at`, `started_at`, `ended_at` | `timestamptz` | the last two null until reached |
| `cost_micros`, `input_tokens`, `output_tokens`, `cached_input_tokens` | `bigint` | running totals for lists; the ledger is the source of truth |
| `failed_areas` | `integer` | default 0, `CHECK (failed_areas >= 0)`; set with the end state: the areas of an understand run whose task gave no usable card (RF-208), so lists can say "Completed, 2 areas failed" without the run's events; migration `0011` |

**`cost_ledger`** (RF-428, RF-1106)

| Column | Type | Rules |
|---|---|---|
| `id` | `bigint` | identity primary key |
| `at` | `timestamptz` | indexed with `user_id` and alone (server month) |
| `user_id` | `uuid` | references `users` (accounts are disabled, never deleted) |
| `project_id`, `run_id` | `uuid` null | no foreign key: rows outlive deleted projects and runs (DEC-55); null for a provider test (RF-407); `run_id` is indexed (`cost_ledger_run_id_idx`, added by `0005`) for the run's cost report (RF-426) |
| `stage`, `role`, `provider`, `model` | `text` | `stage` is a run stage or `provider-test` (`CHECK`) |
| `call_id` | `text` | matches `provider-calls.jsonl` |
| `attempt` | `int` | 1 for the first attempt; `CHECK (attempt >= 1)` |
| `key_source` | `text` | `CHECK (key_source IN ('user','server','none'))`; `none` for Ollama |
| `input_tokens`, `output_tokens`, `cached_input_tokens` | `bigint` | |
| `usage_source` | `text` | `CHECK (usage_source IN ('reported','estimated'))` |
| `cost_micros` | `bigint` | fixed at call time |
| `currency` | `char(3)` | `USD` (DEC-54); `CHECK` three capital letters (ISO 4217) |
| `price_table_version` | `text` | |
| `agent_task_id` | `text` null | the agent task of the call, for the cost report by task (RF-426); null for a provider test (RF-407); added by `0005` |
| `cost_known` | `boolean` | default `true`; `false` for a model without a price run with the user's own key and `budget.allowUnpriced` (RF-427): `cost_micros` is 0 and the cost is shown as unknown; added by `0005` |

**`cost_reservations`** (RF-422, RF-1106; added by the review of 2026-10-11, DEC-112)

| Column | Type | Rules |
|---|---|---|
| `call_id` | `text` | the call (`<runKey>#<n>`, or `provider-test-<uuid>#1`); unique only together with `user_id` and `run_id`, because a run key is unique only within a project (`UNIQUE NULLS NOT DISTINCT (user_id, run_id, call_id)` by `0007`, which replaced the `call_id` primary key) |
| `user_id`, `run_id` | `uuid` | the run's owner and run; `run_id` is null for a provider test, which belongs to no run (RF-407; nullable by `0006`); `user_id` is indexed (`cost_reservations_user_id_idx`, added by `0005`) for the user's sums (RF-422) |
| `key_source` | `text` | as in `cost_ledger` |
| `role` | `text` null | the role of the call, as in `cost_ledger`, for the role caps (RF-423); added by `0012`, null only for a row that predates it |
| `worst_case_micros` | `bigint` | prompt tokens plus maximum output, priced |
| `worst_case_tokens` | `bigint` | prompt tokens plus maximum output, for the run token cap; `CHECK (worst_case_tokens >= 0)`; added by `0005` |
| `expires_at` | `timestamptz` | call timeout plus a margin; expired rows are ignored and purged |

The budget guard takes `pg_advisory_xact_lock` on the user and on the server, sums the ledger and the unexpired
reservations for each cap, and inserts the call's reservation in the same transaction, so two parallel runs cannot
both pass the last free cent (RF-1106). The lock is released at commit, before the call is made.

All periods are UTC calendar days and months (DEC-107).

**`server_settings`** (RF-1106, RF-1108)

One row per key: `key text` primary key, `value jsonb`, `updated_at`, `updated_by uuid`. Keys:
`caps` (`runMicros`, `userDayMicros`, `serverMonthMicros`), `queue` (`maxRunning`), `providers` (which server keys
are offered), `defaultRoles` (provider and dated model id per role for new projects, DEC-106). A caps change and its `admin.caps_changed` audit row are written in one transaction (RF-1106, RF-1109), so neither is saved without the other. Defaults are inserted
by migration `0004_server_settings_defaults`: `caps` `{ runMicros: 500000, userDayMicros: 1000000,
serverMonthMicros: 10000000 }` (RF-1106), `queue` `{ maxRunning: 2 }` (RF-1108) and `defaultRoles` `{}` (empty until
the administrator sets it). The Ollama URL is only the environment
variable `ROSETTA_OLLAMA_URL`. `defaultRoles` holds `{ reader?, verifier?, planner?, summariser? }`, each
`{ provider, model }` with `provider` one of the kinds of 3.1; a role left out keeps the template's model, and a value
of another shape is refused at read time.

**`audit_events`** (RF-1109)

| Column | Type | Rules |
|---|---|---|
| `id` | `bigint` | identity primary key |
| `at` | `timestamptz` | indexed |
| `actor_user_id` | `uuid` null | null for anonymous sign-in attempts |
| `action` | `text` | for example `auth.sign_in`, `auth.locked`, `user.created`, `user.password_changed`, `user.password_reset`, `user.disabled`, `user.enabled`, `user.own_daily_cap_changed`, `key.saved`, `key.deleted`, `admin.workspace_opened`, `admin.caps_changed`, `request.refused` |
| `target_type`, `target_id` | `text` null | for `request.refused`, `route` and `METHOD path` with the path cut to 512 characters and `[cut]` (DEC-141); null id on the count row, whose `detail` is `{ reason: 'rate-limit', count, windowStart }` (architecture section 10) |
| `ip` | `text` | |
| `outcome` | `text` | `CHECK (outcome IN ('ok','refused','failed'))` |
| `detail` | `jsonb` | masked (the secret masking, plus a whole value under a key naming a secret such as `secret`, `pass`, `pw` or `value`, a key whose last word is `token` or `authorization` such as `accessToken`, and the whole phrase after "password is" or "was": a quoted one up to its closing quote, an unquoted one up to the next comma, semicolon or newline or the end of the text); never a password, key or session id. In `action`, `target_type`, `target_id`, `ip` and `detail` every NUL is stored as U+FFFD |

The bootstrap administrator (RF-1102) is created at start-up, before the server listens, and writes one `user.created` row only when it creates the account: `actor_user_id` null (no actor), `target_type` `user`, `target_id` the new account's id, `ip` `start-up` (no client address), `outcome` `ok`, and `detail` `{"role":"admin","source":"environment"}`. The row holds no user name and no password, and neither value of `ROSETTA_ADMIN_USER` or `ROSETTA_ADMIN_PASSWORD` is audited or logged. A start-up that finds accounts writes no row.

Retention (DEC-132, RF-1109): audit rows are kept for 365 days and then deleted by a daily task of the server (at
start-up and every 24 hours). `rosetta_app` has no `UPDATE` or `DELETE` on this table; the only deletion is the
function `purge_audit_events_before(cut_off timestamptz)` (migration `0008_audit_retention_purge`), which returns
the number of rows it deleted. It is owned by `rosetta_migrator` and is `SECURITY DEFINER`, with `search_path` fixed to
`pg_catalog, pg_temp` and the table schema-qualified. It deletes the rows with `at < cut_off` and refuses with
SQLSTATE `22023`, deleting nothing, a `NULL` cut-off and any cut-off younger than 365 days; the 365 days are
measured with `clock_timestamp()` on the database clock, never from a value the caller sends. `EXECUTE` is revoked
from `PUBLIC` and granted to `rosetta_app` only (when that role exists). The task sends a cut-off one hour older
than 365 days so that an application clock a little ahead of the database clock is not refused.

**`schema_version`** (RF-1302): `version int` primary key, `name text` (the file name), `checksum text` (SHA-256 of
the file, lower-case hex), `applied_at timestamptz`. Created by the migration runner (`PgMigrator`) itself, not by a
migration.

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
| `rosetta_migrator` | owns the schema; `CREATE`, `ALTER`, `DROP` | the one-off migrate step only (`DATABASE_MIGRATOR_URL`; the one role's URL when the host offers one role); never the server, which refuses that variable (DEC-140) |
| `rosetta_app` | `SELECT`, `INSERT`, `UPDATE`, `DELETE` on the tables (including `cost_reservations`); `INSERT`, `SELECT` only on `cost_ledger` and `audit_events` (no update or delete); `EXECUTE` on the function `purge_audit_events_before` and on no other function (DEC-132); `SELECT` only on `schema_version` (migration `0010`, DEC-140) | the server (`DATABASE_URL`) |

The roles are created outside the migrations, because a committed file cannot hold their passwords: locally by a
Compose init script (`db/init/roles.sh`) that reads the passwords from `.env`, hosted by the runbook in the host's
console; migrations only `GRANT` and `ALTER DEFAULT PRIVILEGES` (DEC-112).

When the host provides a single database user, both roles collapse into it and the runbook records that; the server
then logs a warning at every start, because it runs as the owner of the audit and ledger tables (DEC-140). Each
migration therefore grants to `rosetta_app` only when that role exists. `schema_version` belongs to the migration
runner; `rosetta_app` may only read it, so the server can refuse a schema with a pending, changed or unknown migration
(RST-2405, RST-2401, RST-2402) instead of migrating it.

**Files**:

- Rosetta writes only inside `<data>` (RF-005); workspace paths are built from ids, then resolved and checked to be
  inside `<data>/users/<actor userId>/`.
- Snapshots are read-only after the fetch (3.3) and are never listed to users.
- The web server serves workspace files only through routes that check the owner (RF-1105), and its own static
  assets; it never serves `<data>` directly.

## 7. Migrations and schema versions

**Database migrations** (RF-1302): files `db/migrations/NNNN_snake_name.sql`, four digits, applied in order, each in
a transaction, recorded in `schema_version` with its checksum, by the one-off migrate step
(`node dist/presentation/migrate.js`, DEC-140) before the server starts; the server only checks them. An applied file is never edited; a fix is a new
migration. Number blocks: `0001..0099` release 1 (`0001_accounts`, `0002_projects_runs`, `0003_cost_ledger_audit`
with `cost_reservations`, `0004_server_settings_defaults`, `0005_cost_ledger_tasks_and_tokens`, `0006_cost_reservations_without_run`, `0007_cost_reservations_per_run_call`, `0008_audit_retention_purge`, `0009_project_settings_version`, `0010_schema_version_read`, `0011_runs_failed_areas`, `0012_cost_reservations_role`), `0100..` later
releases.

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
- Database integration tests use the PostgreSQL at `ROSETTA_TEST_DATABASE_URL` (the CI service container, or the
  Compose `db` service locally), apply every migration, and give each test file its own schema; unit tests use the
  memory repositories (DEC-112).
- Test accounts and passwords are generated by the test helpers; none is a real credential.

## 9. Retention

| Data | Retain | Action |
|---|---|---|
| Application logs | `ROSETTA_LOG_RETENTION_DAYS` (14) | deleted at start-up and daily |
| `.partial-*` snapshot folders | until next start-up | deleted |
| Runs, projects, exports | until the user deletes them | delete button in the web UI with confirmation (RF-1012, DEC-55); never automatic |
| Run and project folders on deletion | as long as their rows, for a run | Delete run removes the run folder first and the row second (P1-121): a folder that cannot be removed writes an `error` log entry with RST-1115 naming it, answers RST-1115 and keeps the row, so Delete removes the folder on the next attempt. Delete project locks the project row (`FOR UPDATE`, so a run queued at the same moment is seen and refuses the deletion), removes the rows and commits, and only then removes the project folder (P1-138), so a slow disk holds neither a pooled connection nor the lock. A project folder that cannot be removed is logged with RST-1115 naming the folder and answered with it; the project is already gone, so the folder stays until the administrator removes it by hand (no automatic clean-up exists) |
| Snapshots | until the administrator deletes them | delete button on the administration page (RF-1012) |
| Sessions | until expiry or sign-out | expired rows deleted hourly by the in-process scheduler |
| Cost reservations | until the call ends or the row expires | expired rows deleted hourly |
| Audit events | 365 days (DEC-132) | rows older than that are deleted at start-up and daily through `purge_audit_events_before`, the only deletion `rosetta_app` can make; the cost ledger is never purged (DEC-110) |
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
| Demo target | `https://github.com/dotnet-architecture/eShopModernizing/tree/main/eShopLegacyWebFormsSolution` | README quick start, milestone run (RF-801) |

## 11. History import

Not applicable: Rosetta replaces no system.

## 12. Open points

None. Q-15 was answered by DEC-54 (USD) and Q-16 by DEC-55 (delete button in the web UI). The tables of section 4
were added by DEC-65 on 2026-10-11.
