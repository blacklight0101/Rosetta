# Environments, source control and delivery

| | |
|---|---|
| **Status** | Proposed (2026-10-09) |
| **Date** | 2026-10-11 (hosted web application, DEC-59..DEC-69) |
| **Owner** | BlackLigth (blacklight0101) |
| **Related** | [Architecture](architecture.md) - [Conventions](conventions.md) - [ADR-014](adr/ADR-014-container-image-local-and-hosted.md) - [ADR-016](adr/ADR-016-postgresql-and-files.md) - [ADR-011](adr/ADR-011-toolchain-and-quality-gates.md) - [Orchestration](orchestration/README.md) |

Rosetta is a web application with accounts, shipped as one container image that runs next to PostgreSQL, locally
with Docker Compose and hosted on a container host (DEC-59, DEC-61, DEC-65; ADR-014, ADR-016). This document is the canonical home of the package and tool baseline (section 7).

## 1. Environments

| Environment | Where | AI providers | Purpose |
|---|---|---|---|
| **Dev** | the owner's machine (Windows 11, Node.js 24 LTS, Docker 29 with Compose v5, Ollama) and the builders' worktrees | the fake provider in tests; Ollama, OpenAI and Anthropic for manual and evaluation runs | build and test every card; `npm run dev` runs the server from source against a Compose PostgreSQL |
| **CI** | GitHub Actions, `ubuntu-latest` and `windows-latest` | fake provider only; no keys, no network calls to providers | the gates of section 6 on every push and pull request; image build, scan and Compose smoke test on Linux |
| **Local** | the owner's machine, `docker compose up` | Ollama on the host, plus the owner's keys | the simulation of the hosted deployment (RF-1301) |
| **Hosted** | a container host chosen in Q-18 | OpenAI, Anthropic, OpenAI-compatible with server keys under caps, or the user's keys | the teachers' evaluation URL (RF-1304, DEC-67) |
| **Published** | GitHub Pages of the public repository | none | the sample report of the demo run (RF-800), the fallback of the hand-in |

## 2. Hosting

| Deployable | Host | Notes |
|---|---|---|
| Rosetta image | GitHub Container Registry `ghcr.io/blacklight0101/rosetta`, tags `X.Y.Z` and `sha-<short>` | built once per release by CI; never `latest` in a deployment (RF-1300) |
| App container, local | Docker Compose on the owner's machine | `compose.yaml`: services `app` and `db` (PostgreSQL 17, pinned by digest), volumes `pgdata` and `rosetta-data`, app published on `127.0.0.1:8080`, `extra_hosts: host.docker.internal:host-gateway` (RF-1301) |
| App container, hosted | the host chosen in Q-18 | HTTPS by the host, managed PostgreSQL 17, persistent disk at `/data`, health check on `/healthz`, restart on failure, one instance (RF-1304) |
| Sample report | GitHub Pages, from the `site/` folder of `main` | static files only (RF-501) |

Hosting candidates for Q-18 (to compare when the deploy card starts): Render, Railway, Fly.io, Azure Container
Apps and a small VPS with Docker. Requirements of ADR-014: runs a container image from GHCR, persistent disk,
managed PostgreSQL or a PostgreSQL container with a volume, secret store, HTTPS with a custom or provided domain,
health checks, a monthly cost under 25 USD.

## 3. Identities and service accounts

| Identity | Used by | Kind | Notes |
|---|---|---|---|
| GitHub API (optional) | Rosetta fetching snapshots | read-only `GITHUB_TOKEN` in the environment | only raises rate limits; public repositories need no token (RF-123) |
| Server provider accounts | the hosted and local app | the owner's API keys per provider | in the host's secret store or the local `.env`; used under caps (RF-1106) |
| Users' provider accounts | each signed-in user | their own API keys | stored encrypted in the database (RF-1104) |
| Database roles | the app and the migration runner | `rosetta_app`, `rosetta_migrator` | passwords in the connection URLs, in the secret store (data-model.md section 6) |
| Bootstrap administrator | first start | `ROSETTA_ADMIN_USER`, `ROSETTA_ADMIN_PASSWORD` | password changed at first sign-in; the variable can be removed afterwards (RF-1102) |
| Teacher account | evaluators | created by the administrator | password only in the hand-in form (RF-1107) |
| GHCR publishing | the release job | `GITHUB_TOKEN` with `packages: write` in that job only | |
| GitHub Actions token | CI | `GITHUB_TOKEN` with `contents: read` by default | write scopes only in the Pages and release jobs |

## 4. Configuration and secrets

All server configuration comes from environment variables, validated at start-up (RF-1305). `.env.example` lists
every variable with a comment and a safe example.

| Variable | Required | Secret | Meaning |
|---|---|---|---|
| `DATABASE_URL` | yes | yes | PostgreSQL URL for `rosetta_app` |
| `DATABASE_MIGRATOR_URL` | no | yes | URL for `rosetta_migrator`; `DATABASE_URL` is used when absent |
| `ROSETTA_SECRET_KEY` | yes | yes | 32 random bytes, base64; encrypts user provider keys (ADR-015); `ROSETTA_SECRET_KEY_PREVIOUS` during a rotation |
| `ROSETTA_PUBLIC_URL` | yes | no | the URL users open (`http://127.0.0.1:8080` locally); the `Origin` check compares with it |
| `ROSETTA_DATA_DIR` | yes | no | `/data` in the image |
| `ROSETTA_ADMIN_USER`, `ROSETTA_ADMIN_PASSWORD` | first start | yes | bootstrap administrator (RF-1102) |
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` | no | yes | server keys (DEC-64) |
| `ROSETTA_OLLAMA_URL` | no | no | `http://host.docker.internal:11434` locally; unset when hosted |
| `ROSETTA_CONTACT_EMAIL` | no | no | the landing page's "Request access" address (Q-20) |
| `ROSETTA_LOG_LEVEL`, `ROSETTA_LOG_RETENTION_DAYS` | no | no | `info`, 14 |
| `GITHUB_TOKEN` | no | yes | raises GitHub rate limits for snapshot downloads (RF-123) |

| Item | Where it lives |
|---|---|
| Project settings | the `projects.settings` column, edited in the web UI and validated by a schema (RF-002); no secret values |
| Server secrets | locally the git-ignored `.env` read by Compose; hosted the host's secret store; never in the image, the repository, output or logs (RNF-003) |
| Users' provider keys | encrypted in `provider_keys` (RF-1104) |
| Ollama models folder | the owner's Ollama setting (`G:\Ollama Models`, program in `E:\Ollama\app`) |
| Price table | defaults shipped with Rosetta, dated; overrides in the project settings (RF-420) |

Secret hygiene: `.env` and `.env.*` are git-ignored (except `.env.example`); GitHub secret scanning with push
protection, Dependabot alerts and Dependabot security updates are enabled on the repository (DEC-42); gitleaks runs in CI; recordings under `tests/recordings/` are scrubbed of keys
before commit (ADR-008).

## 5. Source control and branching

- Repository: public GitHub `blacklight0101/Rosetta`, default branch `main` (DEC-06).
- Flow (DEC-35): issue per card -> branch `task/<card-id>-<slug>` or `docs/<topic>` -> pull request from the template
  -> CI green -> verifier verdict posted -> the owner approves by merging with squash -> branch deleted.
- `main` is protected by a repository ruleset: changes only through pull requests, squash merge only, linear history,
  no force-push, no deletion, review threads resolved before merge. Required status checks are added to the ruleset
  when the CI workflow exists (first P1 card).
- Commits follow Conventional Commits, checked by commitlint ([conventions](conventions.md) section 9).
- Git hooks (lefthook): `pre-commit` formats and lints staged files; `commit-msg` runs commitlint; `pre-push` runs
  `typecheck` and the unit tests. Hooks help; CI is the gate.

## 6. Continuous integration

Workflow `.github/workflows/ci.yml`, on `push` and `pull_request`, matrix `ubuntu-latest` and `windows-latest`,
Node.js from `.nvmrc`, `npm ci`, concurrency group per branch with cancel-in-progress. Integration tests start a
disposable PostgreSQL service container on Linux; on Windows the database tests are skipped and reported as such.

| Check | Command | Blocks merge |
|---|---|---|
| Type check | `npm run typecheck` (`tsc --noEmit`) | yes |
| Lint, zero warnings | `npm run lint` (`eslint . --max-warnings 0`) | yes |
| Format | `npm run format:check` (`prettier --check .`) | yes |
| Architecture rule | `npm run arch` (dependency-cruiser) | yes |
| Dead code and dependencies | `npm run deadcode` (knip) | yes |
| Tests with coverage and level report | `npm run test:ci` (Vitest, coverage thresholds of [conventions](conventions.md) section 7) | yes |
| Dependency audit | `npm audit --audit-level=high --omit=dev` | yes |
| Secret scan | gitleaks action | yes |
| Static analysis | CodeQL (`javascript-typescript`), on pull requests and weekly | yes, for high and critical alerts |
| Dependency review | `actions/dependency-review-action` on pull requests: fails on newly added packages with high or critical advisories or a disallowed licence | yes |
| Image build and scan | `docker build` of the `Dockerfile`, then a container scan (Trivy action) that fails on high or critical findings with a fix available | yes (Linux job) |
| Compose smoke test | `docker compose -f compose.yaml -f compose.ci.yaml up -d`, wait for `/healthz`, Playwright smoke (landing, sign-in, fake-provider scan), `down -v` | yes (Linux job) |
| Pull request title | commitlint on the title, passed as `env: TITLE: ${{ github.event.pull_request.title }}` and read as `"$TITLE"`, never `${{ }}` inside `run:` | yes |

`npm run verify` runs the first six checks locally in the same order; builders and the verifier run it on every card.

Workflow hardening: `timeout-minutes` on every job (15 for checks); `actions/setup-node` with `cache: npm`; `npm audit`
exceptions only in `audit-exceptions.json`, each with a reason and an expiry date; top-level `permissions: contents: read`; third-party actions pinned to a full commit SHA with the
version in a comment; no `pull_request_target`; no secrets in CI (tests never call providers). Dependabot updates npm
packages and GitHub Actions weekly, grouped by minor and patch.

## 7. Package and tool baseline

Versions checked on the npm registry on 2026-10-09 (front-end rows on 2026-10-10). Ranges are caret ranges on these versions; `package-lock.json` is
committed and installs use `npm ci`. Any runtime dependency not listed here needs an ADR (CLAUDE.md stack rules).

**Runtime**

| Purpose | Package | Version | Notes |
|---|---|---|---|
| Runtime | Node.js | 24 LTS (24.11 on the owner's machine) | pinned in `.nvmrc` and `engines` (DEC-27) |
| HTTP server | `fastify` | 5.12 | ADR-017; presentation only |
| Cookies | `@fastify/cookie` | 11.1 | session cookie (RF-1101) |
| CSRF | `@fastify/csrf-protection` | 8.0 | RF-1009 |
| Rate limiting | `@fastify/rate-limit` | 11.2 | sign-in and API (RF-1100) |
| Security headers | `@fastify/helmet` | 13.1 | CSP, HSTS, no-sniff, referrer policy (RF-1013) |
| Static files | `@fastify/static` | 10.1 | built front end |
| PostgreSQL | `pg` | 8.23 | parameterised SQL in `src/infrastructure/db/` only (ADR-016) |
| Schema validation | `zod` | 4.6 | configuration, cards, code map, model output and tool arguments are parsed, never cast |
| YAML | `yaml` | 2.9 | card headers and the price table (DEC-25) |
| OpenAI and OpenAI-compatible | `openai` | 7.32 | infrastructure adapter only (ADR-003) |
| Anthropic | `@anthropic-ai/sdk` | 0.133 | infrastructure adapter only, P2 |
| Ollama | Node.js `fetch` against the Ollama HTTP API | built in | no SDK needed; decided in the provider card |
| Language packs | `web-tree-sitter` + `tree-sitter-c-sharp` (WebAssembly grammar) | 0.27 / 0.23 | WebAssembly avoids native builds on Windows (ADR-004) |
| Zip export | `yazl` | 3.3 | streaming zip writer (RF-008) |
| Web UI and report components | `preact` | 11.0 | bundled into static assets at build time; the server ships no front-end dependency at runtime (DEC-52) |

**Development**

| Purpose | Package | Version | Notes |
|---|---|---|---|
| Compiler | `typescript` | 6.0 (6.0.3) | not 7.x until typescript-eslint supports it (ADR-011) |
| Node types | `@types/node` | 24.x | matches the runtime line |
| Lint | `eslint`, `@eslint/js` | 10.12 / 10.0 | flat configuration only |
| TypeScript lint | `typescript-eslint` | 8.71 | `strictTypeChecked` + `stylisticTypeChecked`, `projectService: true` |
| Node lint | `eslint-plugin-n` | 18.4 | ESM resolution, Node 24 built-ins |
| Test lint | `@vitest/eslint-plugin` | 1.6 | test files only |
| Format | `prettier`, `eslint-config-prettier` | 3.9 / 10.1 | Prettier owns formatting; ESLint owns correctness |
| Tests | `vitest`, `@vitest/coverage-v8` | 5.0 | projects `unit`, `integration`, `e2e` |
| Architecture | `dependency-cruiser` | 18.5 | Clean Architecture and no cycles (ADR-009) |
| Dead code | `knip` | 6.41 | unused files, exports, dependencies |
| Commits | `@commitlint/cli`, `@commitlint/config-conventional` | 21.2 | `commit-msg` hook and CI on pull request titles |
| Git hooks | `lefthook` | 2.2 | no install scripts in the hooks |
| Front-end build | `vite`, `@preact/preset-vite` | 8.3 / 2.10 | builds `web/` into static assets (DEC-52); preset compatibility with Preact 11 confirmed in the first web UI card |
| Browser tests | `@playwright/test`, `@axe-core/playwright` | 1.64 / 4.13 | the e2e project for the web UI and report; accessibility checks (RNF-010) |
| Containers | Docker Engine, Docker Compose | 29.7 / v5.4 | on the owner's machine; base images `node:24-slim` and `postgres:17` pinned by digest |

**Forbidden without an ADR**: any agent framework that owns the loop (ADR-003); provider SDKs outside
infrastructure; native addons that need a C++ toolchain on Windows; `ts-node` (Node.js runs and type-strips
TypeScript itself; the build uses `tsc`); lodash-style utility grab-bags; a second test runner or formatter.

## 8. Versioning and releases

- Semantic Versioning in 0.x (DEC-29); `v0.1.0` is the 2026-10-26 milestone.
- A release is a pull request that bumps `package.json`, adds a section to `docs/releases.md`, merges, then a tag
  `vX.Y.Z` and a GitHub release with the same notes; the owner creates the tag.
- Cadence: one release per phase exit; patch releases as needed.
- Build once: the release job builds the image once, pushes it to GHCR as `X.Y.Z` and `sha-<short>`, and attaches a
  CycloneDX SBOM (`npm sbom --sbom-format cyclonedx`) to the GitHub release (DEC-57). Every deployment uses that
  exact tag.
- After the GitHub Pages deploy, a smoke-test step fetches the published report's index and fails the job (`exit 1`)
  if it is missing or does not contain the run id.

### 8.1 The six repeated errors of the master's Module 07

| Error | Rosetta |
|---|---|
| Version ranges such as `>=` | covered: `package-lock.json` committed, installs with `npm ci`, caret ranges only in `package.json` |
| `latest` tags | covered: Node.js pinned in `.nvmrc`, actions pinned to a commit SHA, model versions and Ollama digests recorded per run (RNF-004) |
| State kept in memory | covered: state is in PostgreSQL and files (data-model.md); the web UI rebuilds from `events.jsonl`; a restarted container marks interrupted runs `Interrupted` |
| Public endpoints | covered: sign-in on every route but the public ones, lockout, rate limits, CSRF and `Origin` checks, HSTS, caps (RF-1009, RF-1013, RF-1100, RF-1106); locally published on `127.0.0.1` only |
| Secrets in an image or published output | covered: secrets only at runtime from the environment; `.dockerignore` excludes `.env`; image scan; masked transcripts; output scan before publishing `site/` (RNF-003, RF-1300) |
| Running as root or on `0.0.0.0` | covered: the image runs as a non-root user; the server binds `0.0.0.0` only inside the container, and Compose publishes it on `127.0.0.1` (RF-1300, RF-1301) |

## 9. Database deployment

PostgreSQL 17 (ADR-016). Locally the `db` service of `compose.yaml` with the `pgdata` volume; hosted a managed
PostgreSQL. The app applies pending migrations at start-up before it listens (RF-1302); a migration that fails stops
the start and leaves the previous schema. The roles of data-model.md section 6 are created by the first migration
when the connecting user may create roles, otherwise by the host's console (runbook).

## 10. Deployment procedure

1. All cards of the phase merged, CI green on `main` (including the image scan and the Compose smoke test).
2. Local: `docker compose pull` (or `build`), `docker compose up -d`, sign in, run the demo `scan` and `understand`
   (RF-801, RF-1301).
3. Release pull request, merge, tag; the release job pushes the image to GHCR.
4. Hosted: back up the database (host snapshot), set the new image tag on the host, wait for `/healthz`, run the
   smoke test (landing, sign-in with the teacher account, a fake-provider or cheap scan) (RF-1304).
5. Regenerate the sample report into `site/` in a pull request; merge; GitHub Pages publishes it (RF-800).
6. Record the deployed tag and date in `docs/runbooks/deploy.md` and `handoff.md`.

## 11. Rollback

Hosted: set the previous image tag. Migrations are additive within release 1, so the previous image runs on the newer
schema; a migration that is not additive is announced in the release notes with its restore point (the backup of
step 4). Local: `docker compose up -d` with the previous tag. The sample report is restored by reverting the pull
request that changed `site/`.

## 12. Backup and restore

- Code and documents: the repository on GitHub.
- Database: the host's daily backups kept 7 days, or a scheduled `pg_dump` to the disk when the host has none; one
  snapshot before every deployment (RF-1306).
- Data folder: weekly copy of `users/` (snapshots can be downloaded again).
- `ROSETTA_SECRET_KEY` is kept by the owner outside the host as well; without it the stored user keys cannot be
  decrypted.
- One restore drill into the local Compose stack is recorded in `docs/runbooks/deploy.md`.

## 13. Observability

- Every run writes its manifest, egress log, cost report, run events and provider call log (RF-003, RF-142, RF-426,
  RF-1006, RF-408); every call is a row in the cost ledger (RF-428); account events are in the audit table (RF-1109).
- Every provider interaction (Ollama or cloud) is one record with timing, tokens, cost, retries and status, shown live
  in the web UI (RF-408, RF-1011).
- Rosetta's own log: structured JSON lines on standard output at `ROSETTA_LOG_LEVEL` (collected by Docker or the
  host) and in `<data>/logs/`, daily files kept 14 days, `debug` and above (RF-009).
- `/healthz` for the host's health check (RF-1303); the administrator's page shows the server month against its cap
  (RF-1106).
- Logs and records pass through the secret masking and never contain secrets or API keys (RNF-003).
- No telemetry: Rosetta sends nothing anywhere except to the providers the user configures.
- Latency is reported as P50 and P95, never as an average alone (RF-1011); provider calls carry trace and span ids
  mapped to the OpenTelemetry GenAI conventions (data-model.md section 3.10).

## 14. Runbooks

| Runbook | Path | Created by | Content |
|---|---|---|---|
| Provider setup | `docs/providers.md` | P1 provider card | Ollama, OpenAI, Anthropic, OpenAI-compatible; tested models |
| Release | `docs/releases.md` | P1 milestone card | release notes and the release steps of section 8 |
| Local deployment | `README.md` quick start and `docs/runbooks/local.md` | P1 Compose card | `.env`, `docker compose up`, first sign-in, Ollama on the host, reset |
| Hosted deployment | `docs/runbooks/deploy.md` | P1 hosted deploy card | host setup, secrets, deploy, smoke test, rollback, backup and restore drill, teacher account |

## 15. Naming of environments in code and configuration

Rosetta has no environment switch: local and hosted differ only in their variables (section 4). Tests set
`ROSETTA_TEST=1`, which makes any real provider adapter refuse to call the network (ADR-008).
