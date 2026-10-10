# Environments, source control and delivery

| | |
|---|---|
| **Status** | Proposed (2026-10-09) |
| **Date** | 2026-10-09 |
| **Owner** | BlackLigth (blacklight0101) |
| **Related** | [Architecture](architecture.md) - [Conventions](conventions.md) - [ADR-002](adr/ADR-002-typescript-node-cli.md) - [ADR-011](adr/ADR-011-toolchain-and-quality-gates.md) - [Orchestration](orchestration/README.md) |

Rosetta is a command-line tool with a loopback-only web UI that runs on the developer's machine; it has no hosted
environment and no database (DEC-14, DEC-46). This document is the canonical home of the package and tool baseline (section 7).

## 1. Environments

| Environment | Where | AI providers | Purpose |
|---|---|---|---|
| **Dev** | the owner's machine (Windows 11, Node.js 24 LTS, Ollama) and the builders' worktrees | the fake provider in tests; Ollama, OpenAI and Anthropic for manual and evaluation runs | build and test every card |
| **CI** | GitHub Actions, `ubuntu-latest` and `windows-latest` | fake provider only; no keys, no network calls to providers | the gates of section 6 on every push and pull request |
| **Published** | GitHub Pages of the public repository | none | the sample report of the demo run (RF-800) |

There is no test or production server: users run released versions on their own machines.

## 2. Hosting

| Deployable | Host | Notes |
|---|---|---|
| Rosetta CLI | the user's machine | run from source in R1 (`npm ci`, `npm run rosetta -- <command>`); npm publishing is Q-08 |
| Sample report | GitHub Pages, from the `site/` folder of `main` | static files only (RF-501) |

## 3. Identities and service accounts

| Identity | Used by | Kind | Notes |
|---|---|---|---|
| GitHub API (optional) | Rosetta fetching snapshots | read-only `GITHUB_TOKEN` in the environment | only raises rate limits; public repositories need no token (RF-123) |
| Developer's provider accounts | the developer running Rosetta | API keys per provider | owned by each user; Rosetta never stores them |
| GitHub Actions token | CI | `GITHUB_TOKEN` with `contents: read` by default | write scopes only in the Pages and release jobs |

## 4. Configuration and secrets

| Item | Where it lives |
|---|---|
| Project configuration | `rosetta.config.yaml` next to the run output, validated by a schema (RF-002); no secret values |
| Provider API keys | environment variables named in the configuration (for example `OPENAI_API_KEY`), or a git-ignored `.env`; never in configuration, output or logs (RNF-003) |
| Ollama models folder | the user's own Ollama setting (on the owner's machine `G:\Ollama Models`, program in `E:\Ollama\app`) |
| Price table | defaults shipped with Rosetta, dated; overrides in the project configuration (RF-420) |

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
Node.js from `.nvmrc`, `npm ci`, concurrency group per branch with cancel-in-progress.

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
| CLI parsing | `commander` | 15.0 | subcommands and help (RNF-008) |
| Schema validation | `zod` | 4.6 | configuration, cards, code map, model output and tool arguments are parsed, never cast |
| YAML | `yaml` | 2.9 | configuration file (DEC-25) |
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

**Forbidden without an ADR**: any agent framework that owns the loop (ADR-003); provider SDKs outside
infrastructure; native addons that need a C++ toolchain on Windows; `ts-node` (Node.js runs and type-strips
TypeScript itself; the build uses `tsc`); lodash-style utility grab-bags; a second test runner or formatter.

## 8. Versioning and releases

- Semantic Versioning in 0.x (DEC-29); `v0.1.0` is the 2026-10-26 milestone.
- A release is a pull request that bumps `package.json`, adds a section to `docs/releases.md`, merges, then a tag
  `vX.Y.Z` and a GitHub release with the same notes; the owner creates the tag.
- Cadence: one release per phase exit; patch releases as needed.
- Build once: the release job runs `npm pack` once and attaches that tarball and a CycloneDX SBOM
  (`npm sbom --sbom-format cyclonedx`) to the GitHub release (DEC-57). Signed provenance comes with npm publishing
  (Q-08).
- After the GitHub Pages deploy, a smoke-test step fetches the published report's index and fails the job (`exit 1`)
  if it is missing or does not contain the run id.

### 8.1 The six repeated errors of the master's Module 07

| Error | Rosetta |
|---|---|
| Version ranges such as `>=` | covered: `package-lock.json` committed, installs with `npm ci`, caret ranges only in `package.json` |
| `latest` tags | covered: Node.js pinned in `.nvmrc`, actions pinned to a commit SHA, model versions and Ollama digests recorded per run (RNF-004) |
| State kept in memory | covered: every state is a file (data-model.md); the web UI rebuilds from `events.jsonl` |
| Public endpoints | covered: loopback only, session token, `Host` and `Origin` checks (RF-1009, RF-1013); no hosted service |
| Secrets in an image or published output | covered: no image; masked transcripts; output scan before publishing `site/` (RNF-003) |
| Running as root or on `0.0.0.0` | not applicable: no container; the server never binds `0.0.0.0` |

## 9. Database deployment

Not applicable: no database in R1 (DEC-14). Any future database is PostgreSQL behind an infrastructure adapter
(DEC-37).

## 10. Deployment procedure

1. All cards of the phase merged, CI green on `main`.
2. Run the demo `scan` and `understand` from a clean clone with the README quick start (RF-801).
3. Regenerate the sample report into `site/` in a pull request; merge.
4. GitHub Pages publishes `site/` from `main`; open the public URL and check it (RF-800).
5. Release pull request, merge, tag, GitHub release.

## 11. Rollback

Users check out the previous tag. The sample report is restored by reverting the pull request that changed `site/`.

## 12. Backup and restore

The repository on GitHub is the backup of code and documents. Run output belongs to the user and is never committed.

## 13. Observability

- Every run writes its manifest, egress log, cost report, run events and provider call log (RF-003, RF-142, RF-426,
  RF-1006, RF-408); the project keeps a cost ledger (RF-428). This is the audit trail.
- Every provider interaction (Ollama or cloud) is one record with timing, tokens, cost, retries and status, shown live
  in the web UI (RF-408, RF-1011).
- Rosetta's own log: structured JSON lines in `rosetta-out/logs/`, daily files kept 14 days, `debug` and above; the
  terminal shows `info` (`--verbose` for `debug`, `--quiet` for `warn`) (RF-009).
- Logs and records pass through the secret masking and never contain secrets or API keys (RNF-003).
- No telemetry: Rosetta sends nothing anywhere except to the providers the user configures.
- Latency is reported as P50 and P95, never as an average alone (RF-1011); provider calls carry trace and span ids
  mapped to the OpenTelemetry GenAI conventions (data-model.md section 3.10).

## 14. Runbooks

| Runbook | Path | Created by | Content |
|---|---|---|---|
| Provider setup | `docs/providers.md` | P1 provider card | Ollama, OpenAI, Anthropic, OpenAI-compatible; tested models |
| Release | `docs/releases.md` | P1 milestone card | release notes and the release steps of section 8 |

## 15. Naming of environments in code and configuration

Rosetta has no environment switch. Tests set `ROSETTA_TEST=1`, which makes any real provider adapter refuse to call
the network (ADR-008).
