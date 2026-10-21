# Rosetta

Rosetta is an open-source tool for developers and tech leads who inherit a legacy codebase and need to understand it
before they can replace it. Give it a public GitHub repository URL (pinned to a commit), a zip of a project folder
or a set of Excel workbooks (`.xlsx`, `.xlsm`: sheets, formulas, validations and VBA macros are rendered to text);
it maps the source without AI, then sends a team of AI agents through it to
write a functional specification: features, business rules, data entities, integrations and open questions, where
every claim cites the file and lines it comes from and a verifier agent rejects what the code does not support. A
Deepen run reads what the first run left unread and re-reads rejected claims, round by round.
From that specification it produces a tool-agnostic modernisation hand-off package (target architecture, decision
records, roadmap and task cards) that any team can build from in its own way. It works with any legacy stack, runs
against any AI provider (local models through Ollama, OpenAI, Anthropic and OpenAI-compatible services), and keeps
the cost of every run visible and capped. It is a web application with accounts: a page shows every agent it
spawns, live, and the published report replays their work. One container image runs it on your machine with Docker
Compose or on a server for invited users.

**Status: release 1 is built (2026-10-21) and runs end to end with Docker Compose; the hosted application is not
deployed yet.** You can create a project from a public GitHub URL, a zip or Excel workbooks, scan it, run the agents
that write the cited specification, watch them live, Deepen the result, answer the open questions, build the HTML
report and run `plan` to write the hand-off package, with an estimate before every run and a cap on its cost and
tokens. The cards still open wait for an owner gate or check (counts in the
[tasks.md totals](docs/orchestration/tasks.md); current state in [handoff.md](handoff.md)); the hosted deployment
waits for the owner to declare the local system ready (G-08). [docs/releases.md](docs/releases.md) lists what v0.1.0
(the milestone slice; the owner creates the tag) delivers by requirement area. The design documents are in this
repository: [docs/roadmap.md](docs/roadmap.md) has the phases and [docs/README.md](docs/README.md) the full map.

## Quick start

Run the whole system on your machine with Docker Compose. You need Git and Docker with Compose v2.1 or later (for
`--wait`); Node.js is not needed. Run the commands in an empty folder, in the block for your shell: Windows PowerShell
(5.1 or 7) or bash.

```powershell
git clone https://github.com/blacklight0101/Rosetta.git
cd Rosetta
Copy-Item .env.example .env
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
function New-RandomBytes([int]$count) { $bytes = New-Object byte[] $count; $rng.GetBytes($bytes); , $bytes }
function New-HexSecret { -join ((New-RandomBytes 24) | ForEach-Object { $_.ToString('x2') }) }
$values = @{
  ROSETTA_DB_ADMIN_PASSWORD    = New-HexSecret
  ROSETTA_APP_DB_PASSWORD      = New-HexSecret
  ROSETTA_MIGRATOR_DB_PASSWORD = New-HexSecret
  ROSETTA_ADMIN_PASSWORD       = New-HexSecret
  ROSETTA_SECRET_KEY           = [Convert]::ToBase64String((New-RandomBytes 32))
}
$lines = Get-Content .env | ForEach-Object {
  $name = ($_ -split '=', 2)[0]
  if ($values.ContainsKey($name)) { "$name=$($values[$name])" } else { $_ }
}
Set-Content .env $lines -Encoding ascii
docker compose up -d --build --wait
Select-String -Path .env -Pattern '^ROSETTA_ADMIN_USER='
```

```bash
git clone https://github.com/blacklight0101/Rosetta.git
cd Rosetta
cp .env.example .env
for name in ROSETTA_DB_ADMIN_PASSWORD ROSETTA_APP_DB_PASSWORD ROSETTA_MIGRATOR_DB_PASSWORD ROSETTA_ADMIN_PASSWORD; do
  sed -i.bak "s|^$name=.*|$name=$(openssl rand -hex 24)|" .env
done
sed -i.bak "s|^ROSETTA_SECRET_KEY=.*|ROSETTA_SECRET_KEY=$(openssl rand -base64 32)|" .env
rm .env.bak
docker compose up -d --build --wait
grep -E '^ROSETTA_ADMIN_USER=' .env
```

The commands copy `.env.example` to `.env` (git-ignored), fill in the three database passwords, the administrator's
password and a new `ROSETTA_SECRET_KEY` (32 random bytes in base64), then build the image, start the database and the
app, and print the administrator's name. The administrator's password stays in `.env` and is never printed. The secret
key step is not optional: the all-zero key in `.env.example` is a public value, so the server refuses to start with it
(error `RST-1008`). Keep a copy of your key; without it the stored provider keys cannot be decrypted. The first build
takes a few minutes; the command returns when both services are healthy.

Open <http://127.0.0.1:8080>, choose Sign in and sign in as the administrator: the user name is `ROSETTA_ADMIN_USER` and
the password is `ROSETTA_ADMIN_PASSWORD`, both in `.env`. The port is fixed at 8080 (`compose.yaml`); if another program
uses it, see the troubleshooting table of the runbook. The page asks you to choose a new password before anything else
opens. On the Projects page, Use the demo repository fills in the address of the demo application
(eShopLegacyWebForms); choose Create project to add it. The Upload a zip and Excel workbooks tabs on the same page
create a project from a zip of a folder or from up to 20 workbooks. A scan needs no model. The agents of the
understand stage need one: Ollama on the host (section 4 of the runbook), your own provider key under Settings and
keys, or a server key for every user in `.env` (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`; restart with
`docker compose up -d` after you set one). The models of each role are chosen per project or on the Default models
page. Before a run that sends code to a cloud provider, the start page asks you to confirm it.

The app is published on `127.0.0.1` only. `docker compose down` stops it and keeps your data, `docker compose down -v`
deletes it. The steps in full (Ollama on the host, reset, rotating the passwords and troubleshooting) are in
[docs/runbooks/local.md](docs/runbooks/local.md).

A sample report, made from recorded data of a demo repository, is published at <https://blacklight0101.github.io/Rosetta/> once GitHub Pages is enabled for the repository (source: GitHub Actions).

## Tested providers and models

Automated tests never call a real model (ADR-008); these are live evaluation runs on a clean installation, the whole
journey (scan, understand, Deepen, plan) with every role on one model. Workbooks used: a macro-enabled invoicing
workbook (7 sheets, 335 formulas, 13 VBA modules, about 28,000 tokens of text) and a small loan-amortisation workbook
(one sheet, PMT/PPMT/IPMT formulas). Costs are the cost ledger's figures; Ollama runs locally and costs nothing.

| Model (every role)            | Workbook | Understand                         | Deepen                       | Plan                     | Cost   |
| ----------------------------- | -------- | ---------------------------------- | ---------------------------- | ------------------------ | ------ |
| Ollama `gemma4:e4b` (local)   | Invoice  | 8 cards, 12 of 13 claims Supported | 100% read, 65 Supported      | Completed, 8 task cards  | $0     |
| Ollama `gemma4:e4b` (local)   | Loan     | 5 cards, 9 of 9 Supported          | not needed (100% read)       | -                        | $0     |
| Anthropic `claude-haiku-5-5`  | Invoice  | 10 cards, 26 of 31 Supported       | 100% read, 60 Supported      | Completed, 13 task cards | $0.136 |
| Anthropic `claude-haiku-5-5`  | Loan     | 100% read, 15 Supported            | 36 Supported                 | Completed, 8 task cards  | $0.065 |
| Anthropic `claude-sonnet-5-5` | Invoice  | 14 cards, 33 of 46 Supported       | 18 cards, 67 of 85 Supported | Completed, 18 task cards | $1.67  |
| OpenAI `gpt-5-nano`           | Invoice  | 10 cards, 42 of 52 Supported       | 14 cards, 55 of 67 Supported | Completed, 5 task cards  | $0.11  |

Evaluated on 2026-10-21. What the runs show:

- Every provider completes the journey. A hosted model writes more precise cards (named business rules such as due
  dates, VAT and invoice numbering, and flows such as drafting the customer email) and a larger plan; a small local
  model mostly describes structure (sheets, tables, screens) but is free and keeps the workbook on your machine.
- A local model's context is small. Rosetta reads the model's trained context from Ollama, grows it to fit a prompt
  when the setting is `auto`, refuses a prompt that would not fit, and keeps a reader's answer when the context runs
  out instead of losing it.
- The estimate on the start page held for every hosted run (actual cost inside the low-high range).
- The choices of Plan setup reach the package. Three briefs planned from the same understanding (C# on .NET with a
  layered style and strangler fig; Python with FastAPI, hexagonal and a full rewrite; TypeScript with React, a
  modular monolith and parallel change) each produced a package that names only its own technologies, style,
  migration, principles and team context; only the brief with a separate React front end got an API contract.
- A developer agent given only the package rebuilt the invoicing slice: from the Ollama package it had to guess
  nearly every money rule (rated 3 of 10 for a faithful rebuild), from the Sonnet package it built 79 passing tests
  but still mixed up two calculated columns (6 of 10). Card P3-94 adds the workbook's formulas, named by column,
  to the package.
- `gpt-5-nano` is a reasoning model: calls take 30 to 80 seconds, and with the default 4,096-token output limit its
  answers came back empty (card P3-86). Long planner answers of `gpt-5-nano` and `claude-sonnet-5-5` need more than
  the default 120-second call timeout (card P3-93); the Sonnet run used 600 seconds.
- Known limits being fixed: every hosted model is still assumed to have a 128,000-token context and every role the
  same output limit (card P3-85), so a hosted reader's long answer can be cut and retried; the follow-ups found in
  the evaluation are cards P3-87 to P3-95.

## Release 1 scope in three lines

- Release 1 covers the full pipeline as a web application with sign-in: `scan`, `understand` (agents plus
  verifier), the open-question loop, the HTML report and `plan` (the hand-off package), with cost control, on any
  legacy stack.
- The first milestone (2026-10-26) is a working slice: `scan` and `understand` on one area of the demo legacy app,
  running locally with Docker Compose and hosted for the evaluators with a teacher account, plus the published sample
  report, slides and video.
- Later: a second demo target in a different stack and a provider comparison report. Out of scope: a command-line
  interface and the Claude Code plugin run mode (DEC-59, DEC-60); rebuilding the legacy system is deliberately not
  part of Rosetta.

## Scope decisions (agreed at kick-off)

Snapshot of the kick-off decisions; the canonical record is [docs/decision-log.md](docs/decision-log.md).

| Question                     | Chosen                                                                                                                                                     | Instead of                                              |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Name and code                | **Rosetta** (working name), code `RST`                                                                                                                     | -                                                       |
| Product owner                | **BlackLigth (blacklight0101)**, sole owner; master final project                                                                                          | -                                                       |
| Replaces a system            | **No.** Rosetta analyses third-party legacy codebases                                                                                                      | -                                                       |
| First milestone (2026-10-26) | **Docs plus a working slice**, public repo, sample report on GitHub Pages, slides, video (changed by DEC-67: the hosted application is the deployment URL) | Docs plus a compiling skeleton; docs only               |
| Repository                   | **`C:\BuildingFolder\Rosetta`, local git, public GitHub `blacklight0101/Rosetta`**                                                                         | Local only, GitHub later                                |
| Document language            | **English**                                                                                                                                                | Spanish; mixed                                          |
| Stack                        | **TypeScript on Node.js** (changed by DEC-59, DEC-61: a web application in one container image, no CLI)                                                    | .NET 10; Python                                         |
| AI access                    | **Own agent loop behind a provider interface** (Ollama first, then OpenAI, then Anthropic)                                                                 | Claude Agent SDK (Claude only); Claude Code plugin only |
| Last stage                   | **A tool-agnostic hand-off package**; no rebuild                                                                                                           | An optional rebuild stage                               |
| Legacy stacks                | **Any stack**: universal scan plus language packs                                                                                                          | C# / WebForms only                                      |
| Demo target                  | **Microsoft eShopLegacyWebForms** (MIT) first; a different-stack target later                                                                              | BlogEngine.NET                                          |
| Cost control                 | **Estimate, hard caps, live meter, price table, cost report**                                                                                              | Logging only                                            |
| Builders                     | **Claude agents build, the owner reviews**                                                                                                                 | The owner codes by hand                                 |

## Milestone hand-in (2026-10-26)

- Release notes: [docs/releases.md](docs/releases.md) (v0.1.0; the owner creates the tag).
- Hosted application URL: [PENDIENTE: URL de la aplicación alojada]. The hosted deployment is card P1-55.
- Hand-in values and the owner's day-before checklist: [docs/hand-in/m1.md](docs/hand-in/m1.md).
- Slides URL: [PENDIENTE: URL de las diapositivas]. Source: [docs/hand-in/slides/slides.md](docs/hand-in/slides/slides.md) (Spanish).
- Video URL: [PENDIENTE: URL del vídeo]. Script: [docs/hand-in/video-script.md](docs/hand-in/video-script.md) (Spanish, about 5 minutes).

## Read the documents in this order

1. [docs/rfc/RFC-001-rosetta.md](docs/rfc/RFC-001-rosetta.md) - the design proposal: problem, goals and non-goals, alternatives, proposed design, phases, success metrics.
   Later proposals: [RFC-002](docs/rfc/RFC-002-plan-as-a-run-step.md) (plan as a run step),
   [RFC-003](docs/rfc/RFC-003-re-read-loop.md) (the re-read loop behind Deepen),
   [RFC-004](docs/rfc/RFC-004-zip-upload-source.md) (zip upload) and
   [RFC-005](docs/rfc/RFC-005-excel-workbook-source.md) (Excel workbooks).
2. [docs/spec/requirements.md](docs/spec/requirements.md) - requirements with acceptance criteria, open questions and traceability.
3. [docs/adr/README.md](docs/adr/README.md) - the architecture decision records.
4. [docs/decision-log.md](docs/decision-log.md) - the product owner's decisions (DEC-nn) and where each is applied;
   [docs/journal/](docs/journal/) - a summary of each working session.
5. [docs/architecture.md](docs/architecture.md) - the living architecture reference.
6. [docs/design-system.md](docs/design-system.md) - the web UI and HTML report design.
7. [docs/roadmap.md](docs/roadmap.md) - phases with exit criteria, later releases and what is deliberately not built.
8. [docs/data-model.md](docs/data-model.md), [docs/conventions.md](docs/conventions.md) and
   [docs/environments-and-delivery.md](docs/environments-and-delivery.md) - tables, coding rules, environments.
9. [docs/orchestration/README.md](docs/orchestration/README.md) and [tasks.md](docs/orchestration/tasks.md) - the
   build protocol and the task cards.

Rules for anyone (human or AI agent) changing this repository are in [CLAUDE.md](CLAUDE.md).
The current state and next steps are in [handoff.md](handoff.md).

## Stack (decided in the ADRs)

TypeScript on Node.js ([ADR-002](docs/adr/ADR-002-typescript-node-cli.md)); a Fastify web server with a Preact
front end ([ADR-017](docs/adr/ADR-017-fastify-http-server.md)); accounts with sessions and encrypted per-user keys
([ADR-015](docs/adr/ADR-015-accounts-sessions-and-user-secrets.md)); PostgreSQL plus files on a volume
([ADR-016](docs/adr/ADR-016-postgresql-and-files.md)); one container image, local with Docker Compose and hosted
([ADR-014](docs/adr/ADR-014-container-image-local-and-hosted.md)); an own agent loop behind a swappable `LlmProvider` interface
([ADR-003](docs/adr/ADR-003-provider-swappable-agent-loop.md)); Clean Architecture
([ADR-009](docs/adr/ADR-009-clean-architecture.md)); tests with Vitest and Playwright. The rest is in the
[ADR index](docs/adr/README.md).

## Related

- Product owner: BlackLigth (blacklight0101). Master en Desarrollo con IA (BIG School), final project.
- Demo legacy application (read-only, MIT):
  [dotnet-architecture/eShopModernizing](https://github.com/dotnet-architecture/eShopModernizing), folder
  `eShopLegacyWebFormsSolution`.
- License: MIT.
- Repository created 2026-10-09.
