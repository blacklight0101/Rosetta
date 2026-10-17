# Task cards - Rosetta

Protocol: [README.md](README.md). Plan written 2026-10-11 (DEC-96..DEC-101), revised after the review of 2026-10-11 (DEC-102..DEC-112). Every finished card is checked by the
verifier before it is merged. The orchestrator edits only the **Status** line of a card and appends follow-up cards;
it never rewrites a card. Card ids are never renumbered or reused.

## Totals (canonical)

This table is the only canonical place for card counts. `handoff.md` and `README.md` link here; any number they repeat
is re-checked against this table whenever a card is added, withdrawn or re-rated (README section 11). Bands follow
DEC-32 as changed by DEC-115: 1-5 haiku, 6-8 sonnet, 9-10 opus; no card starts on fable (it is escalation only, with owner approval).

| Phase                   | Cards   | haiku 1-5 | sonnet 6-8 | opus 9-10 | fable (escalation) | S       | M       | L      | Follow-ups | Withdrawn |
| ----------------------- | ------- | --------- | ---------- | --------- | ------------------ | ------- | ------- | ------ | ---------- | --------- |
| P1 Milestone slice (M1) | 172     | 64        | 90         | 18        | 0                  | 99      | 65      | 8      | 111        | 0         |
| P2 Full understand      | 30      | 6         | 18         | 6         | 0                  | 9       | 20      | 1      | 10         | 0         |
| P3 Report and plan      | 26      | 2         | 22         | 2         | 0                  | 3       | 21      | 2      | 1          | 0         |
| **Total**               | **228** | **72**    | **130**    | **26**    | **0**              | **111** | **106** | **11** | **122**    | **0**     |

## Conventions for every card

- **Card format**: heading `### P<phase>-nn - Title`, then the fields Difficulty, Size, Depends on, Gate, Status,
  Reads, Do, Delivers, Done when, Refs, one per line, in that order.
- **Difficulty**: 1-10 with the builder in brackets (DEC-32; README section 2). The verifier is `verifier` for 1-8 and
  `verifier-opus` for 9-10; `verifier-fable` only for work of a fable builder (DEC-41, DEC-115).
- **Size**: agent working time, not developer days (DEC-102): S at most about 1 hour, M about 2-3 hours, L about 4-6
  hours, each before verification. Nothing larger; split it.
- **Status**: `Todo` | `In progress` | `In review` | `Done` | `Blocked (<reason>)` (README section 3). A part of a card
  can wait while the rest runs: `Todo; <part> Blocked (G-nn)`.
- **Common Reads** for every card, not repeated on the cards: `CLAUDE.md`, `docs/architecture.md`,
  `docs/conventions.md`, the requirement ids in _Refs_ inside `docs/spec/requirements.md`, the ADRs in _Refs_, and
  for every card that touches a page `docs/design-system.md` and the named artboard in `docs/design/board/`.
- **Test mix**: test-first on every card (README section 1). Unless a card says otherwise, domain and application
  work delivers unit tests; persistence, HTTP routes, adapters and file writers deliver integration tests plus unit
  tests for their pure parts; every new route adds its rows to the access matrix test; pages are covered by the
  card's E2E spec on the harness of P1-13. The E2E journey cards are P1-46, P2-13 and P3-12; the verification-matrix
  cards are P1-49, P2-14 and P3-12, which also report the pyramid against README section 1.
- **Ownership** (one creator each; later cards add to it and depend on the owner):

| Owner | Owns                                                                                                                                                                                                                                         |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1-01 | `package.json` scripts, tool configuration, `scripts/test-levels.mjs`, the layer folders                                                                                                                                                     |
| P1-02 | `.github/workflows/ci.yml`, `codeql.yml`, `.github/dependabot.yml`                                                                                                                                                                           |
| P1-03 | `src/domain/errors/` (Result, the error-code registry `codes.ts`), `Clock`, `IdGenerator`, `Scheduler`, `Money`                                                                                                                              |
| P1-04 | `src/infrastructure/guards/secret-masker.ts`, the `Logger` port and loggers, security-event logging                                                                                                                                          |
| P1-05 | `src/infrastructure/config/environment.ts`, `.env.example`                                                                                                                                                                                   |
| P1-06 | `db/migrations/0001_accounts.sql`, `0002_projects_runs.sql`, `0003_cost_ledger_audit.sql`, `0004_server_settings_defaults.sql`; the pool, `PgMigrator`, `tests/support/postgres.ts`; `compose.yaml` with the `db` service (P1-45 adds `app`) |
| P1-07 | `src/presentation/main.ts`, `composition-root.ts`, the Fastify server, the error-to-status mapper                                                                                                                                            |
| P1-08 | `UserRepository`, `AuditLog`, `PasswordHasher` and their adapters                                                                                                                                                                            |
| P1-09 | `SessionStore`, the session, CSRF, Origin and role hooks, `tests/integration/access-matrix.test.ts`                                                                                                                                          |
| P1-12 | `web/` (Vite, Preact, tokens, shell, router `web/src/app/routes.ts`), `.claude/launch.json`                                                                                                                                                  |
| P1-13 | `playwright.config.ts`, `tests/e2e/support/`, `scripts/page-shots.mjs`                                                                                                                                                                       |
| P1-16 | `SourceFetcher` and `src/infrastructure/github/`                                                                                                                                                                                             |
| P1-17 | `RepositoryReader`, `OutputWriter`, `src/infrastructure/files/`                                                                                                                                                                              |
| P1-22 | `RunIndex`, `RunEventSink` adapters, the run queue, `RunManifest` writing                                                                                                                                                                    |
| P1-24 | `LlmProvider`, `FakeProvider`, `tests/contracts/llm-provider.contract.ts`, `ProviderCallRecorder`, `docs/providers.md`                                                                                                                       |
| P1-27 | `PriceTable`, `BudgetGuard`, `CostLedger`, `prices/default-prices.yaml`, `server_settings` caps use cases                                                                                                                                    |
| P1-28 | `EgressGuard`                                                                                                                                                                                                                                |
| P1-31 | the agent loop, tools, `prompts/reader/`                                                                                                                                                                                                     |
| P1-32 | the card schema, parser and card writers                                                                                                                                                                                                     |
| P1-55 | `.github/workflows/release.yml`, `docs/runbooks/deploy.md`                                                                                                                                                                                   |
| P1-56 | `ArchiveWriter` and `YazlArchiveWriter`                                                                                                                                                                                                      |
| P3-05 | `prompts/catalogue/`                                                                                                                                                                                                                         |

- **Follow-up cards**: README section 9.
- **Gates and open questions**: G-01 and G-03 gate P1-01, and every other card reaches P1-01 through its
  dependencies. G-02 is open; it is named on page cards for traceability. A card uses the stated default of an open
  question whose Status is "Default applies".

---

## Phase 1 - Milestone slice (M1)

Window 2026-10-13 to 2026-10-22; hosted deploy by 2026-10-20 (P1-55, after the host ADR of P1-48 and G-07); G-06 by 2026-10-24; hand-in by 2026-10-26
(roadmap.md P1, DEC-87..DEC-92). The 2026-10-20 hosted deployment carries what has merged by then, at least sign-in,
projects, scan, understand on one area and the live page, and is redeployed as cards land (DEC-102). If P1 runs late,
the postponement order of roadmap.md applies (DEC-90): the delete part of P1-40, P1-37, P1-38, P1-39, the history part
of P1-40, the verification view part of P1-35, then the queue part of P1-22 move to P2.

### P1-01 - Toolchain, quality gates and `npm run verify`

- **Difficulty**: 6 (sonnet)
- **Size**: M
- **Depends on**: none
- **Gate**: G-01, G-03
- **Status**: Done
- **Reads**: `docs/environments-and-delivery.md` sections 5-7; `docs/conventions.md` sections 1, 2, 7, 8 and 10; `docs/architecture.md` section 4.
- **Do**: create `package.json` (`"type": "module"`, engines from `.nvmrc`, scripts `build`, `dev`, `typecheck`, `lint`, `format`, `format:check`, `arch`, `deadcode`, `test`, `test:ci`, `test:levels`, `verify`), `.nvmrc`, `tsconfig.json` with every flag of conventions section 1, `eslint.config.ts` exactly as conventions section 10, `.prettierrc`, `.dependency-cruiser.cjs` with the layer rules of architecture section 3, `knip.json`, `vitest.config.ts` with projects `unit`, `integration`, `e2e` by folder and the coverage thresholds of conventions section 7, `commitlint.config.ts`, `lefthook.yml` (pre-commit, commit-msg, pre-push as environments section 5), `.editorconfig`, `.gitignore` additions; the folders of architecture section 4 with one module in `src/domain/` and one test per level that runs; `scripts/test-levels.mjs` printing `Unit n / Integration n / E2E n` with the shares and a warning outside 60/30/10 ±10, failing when the count is zero. Only devDependencies from the baseline of environments section 7.
- **Delivers**: the files above; `npm run verify` green; `package-lock.json`.
- **Done when**: the verifier runs `npm ci` and `npm run verify` (exit 0); a test file importing `src/infrastructure/` from `src/domain/` makes `npm run arch` fail (verifier tries it in a disposable worktree); an `any` in `src/` makes `npm run lint` fail; `npm run test:levels` prints three counts; `npm ls --depth=0` shows only baseline packages.
- **Refs**: RNF-001, RNF-005, RNF-013, ADR-009, ADR-010, ADR-011, DEC-27, DEC-30, DEC-39, DEC-40.

### P1-02 - CI workflows and repository security

- **Difficulty**: 6 (sonnet)
- **Size**: M
- **Depends on**: P1-01
- **Gate**: none
- **Status**: Done
- **Reads**: `docs/environments-and-delivery.md` sections 4-6; `docs/conventions.md` section 9.
- **Do**: `.github/workflows/ci.yml` on push and pull request, matrix `ubuntu-latest` and `windows-latest`, Node from `.nvmrc`, `npm ci`, `npm run verify` with a PostgreSQL 17 service container on Linux (database tests reported as skipped on Windows), `npm audit --audit-level=high --omit=dev` with `audit-exceptions.json`, gitleaks, dependency review on pull requests, pull request title checked by commitlint through `env: TITLE`; `.github/workflows/codeql.yml` (pull requests and weekly); `.github/dependabot.yml` (npm and actions weekly, grouped minor and patch). Top-level `permissions: contents: read`, `timeout-minutes` on every job, concurrency per branch, every third-party action pinned to a full commit SHA with the version in a comment, no `pull_request_target`, no secrets. Add a "Required checks" paragraph to `docs/environments-and-delivery.md` section 5 naming the job names the owner adds to the `main` ruleset.
- **Delivers**: the three workflow files; `audit-exceptions.json`; the doc paragraph.
- **Done when**: the card's own pull request shows every job green on both runners; `grep -n '\${{' .github/workflows/*.yml` shows no hit inside a `run:` block; every `uses:` line carries a 40-character SHA; a pull request title `bad title` fails the title job (verifier reads the job log of a test run or the commitlint unit test).
- **Refs**: RNF-001, RNF-003, ADR-011, DEC-28, DEC-35, DEC-42, DEC-57.

### P1-03 - Domain kernel: results, error codes, clock, ids and money

- **Difficulty**: 5 (haiku)
- **Size**: S
- **Depends on**: P1-01
- **Gate**: none
- **Status**: Done
- **Reads**: `docs/conventions.md` sections 3 and 6; `docs/architecture.md` sections 5, 11 and 12.
- **Do**: `src/domain/errors/result.ts` (`Result<T, E>` with `ok`/`err` helpers), `src/domain/errors/codes.ts` (the ranges of conventions section 6 as `as const` objects, one entry per code used so far, each with a plain message and next step), `src/domain/errors/rosetta-error.ts` (`Error` subclass with `code` and `cause`); `src/application/ports/clock.ts`, `id-generator.ts`; `src/infrastructure/system/system-clock.ts`, `timestamp-id-generator.ts` (run ids `yyyyMMdd-HHmmss-<stage>`, UUIDs through `node:crypto`), `tests/support/fixed-clock.ts`, `sequence-id-generator.ts`; `src/domain/budget/money.ts` (integer micro-USD, add, compare, format as USD; no floating point). The error-code registry reserves first the codes the design board already shows (`docs/design/board/`), one code per line. `Scheduler` port with `IntervalScheduler` (in `src/infrastructure/system/`) and `ManualScheduler` for tests (DEC-112).
- **Delivers**: the files above; unit tests for Result, Money arithmetic and formatting, id formats.
- **Done when**: `npm run verify` green; grep of hard-rule table rows `Date.now(`, `new Date(`, `randomUUID(` outside `src/infrastructure/` is empty; Money has no `number` division on cost values (verifier reads the code).
- **Refs**: RF-007, RNF-004, ADR-009, DEC-54.

### P1-04 - Secret masker and the application log

- **Difficulty**: 9 (opus)
- **Size**: M
- **Depends on**: P1-03
- **Gate**: none
- **Status**: Done
- **Reads**: `docs/data-model.md` section 3.14; `docs/security/threat-model.md` (secrets and logging rows); `docs/environments-and-delivery.md` section 13.
- **Do**: `SecretMasker` in `src/infrastructure/guards/secret-masker.ts`: masks connection-string passwords, API keys (`sk-`, `sk-ant-`, `ghp_`, `github_pat_`, `AKIA`), bearer tokens, private key blocks and `password=`/`pwd=` settings as `[MASKED:<kind>]`, keeps line count and line numbers, returns counts per kind, and throws a coded error on internal failure (callers fail closed). `Logger` port; `StdoutJsonLogger`, `JsonlFileLogger` (daily file `<data>/logs/rosetta-YYYY-MM-DD.jsonl`, `debug` and above, retention `ROSETTA_LOG_RETENTION_DAYS` applied at start-up), `FanOutLogger`, `MemoryLogger`; every entry passes the masker; entries carry time, level, logger, message, `RST` code and run, task and call ids when present; `securityEvent(code, detail)` writes `warn` with logger `security`.
- **Delivers**: the masker, the port, four loggers; unit tests with a fixture of secret patterns (including multi-line private keys and a value split across a JSON string), a failing-masker test, formatter tests; an integration test for daily files and retention in a temporary folder.
- **Done when**: every RF-009 and RF-141 masking scenario has a passing test; a test proves a fixture key never appears in any logger output; the masker keeps the line count of every fixture; `npm run verify` green.
- **Refs**: RF-009, RF-141, RNF-003, ADR-006, ADR-013, DEC-50, DEC-57.

### P1-05 - Server configuration from the environment

- **Difficulty**: 5 (haiku)
- **Size**: S
- **Depends on**: P1-03
- **Gate**: none
- **Status**: Done
- **Reads**: `docs/environments-and-delivery.md` section 4; `docs/architecture.md` section 10 (secure by default).
- **Do**: `src/infrastructure/config/environment.ts`: a zod schema for every variable of environments section 4 (types, defaults, `ROSETTA_SECRET_KEY` as 32 bytes base64, `ROSETTA_PUBLIC_URL` as an http(s) origin), parsed once into an immutable object; a failure throws `RST-10xx` naming each missing or invalid variable and never its value. `.env.example` lists every variable with a comment and a safe example; `.env` and `.env.*` (except the example) are git-ignored. Also `ROSETTA_TRUST_PROXY` (hop count, default 0) and the test-only variables of environments section 4, which are refused when `ROSETTA_PUBLIC_URL` is https.
- **Delivers**: the schema and loader; `.env.example`; unit tests per variable rule; a test that parses `.env.example` successfully and finds no value matching the secret patterns of P1-04.
- **Done when**: every RF-1305 scenario has a passing test; an error message test proves a wrong value is not echoed; `git check-ignore .env` succeeds.
- **Refs**: RF-1305, RNF-003, RNF-014, ADR-014.

### P1-06 - PostgreSQL, migrations and the release-1 schema

- **Difficulty**: 8 (sonnet)
- **Size**: L
- **Depends on**: P1-05
- **Gate**: none
- **Status**: Done
- **Reads**: `docs/data-model.md` sections 1, 4, 6, 7 and 8; `docs/environments-and-delivery.md` section 9.
- **Do**: `src/infrastructure/db/pool.ts` (`pg` pool from `DATABASE_URL`, statement timeout); `PgMigrator` (files `db/migrations/NNNN_*.sql` in order, each in a transaction, recorded in `schema_version` with a SHA-256 checksum; a changed applied file or an unknown applied version stops with `RST-24xx`; uses `DATABASE_MIGRATOR_URL` when set); migrations `0001_accounts` (users, sessions, provider_keys), `0002_projects_runs`, `0003_cost_ledger_audit` (with `cost_reservations`), `0004_server_settings_defaults` with every column, check, index and default of data-model section 4 and the grants of section 6 (`rosetta_app` with insert and select only on `cost_ledger` and `audit_events`); migrations only grant, the roles are created outside them (data-model section 6); `compose.yaml` with the `db` service (PostgreSQL 17 by digest, volume `pgdata`, port on `127.0.0.1` only) for local development; `tests/support/postgres.ts`: uses `ROSETTA_TEST_DATABASE_URL` (the CI service or the Compose `db`), applies every migration, gives each test file its own schema.
- **Delivers**: the pool, the migrator, four migrations, the test helper; integration tests: apply on an empty database, second run changes nothing, edited file refused, unknown version refused, failing migration leaves the previous schema; a schema test comparing tables, columns, checks and grants with data-model section 4.
- **Done when**: every RF-1302 scenario has a passing test; the verifier runs the integration project against a disposable database; `rosetta_app` cannot `UPDATE cost_ledger` (test); no SQL string is built with template literals (grep of README section 5.1).
- **Refs**: RF-1302, RNF-002, ADR-016, DEC-65.

### P1-07 - HTTP server foundation, health and security headers

- **Difficulty**: 7 (sonnet)
- **Size**: M
- **Depends on**: P1-04, P1-06
- **Gate**: none
- **Status**: Done
- **Reads**: `docs/adr/ADR-017-fastify-http-server.md`; `docs/architecture.md` sections 2, 10 and 11; `docs/security/threat-model.md` (HTTP rows).
- **Do**: `src/presentation/main.ts` (read the environment, apply migrations, then listen on `0.0.0.0:8080`); `composition-root.ts` (the only place creating adapters); Fastify with `@fastify/helmet` set to the exact CSP and headers of RF-1013 (HSTS only when `ROSETTA_PUBLIC_URL` is https), `@fastify/static` for the built front end, body size limits; the error-to-status mapper (400, 401, 403, 404, 409, 429, 500) returning `{ code, message, nextStep }` and never a stack; `GET /healthz` (200 `{status, version}` when the database answers, else 503 with no detail); `robots.txt` disallowing everything and `X-Robots-Tag: noindex, nofollow` on every response; request logging through the `Logger` port with masked values. Client IPs follow `ROSETTA_TRUST_PROXY`; the start-up starts the `Scheduler`.
- **Delivers**: the server, the start-up order, the mapper, health and robots routes; integration tests through `fastify.inject` for headers, statuses, health up and down, robots.
- **Done when**: every RF-1303 scenario and the header scenario of RF-1013 have passing tests; the RF-1201 noindex scenario passes; a thrown error with a stack produces a response without `at ` lines (test); `npm run verify` green. Every RF-007 scenario has a passing test (mapper and one route per status).
- **Refs**: RF-007, RF-1013, RF-1201, RF-1303, RNF-008, ADR-013, ADR-014, ADR-017.

### P1-08 - Users, passwords, audit log and the bootstrap administrator

- **Difficulty**: 10 (opus)
- **Size**: M
- **Depends on**: P1-04, P1-06, P1-07
- **Gate**: none
- **Status**: Done
- **Reads**: `docs/adr/ADR-015-accounts-sessions-and-user-secrets.md`; `docs/data-model.md` section 4 (`users`, `audit_events`); `docs/security/threat-model.md` (accounts rows).
- **Do**: domain `User`, `Role`, `AccountState` with the transitions of architecture section 5; password rules (at least 12 characters, not in `src/infrastructure/security/common-passwords.txt` of the 10,000 most common, not containing the user name); `PasswordHasher` port and `ScryptPasswordHasher` (`scrypt$N$r$p$salt$hash`, constant-time compare); `UserRepository` with `PgUserRepository` and `MemoryUserRepository` passing one contract suite (user name unique case-insensitively; list queries never select the hash); `AuditLog` port with `PgAuditLog` and `MemoryAuditLog` (detail masked by P1-04); `BootstrapAdmin` use case run by `main.ts`: creates the administrator from `ROSETTA_ADMIN_USER`/`ROSETTA_ADMIN_PASSWORD` once on an empty `users` table, state `MustChangePassword`, never logging the values. scrypt runs with `maxmem` 256 MiB and at most two hashes at a time (a semaphore); the failure window uses `first_failed_at` (DEC-112).
- **Delivers**: the domain types, rules, hasher, two ports with adapters and contract suites, the use case; unit tests for rules and transitions; integration tests on PostgreSQL.
- **Done when**: the RF-1102 bootstrap scenario and the RF-1100 hash scenario have passing tests; a second start with the variables set creates no second account (test); grep of the test log output finds no fixture password; the verifier-opus security review passes.
- **Refs**: RF-1100, RF-1102, RF-1103, RF-1109, RNF-003, ADR-015, ADR-016, DEC-62, DEC-66, DEC-69.

### P1-09 - Sign-in, sessions, CSRF and access control

- **Difficulty**: 10 (opus)
- **Size**: L
- **Depends on**: P1-07, P1-08
- **Gate**: none
- **Status**: Done
- **Reads**: `docs/adr/ADR-015-accounts-sessions-and-user-secrets.md`; `docs/data-model.md` section 4 (`sessions`); `docs/architecture.md` section 10; `docs/security/threat-model.md`.
- **Do**: `SessionStore` port with `PgSessionStore` and `MemorySessionStore` (256-bit id from `node:crypto`, only its SHA-256 stored, expiry min(idle 8 h, absolute 7 days), touch, end, end all for a user, hourly purge); `SignIn` (generic message, equal timing with a dummy hash for unknown users, five failures in 15 minutes lock for 15 minutes, audit and security events), `SignOut`; `@fastify/rate-limit` 10 sign-in attempts per minute per IP; the session cookie `__Host-rosetta_session` with the attributes of RF-1013; hooks: session (pages redirect to `/sign-in`, API 401), role guard, CSRF token through `@fastify/csrf-protection` in its cookie mode (`__Host-` cookie, `SameSite=Strict`; no secret in the database) and an `Origin` check against `ROSETTA_PUBLIC_URL` on every state-changing request (403 and a security event); the `Actor` passed to every use case; `tests/integration/access-matrix.test.ts` with rows anonymous, user, other user, administrator for every route that exists. The sign-in request, which has no session yet, is protected by the `Origin` check (DEC-112). Cap the password field (for example 1 024 characters) and the sign-in request body, and bound the hashing queue (or rely on the rate limit and say so), because the P1-08 hasher has no length limit and an unbounded queue (P1-08 verifier).
- **Delivers**: the store, two use cases, the hooks, routes `POST /api/session`, `DELETE /api/session`, `GET /api/session`; integration tests for success, failure, lockout, rate limit, timing (statistical bound), expiry with a fixed clock, CSRF and Origin refusals; the access matrix.
- **Done when**: every RF-1100, RF-1101 and RF-1009 scenario has a passing test; no response body in the test suite contains a session id, a hash or a CSRF secret (output scan test); the verifier-opus security review passes.
- **Refs**: RF-1009, RF-1013, RF-1100, RF-1101, RF-1105, RF-1109, RNF-014, ADR-013, ADR-015, ADR-017, DEC-62, DEC-69.

### P1-10 - Change password and account administration API

- **Difficulty**: 9 (opus)
- **Size**: M
- **Depends on**: P1-09
- **Gate**: none
- **Status**: Done
- **Reads**: `docs/architecture.md` section 6 (account use cases); `docs/data-model.md` section 4 (`users`, `audit_events`, `cost_ledger`).
- **Do**: `ChangePassword` (current password, rules of P1-08, ends the user's other sessions, clears `MustChangePassword`); `CreateUser` (user name, display name, role, initial password, option `mustChangePassword` default true so the teacher account can be created without it, RF-1107), `UpdateUser` (disable, enable; disabling ends sessions), `ResetPassword` (ends sessions, sets `MustChangePassword`), `ListUsers` (last sign-in, project count, month-to-date cost from a read-only sum over `cost_ledger`), `ListAudit` (last 30 days, filter by user and action); routes under `/api/account/` and `/api/admin/` with role checks; an audit row for every change; a signed-in user in `MustChangePassword` is limited to the change-password route.
- **Delivers**: the use cases, routes and access-matrix rows; integration tests per action and per refusal.
- **Done when**: every RF-1102, RF-1103 and RF-1109 scenario has a passing test; a `user` gets 403 on every `/api/admin/` route (matrix); audit rows never contain a password (test).
- **Refs**: RF-1102, RF-1103, RF-1105, RF-1107, RF-1109, ADR-015, DEC-62, DEC-66.

### P1-11 - Encrypted provider keys

- **Difficulty**: 10 (opus)
- **Size**: M
- **Depends on**: P1-09
- **Gate**: none
- **Status**: Done
- **Reads**: `docs/adr/ADR-015-accounts-sessions-and-user-secrets.md`; `docs/data-model.md` section 4 (`provider_keys`); `docs/security/threat-model.md` (keys and SSRF rows).
- **Do**: `SecretBox` port and `AesGcmSecretBox` (AES-256-GCM, random IV, additional data `user_id:provider`, key version; decrypts with `ROSETTA_SECRET_KEY_PREVIOUS` during a rotation); `ProviderKeyRepository` with Pg and memory adapters; `SaveProviderKey` (stores ciphertext and last four characters; for `openai-compatible` the base URL must be https and must not resolve to a private, loopback or link-local address, checked through `node:dns` in infrastructure), `DeleteProviderKey` (row removed), `ListProviderKeys` (provider, last four, updated time only); routes under `/api/account/keys`; audit rows without the value. The AES key is derived from `ROSETTA_SECRET_KEY` with HKDF-SHA256 (info `rosetta/provider-keys/v1`), `key_version` is its fingerprint, and rows under the previous key are re-encrypted at start-up; the base-URL address check runs again on every connect through a guarded HTTP agent (DEC-112).
- **Delivers**: the box, repository, use cases and routes; unit tests for the box (tamper detection, wrong additional data, rotation); integration tests on storage, replacement, deletion and the URL check with a fake resolver; an output scan test over every response of the suite.
- **Done when**: every RF-1104 scenario except the run-time key choice (P1-29) has a passing test; no response, log entry or audit row in the suite contains a fixture key; the verifier-opus security review passes.
- **Refs**: RF-1104, RF-1109, RNF-003, ADR-015, DEC-64.

### P1-12 - Web front end shell and design tokens

- **Difficulty**: 7 (sonnet)
- **Size**: M
- **Depends on**: P1-07
- **Gate**: G-02
- **Status**: Done
- **Reads**: `docs/design-system.md` sections 2-9, 12 and 13; `docs/design/tokens.css`; `docs/design/board/Main.dc.html`; DEC-52.
- **Do**: `web/` with Vite and `@preact/preset-vite` building into `dist/web/` served by P1-07; `web/src/styles/tokens.css` identical to `docs/design/tokens.css`; the signed-in shell (header with the totals pill slot, navigation groups, main region) and the shared components of design-system section 5 that every page needs (buttons, fields with error text, status badges with glyphs for every value of every state list, error banner with code and next step, empty state); a text-only rendering helper for repository and model text (RF-507 rule 2: only `https://github.com/` links stay links); a typed API client that sends the CSRF token and maps error bodies; the router `web/src/app/routes.ts`; no inline scripts or styles (CSP of RF-1013); `.claude/launch.json` entry `rosetta-web` starting the dev server. Put every built file under `/assets/` (the P1-09 public paths are `/`, `/sign-in` and files under `/assets/`; a file at the root, such as a favicon, would need a session).
- **Delivers**: the shell, components, client, router and launch entry; unit tests for the badge map over every state value, the link filter and the client's error mapping; a component gallery page under `/dev/gallery` built only in development.
- **Done when**: the tokens comparison test passes; the verifier walks `/dev/gallery` at 1280x800 and 360x780, light and dark, and sees no console error; a lint test proves `innerHTML` and `dangerouslySetInnerHTML` are rejected; `npm run build` produces `dist/web/`.
- **Refs**: RF-507, RF-1013, RNF-008, RNF-010, ADR-012, DEC-26, DEC-44, DEC-52, DEC-56, DEC-70, DEC-71.

### P1-13 - End-to-end harness

- **Difficulty**: 7 (sonnet)
- **Size**: M
- **Depends on**: P1-09, P1-12, P1-16, P1-24
- **Gate**: none
- **Status**: Done
- **Reads**: `docs/architecture.md` section 17; `docs/conventions.md` section 7; `docs/data-model.md` section 8.
- **Do**: `playwright.config.ts` (Chromium, the two viewports of README section 1, light and dark projects); `tests/e2e/support/`: a test server started with a disposable database, `ROSETTA_TEST=1`, the fake provider and fake GitHub injection points in the composition root (test-only factory), seeded users through the use cases, a sign-in helper, an axe helper failing on serious and critical violations; one smoke spec (health, robots, sign-in page reachable). `scripts/page-shots.mjs`: opens a page of the test server at each viewport and colour scheme of README section 1 and saves PNG screenshots and the console errors, for the verifier's page walk.
- **Delivers**: the configuration, support files and the smoke spec; the e2e project wired into `npm run test:ci` on Linux.
- **Done when**: the verifier runs the e2e project headless from a clean database (exit 0); the smoke spec runs in both colour schemes; network calls outside `127.0.0.1` fail the test run (test with a blocked request).
- **Refs**: RNF-005, ADR-008, ADR-010, DEC-39.

### P1-14 - Sign-in, change password and settings pages

- **Difficulty**: 6 (sonnet)
- **Size**: M
- **Depends on**: P1-10, P1-11, P1-13
- **Gate**: G-02
- **Status**: Done
- **Reads**: `docs/design/board/SignIn.dc.html`, `ChangePassword.dc.html`, `Settings.dc.html`; `docs/design-system.md` section 14.
- **Do**: pages `/sign-in` (generic error, lockout shown as the same message), `/account/password` (forced at first sign-in; rule checklist updating while typing), `/settings` (keys per provider with last four, replace, delete with confirmation; the Test button slot that P1-29 fills); sign-out in the header menu. The settings page also offers the user's optional daily cap for their own keys (DEC-107).
- **Delivers**: three pages; E2E specs: sign in and out, forced change at first sign-in, save and delete a key, axe on each page.
- **Done when**: the verifier walks the three pages at both viewports and colour schemes; the E2E specs pass; no page shows a full key (spec asserts on the DOM).
- **Refs**: RF-1100, RF-1101, RF-1103, RF-1104, RNF-008, DEC-70.

### P1-15 - Landing page

- **Difficulty**: 6 (sonnet)
- **Size**: M
- **Depends on**: P1-13
- **Gate**: G-02
- **Status**: Done
- **Reads**: `docs/design/board/Landing.dc.html`; `.impeccable/surfaces/` (landing direction contract); `docs/design-system.md` section 14 (replay stage, pipeline rail).
- **Do**: the public page at `/` exactly as the approved artboard: hero, "Watch it work" replay stage with a static sample run labelled "Sample run" (animation once per 10 s cycle, paused on hover or focus, static under reduced motion), pipeline rail, evidence cards, cost control, security and privacy, technology, about the project; Sign in button; "Request access" mail link only when `ROSETTA_CONTACT_EMAIL` is set; a signed-in visitor is redirected to `/projects`; works without JavaScript from 360 px.
- **Delivers**: the page and its assets; E2E specs: page with JavaScript disabled, at 360 px, axe in both schemes, redirect when signed in, link present or absent by configuration.
- **Done when**: every RF-1200 and RF-1201 scenario has a passing test; the verifier walks the page at both viewports and colour schemes and compares it with the artboard.
- **Refs**: RF-1200, RF-1201, RNF-010, Q-19, Q-20, DEC-63, DEC-70.

### P1-16 - GitHub sources: URLs, commits and safe snapshot download

- **Difficulty**: 10 (opus)
- **Size**: L
- **Depends on**: P1-04, P1-05
- **Gate**: none
- **Status**: Done
- **Reads**: `docs/adr/ADR-012-local-web-ui-and-github-sources.md`; `docs/adr/ADR-019-tarball-extraction-and-ignore-matching.md`; `docs/data-model.md` section 3.3; `docs/security/threat-model.md` (download rows).
- **Do**: domain `GitHubRepoRef` (parse `https://github.com/<owner>/<repo>[/tree/<ref>[/<subpath>]]`, normalise), `CommitSha`, `Permalink` builder; `SourceFetcher` port; `GitHubSnapshotFetcher`: resolve the ref to a full SHA through the REST API (default branch when absent), download the tarball over https from `api.github.com`/`codeload.github.com`/`github.com` only (redirects checked), stream through `tar` with the filter of ADR-019 (no absolute paths, no `..`, links skipped and counted, entry and byte limits 100,000 and 500 MB configurable), extract into `<data>/sources/.partial-<id>/`, then rename to `<owner>__<repo>@<sha>/` and make it read-only; reuse a cached snapshot without network; discard partial folders at start-up; rate-limit responses become `RST-19xx` with the reset time and the `GITHUB_TOKEN` hint; the token is sent only to GitHub hosts and never logged; snapshot hash recorded; `FakeSourceFetcher` and a fake GitHub HTTP server for tests; fixture archives under `tests/fixtures/snapshots/` (normal, traversal entry, symlink and hardlink entries, oversized, too many entries, redirect to another host). Concurrent fetches of the same commit take an in-process lock per `owner/repo@sha`; a rename onto an existing snapshot deletes its own partial folder and uses the existing one.
- **Delivers**: the domain types, port, adapter, fake, fixtures; unit tests for URL parsing and permalinks; integration tests per hostile fixture and for cache reuse and partial cleanup.
- **Done when**: every RF-120, RF-121, RF-122, RF-123, RF-125 and RF-127 scenario has a passing test; after the traversal fixture no file exists outside the snapshot folder (test lists the parent); the verifier-opus security review passes.
- **Refs**: RF-005, RF-120, RF-121, RF-122, RF-123, RF-125, RF-126, RF-127, RNF-001, ADR-012, ADR-013, ADR-019, DEC-48, DEC-57.

### P1-17 - Repository reader, ignore rules, deny list and output writer

- **Difficulty**: 9 (opus)
- **Size**: M
- **Depends on**: P1-04
- **Gate**: none
- **Status**: Done
- **Reads**: `docs/adr/ADR-006-read-only-tools-and-data-egress.md`; `docs/adr/ADR-019-tarball-extraction-and-ignore-matching.md`; `docs/data-model.md` sections 2, 3.2 and 6 (files).
- **Do**: `RepositoryReader` port and `NodeRepositoryReader` over a snapshot root and optional subpath: list files, read a line range, grep; every path resolved against the root and refused outside it; ignore rules from the project setting joined with a `.rosettaignore` committed in the snapshot, which can only add exclusions (DEC-109), matched with `ignore`; the built-in deny list of RF-147 always applied unless `scan.allowDenied` lifts a pattern (recorded); refused reads return a reason and log a security event; `grep` in a `node:worker_threads` worker with the RF-146 limits (pattern length 200, line cut at 2,000 characters, 2 s timeout terminates the worker); `OutputWriter` port and `NodeOutputWriter` writing only inside `<data>/users/<userId>/` (paths built from ids, resolved and checked), refusing the snapshot cache; workspace path helpers.
- **Delivers**: two ports, two adapters, the grep worker, the helpers; unit tests for matching and limits; integration tests in temporary folders: refused traversal, ignored and denied paths, `^(a+)+$` on a long line times out, write outside the workspace refused.
- **Done when**: every RF-005, RF-140, RF-146 and RF-147 scenario has a passing test; no write API exists on `RepositoryReader` (verifier reads the port); `npm run verify` green.
- **Refs**: RF-005, RF-140, RF-146, RF-147, RNF-001, ADR-006, ADR-013, ADR-019, DEC-16, DEC-17, DEC-57.

### P1-18 - Projects and project settings API

- **Difficulty**: 7 (sonnet)
- **Size**: M
- **Depends on**: P1-09, P1-16
- **Gate**: none
- **Status**: Done
- **Reads**: `docs/data-model.md` sections 3.1 and 4 (`projects`); `docs/architecture.md` section 6.
- **Do**: `ProjectRepository` with Pg and memory adapters (scoped by actor; unique on user, URL, ref, subpath); `CreateProject` (parse with P1-16, store with default settings from `templates/project-settings.json` and `templates/ignore-rules.txt`; an existing match is returned instead), `ListProjects`, `GetProject`, `UpdateProjectSettings` (zod schema of data-model 3.1: providers known, a model for every role, caps non-negative, price overrides, ignore rules, `scan.allowDenied`, `agents.parallelism`, `budget.allowUnpriced`; a `baseUrl` is refused; each problem returned with its field and code); new projects take their roles from the `defaultRoles` server setting (DEC-106), `OpenWorkspace` for the administrator with an audit row; routes under `/api/projects` and `/api/admin/users/:id/projects`; access-matrix rows.
- **Delivers**: repository, use cases, templates, routes; unit tests for the settings schema; integration tests per scenario.
- **Done when**: every RF-010 scenario, the first two RF-002 scenarios, the RF-405 configuration shape and both RF-1105 scenarios have passing tests; another user's project id answers 404 (matrix).
- **Refs**: RF-002, RF-010, RF-405, RF-1105, RF-1109, ADR-012, ADR-015, ADR-016, DEC-48, DEC-66.

### P1-19 - Universal scan: files, languages, sizes, artefacts and SQL

- **Difficulty**: 7 (sonnet)
- **Size**: M
- **Depends on**: P1-17
- **Gate**: none
- **Status**: Done
- **Reads**: `docs/adr/ADR-004-universal-scan-and-language-packs.md`; `docs/data-model.md` section 3.4.
- **Do**: in `src/infrastructure/scan/universal/`: walk the snapshot (subpath only, paths relative to the repository root), default ignores (version control, `bin/`, `obj/`, `node_modules/`, `packages/`, binary detection), size limit with `skipped: too large`; language by extension and content heuristics (`unknown` allowed); line count and token estimate; artefact kinds of RF-102 by rule table; embedded SQL statements with `path:line`; stable sort of every list. Fixture repositories under `tests/fixtures/repos/` in two stacks (a small C# WebForms sample with cited MIT excerpts and a small PHP sample) plus one in a language with no pack.
- **Delivers**: the walker, detectors, rule tables, fixtures; unit tests per language and artefact rule and per SQL pattern; integration tests on the fixtures.
- **Done when**: every RF-100, RF-101, RF-102, RF-103 and RF-124 scenario has a passing test; fixture excerpts carry their source and licence in a README beside them (RNF-009).
- **Refs**: RF-100, RF-101, RF-102, RF-103, RF-124, RNF-009, ADR-004, DEC-11.

### P1-20 - Areas, code map and scan summary

- **Difficulty**: 7 (sonnet)
- **Size**: M
- **Depends on**: P1-21
- **Gate**: none
- **Status**: Done
- **Reads**: `docs/data-model.md` sections 3.4 and 3.5; `docs/architecture.md` section 5 (`CodeMap`, `Area`).
- **Do**: domain `CodeMap`, `FileEntry`, `Area`, `MapLevel` with their invariants; grouping by folder and by language-pack references, splitting groups over the area token budget, configured areas replacing the automatic grouping for the files they match; `codemap.json` writer and zod schema with `schemaVersion` 1, byte-identical for the same input (no times, stable order); `scan-summary.md` with languages, artefact counts, areas with files, tokens and map level, and the scan duration.
- **Delivers**: domain types, grouping, writers, schema; unit tests on grouping and invariants; schema validation test; a determinism test running the scan twice; snapshot test of the summary; a timing assertion on the demo-size fixture.
- **Done when**: every RF-104, RF-105 and RF-106 scenario has a passing test; the coarse path of RF-112 produces a valid code map for the no-pack fixture; the summary states the map level per area.
- **Refs**: RF-104, RF-105, RF-106, RF-112, RNF-004, RNF-007, ADR-004.

### P1-21 - Language pack interface and the C# pack

- **Difficulty**: 8 (sonnet)
- **Size**: M
- **Depends on**: P1-07, P1-19
- **Gate**: none
- **Status**: Done
- **Reads**: `docs/adr/ADR-004-universal-scan-and-language-packs.md`; `docs/data-model.md` section 3.4 (symbols, references, routes).
- **Do**: `LanguagePack` port (extensions, `analyse(file) -> symbols, references, routes`); a registry in the composition root; per-file fallback to `coarse` with a warning when a pack throws; `CSharpPack` on `web-tree-sitter` with the `tree-sitter-c-sharp` WebAssembly grammar loaded from the package: classes, interfaces, methods, properties with line ranges; `.aspx`/`.ascx`/`.master` linked to their code-behind class; `DbContext` entity sets as candidate entities; a test pack for the interface tests.
- **Delivers**: port, registry, C# pack, test pack; unit tests on fixtures from the demo app (cited, MIT); an integration test with a failing pack.
- **Done when**: every RF-110 and RF-111 scenario has a passing test; `web-tree-sitter` is imported only under `src/infrastructure/scan/packs/` (grep).
- **Refs**: RF-110, RF-111, RNF-009, ADR-004, DEC-12.

### P1-22 - Runs: index, manifest, events and the run queue

- **Difficulty**: 8 (sonnet)
- **Size**: L
- **Depends on**: P1-18
- **Gate**: none
- **Status**: Done
- **Reads**: `docs/data-model.md` sections 3.6, 3.9 and 4 (`runs`); `docs/architecture.md` sections 5 (`Run`, `RunQueueState`) and 7 (`RunIndex`, `RunEventSink`).
- **Do**: domain `Run`, `RunManifest`, `RunEndState`, `RunEvent` types; `RunIndex` with Pg and memory adapters (scoped by actor); manifest written at start (version, stage, options, source URL, ref, commit, subpath, snapshot hash, settings, caps) and at end (end state set once, time); `RunEventSink` with `JsonlEventLog` (`seq` without gaps, `run.ended` last), `SseBroadcaster` (per user; late subscribers get stored events first) and `FanOutSink`; SSE route `/api/runs/:id/events` with the session check; the run queue (default 2 running, one per user, positions, cancel a queued run as `Interrupted`); on start-up, runs left `Running` are ended as `Interrupted`. `StopRun` with `POST /api/runs/:runId/stop` (aborts the run's signal); runs record `commit_sha` and `snapshot_key`; restart recovery runs through the `Scheduler` at start-up (running runs end `Interrupted`, queued runs keep their order).
- **Delivers**: domain types, adapters, queue, routes; unit tests on the aggregate and queue rules; integration tests for the event log, SSE reconnect, queue with a fixed clock, an interrupted run.
- **Done when**: every RF-003, RF-126, RF-1006 and RF-1108 scenario has a passing test; RNF-002 interrupted-run test passes; another user cannot subscribe to a run's events (matrix).
- **Refs**: RF-003, RF-126, RF-1006, RF-1105, RF-1108, RNF-002, RNF-004, ADR-005, ADR-012, ADR-014, DEC-46, DEC-61.

### P1-23 - Scan as a run

- **Difficulty**: 6 (sonnet)
- **Size**: M
- **Depends on**: P1-20, P1-22, P1-74
- **Gate**: none
- **Status**: Done
- **Reads**: `docs/architecture.md` section 6 (`RunScan`); `docs/data-model.md` sections 2 and 3.6.
- **Do**: `RunScan` use case: resolve and fetch the snapshot (P1-16), scan (P1-19..P1-21), write `codemap.json` and `scan-summary.md` into the run folder, publish run events, record the manifest; route `POST /api/projects/:id/runs` with stage `scan`; the run row's state through the queue.
- **Delivers**: the use case and route; integration tests with the fake source fetcher and a fixture snapshot, including a failed fetch ending the run as `Failed` with its code.
- **Done when**: a scan run on the C# fixture produces a valid code map and a manifest holding RF-126's fields (test); the snapshot hash is unchanged after the run (RF-005 test); `npm run verify` green.
- **Refs**: RF-003, RF-005, RF-100, RF-121, RF-126, ADR-004, ADR-012.

### P1-24 - Provider port, fake provider and the provider call log

- **Difficulty**: 8 (sonnet)
- **Size**: M
- **Depends on**: P1-04
- **Gate**: none
- **Status**: Done
- **Reads**: `docs/adr/ADR-003-provider-swappable-agent-loop.md`; `docs/adr/ADR-008-testing-with-recorded-responses.md`; `docs/data-model.md` sections 3.10 and 3.15.
- **Do**: `LlmProvider` port (system prompt, messages, tool definitions, abort signal; returns text, tool calls, usage with input, output and cached tokens, finish reason, provider request id, exact model version); `FakeProvider` replaying recordings from `tests/recordings/` and failing on demand; `tests/contracts/llm-provider.contract.ts`; `ObservedProvider` decorator writing one `provider-calls.jsonl` record per attempt through `ProviderCallRecorder` (`JsonlProviderCallLog`, `MemoryProviderCallLog`) with every RF-408 field and a link to the masked transcript entry; transcripts written masked. `kind: fake` is refused unless `ROSETTA_TEST=1`; create `docs/providers.md` with its outline (one section per provider, filled by the adapter cards).
- **Delivers**: port, fake, contract suite, decorator, recorders; tests: contract on the fake, record fields, retry attempts linked by call id, output scan for keys.
- **Done when**: every RF-400 and RF-408 scenario that does not need a real adapter has a passing test; the contract suite is importable by adapter tests; no test reaches the network (`ROSETTA_TEST=1` guard test).
- **Refs**: RF-400, RF-408, RNF-003, RNF-004, RNF-005, ADR-003, ADR-008, DEC-09, DEC-50.

### P1-25 - Ollama adapter with the text tool protocol

- **Difficulty**: 8 (sonnet)
- **Size**: M
- **Depends on**: P1-24
- **Gate**: none
- **Status**: Done
- **Reads**: `docs/adr/ADR-003-provider-swappable-agent-loop.md`; `docs/data-model.md` section 3.10 (Ollama fields); `docs/environments-and-delivery.md` section 4 (`ROSETTA_OLLAMA_URL`).
- **Do**: `OllamaProvider` over `fetch` against the Ollama chat API with a timeout and abort signal: native tool calls where the model supports them, the JSON-in-text protocol (`toolMode: text`) otherwise with the same validation; usage and Ollama's load, prompt-evaluation and generation durations and tokens per second; model digest as the exact version; refusal to call when `ROSETTA_TEST=1`; a clear `RST-15xx` with the fix command when Ollama is down or the model is missing; retries with back-off for timeouts and 5xx; the Ollama section of `docs/providers.md`.
- **Delivers**: the adapter, recordings from a fake Ollama HTTP server, the contract suite run on it, `docs/providers.md`; a manual live check script documented in `docs/providers.md`.
- **Done when**: every RF-401 and RF-205 scenario has a passing test against the fake server; the contract suite passes; the owner's live check (G-04) is recorded in the pull request by the orchestrator when G-04 is open, otherwise noted as pending in `handoff.md`.
- **Refs**: RF-205, RF-401, RF-406, RF-408, RNF-011, ADR-003, ADR-008, DEC-23, DEC-53.

### P1-26 - OpenAI adapter with retries

- **Difficulty**: 7 (sonnet)
- **Size**: M
- **Depends on**: P1-24
- **Gate**: none
- **Status**: Done
- **Reads**: `docs/adr/ADR-003-provider-swappable-agent-loop.md`; `docs/data-model.md` section 3.10.
- **Do**: `OpenAiProvider` on the `openai` package: tool calling, usage including cached tokens, dated model id, request id; retries with exponential back-off and jitter honouring retry-after for 429, timeouts and 5xx; permanent errors (bad key, unknown model) as coded errors that stop the task; key passed per call from the provider set (P1-29), never read from the environment inside the adapter; refuses to call when `ROSETTA_TEST=1`; an OpenAI section in `docs/providers.md`. Record in `docs/providers.md` the cheapest current OpenAI tool-calling model with its dated id as the recommended `defaultRoles` value for the hosted deployment (DEC-106).
- **Delivers**: the adapter, recordings, the contract suite run on it, the docs section; unit tests with a fake HTTP server for each retry and failure path.
- **Done when**: every RF-402 and RF-406 scenario has a passing test; `openai` is imported only under `src/infrastructure/providers/` (grep); one live call by the owner is recorded when G-04 is open.
- **Refs**: RF-402, RF-406, RF-408, ADR-003, ADR-008, DEC-09.

### P1-27 - Prices, budget guard, caps and the cost ledger

- **Difficulty**: 10 (opus)
- **Size**: L
- **Depends on**: P1-06, P1-09, P1-24
- **Gate**: none
- **Status**: Done
- **Reads**: `docs/adr/ADR-007-cost-control.md`; `docs/data-model.md` sections 3.12, 3.13, 3.18 and 4 (`cost_ledger`, `server_settings`).
- **Do**: domain `PriceTable`, `Price`, `TokenUsage`, `Budget`, `UsageCap`; `prices/default-prices.yaml` (dated, USD, Ollama at zero) with project overrides; `CostLedger` port with Pg and memory adapters; `BudgetGuard` decorator of `LlmProvider`: before each call, inside one transaction with `pg_advisory_xact_lock` on the user and on the server, sum the ledger and the unexpired `cost_reservations` for the run, user-day and server-month, refuse the call with `CapReached` when its worst case (prompt tokens plus maximum output) would pass any applicable cap, otherwise insert its reservation; after the call, insert one ledger row with every column of data-model 3.13 (estimated usage marked `estimated`) and delete the reservation in one transaction; a refused call is recorded through `ProviderCallRecorder` as `refused-by-cap`; cap rules of DEC-107: with server keys the run cap is the lower of the run's and the administrator's, user-day and server-month caps apply, the shipped prices are used; with the user's own keys the run cap and the user's own daily cap apply and price overrides are honoured; UTC calendar periods; a cap refusal aborts the run's signal and the run ends `CapReached`; `GetCaps`/`SetCaps` use cases on `server_settings` with audit; the cost report writer (`cost.json`, `cost.md`) by role, task, provider and model with the price table version. Also add the API for the user's optional daily cap on their own keys (DEC-107) and wire the disabled slot on `/settings` (`data-testid="own-daily-cap"`, P1-14).
- **Delivers**: domain types, price file, ledger, guard, cap use cases and routes, cost writer; unit tests on pricing and cap arithmetic; integration tests: each cap with a fixed clock, two parallel runs racing for the last cent, an interrupted run keeping its ledger rows.
- **Done when**: every RF-420, RF-421, RF-422, RF-426, RF-428 and RF-1106 scenario has a passing test (the cost page of RF-428 is P1-36); no code path calls a real provider without the guard (verifier reads the composition root and P1-29's factory once merged); the verifier-opus security review passes.
- **Refs**: RF-420, RF-421, RF-422, RF-426, RF-428, RF-1106, ADR-007, ADR-016, DEC-13, DEC-49, DEC-54, DEC-64, Q-22.

### P1-28 - Egress guard

- **Difficulty**: 10 (opus)
- **Size**: M
- **Depends on**: P1-17, P1-24
- **Gate**: none
- **Status**: Done
- **Reads**: `docs/adr/ADR-006-read-only-tools-and-data-egress.md`; `docs/adr/ADR-013-untrusted-code-and-model-output.md`; `docs/data-model.md` section 3.11; `docs/security/threat-model.md`.
- **Do**: `EgressGuard` decorator of `LlmProvider`: masks every message part with the masker of P1-04 (a masker failure blocks the call, logs the code and stops the task), adds mask counts to the run record, appends `egress.log.jsonl` records (provider, model, role, task, path and line range of each excerpt), and refuses any call to a non-local provider unless the run carries consent (RF-143); repository content reaches the guard only inside labelled data blocks built by P1-31, and the guard refuses a message that places tool results in the system prompt.
- **Delivers**: the guard; unit tests with the secret fixture and a failing masker; integration tests with the fake provider for the egress log and the consent refusal.
- **Done when**: every RF-141, RF-142 and RF-143 scenario at the guard has a passing test; a fixture secret never reaches the fake provider's recorded request (test); the verifier-opus security review passes.
- **Refs**: RF-141, RF-142, RF-143, RF-145, RNF-003, RNF-014, ADR-006, ADR-013, DEC-16, DEC-57.

### P1-29 - Provider set per run, key choice and the provider test

- **Difficulty**: 8 (sonnet)
- **Size**: M
- **Depends on**: P1-11, P1-13, P1-14, P1-18, P1-25, P1-26, P1-27, P1-28
- **Gate**: none
- **Status**: Done
- **Reads**: `docs/architecture.md` sections 2 (composition root) and 7; `docs/adr/ADR-015-accounts-sessions-and-user-secrets.md` (keys at run time).
- **Do**: a provider factory used only by the composition root: for each role, pick the user's key, else the server key when the user may use server keys, else stop before any call naming the provider (RF-002 third scenario); wrap every provider as `BudgetGuard(EgressGuard(ObservedProvider(adapter)))`; record the key source for the ledger; Ollama only when `ROSETTA_OLLAMA_URL` is set; `TestProviders` use case (one tiny call per configured role through the guards, cost counted in the ledger) with route `POST /api/account/providers/test`; the Test button on `/settings` showing reachable or the error per role. Notes from P1-28: fill `options.cloudConsent` for the run; build the guard's host and the adapter's URL from one parsed URL (`http://localhost@evil.com` gives `evil.com`) and test it.
- **Delivers**: the factory, use case, route and button; integration tests with two fake providers for model per role, key choice and the missing-key stop; an E2E spec for the Test button.
- **Done when**: every RF-405 and RF-407 scenario, the third RF-002 scenario and the run-time RF-1104 scenario have passing tests; a test proves an adapter created by the factory cannot be called without both guards.
- **Refs**: RF-002, RF-405, RF-407, RF-1104, ADR-003, ADR-006, ADR-007, ADR-015, DEC-64.

### P1-30 - Run estimate

- **Difficulty**: 7 (sonnet)
- **Size**: M
- **Depends on**: P1-18, P1-20, P1-27
- **Gate**: none
- **Status**: Done
- **Reads**: `docs/adr/ADR-007-cost-control.md`; `docs/architecture.md` section 6 (`EstimateRun`).
- **Do**: `EstimateRun` in `src/application/estimate/`: from the code map, the chosen areas, the models per role and the price table, compute tokens and cost per role as low, likely and high with the assumptions stated (turns per area, output per turn, verifier share); route `GET /api/projects/:id/estimate`; the confirmation threshold of RF-425's second scenario stays in P2-08 (DEC-97).
- **Delivers**: the estimator and route; unit tests on fixed code maps and price tables.
- **Done when**: the first RF-425 scenario has passing tests; the estimate for Ollama-only roles is zero cost with token figures (test).
- **Refs**: RF-425, ADR-007, DEC-13, DEC-97.

### P1-31 - Agent loop, read-only tools and the reader prompt

- **Difficulty**: 9 (opus)
- **Size**: L
- **Depends on**: P1-17, P1-20, P1-24
- **Gate**: none
- **Status**: Done
- **Reads**: `docs/architecture.md` section 8; `docs/adr/ADR-003-provider-swappable-agent-loop.md`; `docs/adr/ADR-013-untrusted-code-and-model-output.md`; `docs/data-model.md` section 3.15.
- **Do**: in `src/application/agent/`: the tool-calling loop (system prompt, messages, tools, max turns, context-share limit ending as `TurnLimitReached`, shared abort signal); tools `list_area_files`, `read_file`, `grep`, `codemap_query` with zod-validated arguments, error results the model can correct, results wrapped in delimited repository-content blocks; `prompts/reader/area.v1.md` stating the data-block rule; prompt files loaded with version and SHA-256 recorded for the manifest; an injection fixture repository under `tests/fixtures/repos/injection/` with recordings. Notes from P1-28: put repository content only in labelled data blocks built with `renderDataBlock`, never in the system prompt or in tool definitions; add the RF-145 sentence that text inside data blocks is data to every prompt; resolve read paths to the code map's exact case so the egress guard's split-key carry matches them.
- **Delivers**: the loop, tools, prompt, fixture and recordings; integration tests with recorded responses: a normal area, a bad tool call corrected, the turn limit, the injection fixture; a unit test that every prompt file states the data-block rule.
- **Done when**: every RF-201 and RF-145 scenario has a passing test; no tool can write (verifier reads the tool set); the manifest records prompt versions and hashes (test).
- **Refs**: RF-145, RF-146, RF-201, RNF-004, ADR-003, ADR-006, ADR-013, DEC-15, DEC-17, DEC-57, DEC-58.

### P1-32 - Card schema, parsing with repair, ids and card writers

- **Difficulty**: 8 (sonnet)
- **Size**: M
- **Depends on**: P1-03, P1-17
- **Gate**: none
- **Status**: Done
- **Reads**: `docs/adr/ADR-005-evidence-cards-and-two-step-verifier.md`; `docs/data-model.md` sections 3.7 and 3.8.
- **Do**: domain `Card`, `CardType`, `Claim`, `Citation`, `ClaimStatus` (transitions of architecture section 5; a claim is never removed), `Confidence`; the card zod schema and a parser that returns validation errors for one repair attempt (raw output saved and the task marked `InvalidOutput` after a second failure); ids `FEAT-001`, `BR-001`, `ENT-001`, `INT-001`, `OQ-001` in area and appearance order; writers for `cards/<TYPE>/<ID>.md` with a YAML header, `cards/index.json` and `spec.md` per area with permalinks (P1-16 builder).
- **Delivers**: domain types, schema, parser, id assignment, writers; unit tests on the schema, transitions and ids; snapshot tests of the written files.
- **Done when**: every RF-202, RF-203 and RF-204 scenario and the storage scenario of RF-302 have passing tests; a card without a citation is rejected by the schema (test); rendered citations link to the RF-125 permalink (test).
- **Refs**: RF-125, RF-202, RF-203, RF-204, RF-302, ADR-005, DEC-18.

### P1-33 - Understand as a run: orchestration, citation check and answers file

- **Difficulty**: 9 (opus)
- **Size**: L
- **Depends on**: P1-23, P1-29, P1-31, P1-32
- **Gate**: none
- **Status**: Done
- **Reads**: `docs/architecture.md` sections 6 and 8; `docs/data-model.md` sections 3.6, 3.7, 3.12 and 3.16.
- **Do**: `RunUnderstand`: one reader task per area or only the named areas (unknown names stop with a code listing valid names); configurable parallelism with one abort signal; task states of architecture section 5; partial cards saved on stop; step 1 of the verifier (`src/application/verifier/citation-check.ts`): every citation's file in the code map and its range inside the file, otherwise `CitationInvalid` with the reason; claims never deleted; the cost report at the end (P1-27 writer); `answers.md` generated from `OQ` cards keeping existing answers (DEC-98); run events for every step; route `POST /api/projects/:id/runs` with stage `understand`, area list and consent flag (a cloud run without consent is refused, RF-143). Notes from P1-32 and P1-13: queue card writes per run folder (two `writeOrRestore` calls on one folder can lose an update); pass `assignCardIds` the tasks in area order; pass a `Logger` to the card writers; treat an area with zero cards as suspicious and show it in the run summary and coverage (a stray `[]` in prose parses as zero cards); consume `RunParts.provider` for the test doubles. Notes from P1-27, P1-29, P1-31 and P1-32: build one guard set per run through the provider factory and wire it to the run's stop; refuse an unpriced model at run start (RF-427); write the cost report at every end state, `StoppedByCap` and `CapReached` included; run the prompt-injection fixture through the citation check; assign card ids in area order, show a zero-card area in the run summary and coverage, and treat it as suspicious (require an explicit cards key); serialise card writes per run folder; pass a Logger to the card writers; load and hash the prompts; take the reader limits from the project settings.
- **Delivers**: the use case, citation check, answers writer, route; integration tests with recorded responses: a full run on the C# fixture, an unknown area, a cap reached mid-run, an interrupted run, consent refused; a hash of the snapshot before and after the run.
- **Done when**: every RF-200, RF-240, RF-300 and RF-302 scenario and the RF-143 API scenario have passing tests; RNF-002 and RF-005 tests pass on an understand run; `npm run verify` green.
- **Refs**: RF-005, RF-143, RF-200, RF-240, RF-300, RF-302, RF-426, RNF-002, ADR-005, ADR-006, ADR-007, DEC-15, DEC-19, DEC-98.

### P1-34 - Start run page

- **Difficulty**: 7 (sonnet)
- **Size**: M
- **Depends on**: P1-30, P1-33, P1-41
- **Gate**: G-02
- **Status**: Done
- **Reads**: `docs/design/board/StartRun.dc.html`; `docs/design-system.md` section 14 (queue notice).
- **Do**: `/projects/:id/start`: stage and areas, the estimate (P1-30) with low, likely and high, the cloud notice naming the providers with the consent checkbox (Start disabled until checked when a cloud provider is involved), the editable run cap with its meter, Start; the queued state with position and Cancel; errors next to their fields. When the likely estimate exceeds the cap that remains (run, today or this month), show a warning naming the cap; Start stays available (DEC-108).
- **Delivers**: the page; E2E specs: start a scan and an understand run with the fake provider, consent required, invalid URL error, queued run shown.
- **Done when**: every RF-1001 scenario and the RF-143 page scenario have passing E2E tests; the verifier walks the page at 1280x800 in both schemes and compares it with the artboard.
- **Refs**: RF-143, RF-425, RF-1001, RF-1108, DEC-47, DEC-71.

### P1-35 - Live run page: agents, events, cost meter and claims

- **Difficulty**: 8 (sonnet)
- **Size**: L
- **Depends on**: P1-34
- **Gate**: G-02
- **Status**: Done
- **Reads**: `docs/design/board/LiveRun.dc.html`; `docs/data-model.md` section 3.9.
- **Do**: `/runs/:id`: subscribes to the SSE stream (stored events first); one panel per agent with area, role, model, state, turn count, tool call in progress, files read, cards so far, tokens and cost; the overview (planned, running, done, failed) and the verbose event log; the run meter (tokens and cost per role and total, cap bar, estimate for comparison) and Stop (`POST /api/runs/:runId/stop`, P1-22); the claims list with live status and reason and a link to the cited lines (RF-1004: in P1 a claim that passed the citation check is labelled "awaiting model verification", DEC-103); works after reconnect.
- **Delivers**: the page; E2E specs driven by recorded events: panels update, Stop ends the run, reconnect replays, claims change status.
- **Done when**: every RF-1002, RF-1003, RF-424 and RF-1004 scenario has a passing E2E test; the verifier walks the page at 1280x800 in both schemes.
- **Refs**: RF-424, RF-1002, RF-1003, RF-1004, DEC-46, DEC-51, DEC-71.

### P1-36 - Project totals header and cost page

- **Difficulty**: 7 (sonnet)
- **Size**: M
- **Depends on**: P1-14, P1-18, P1-22, P1-27
- **Gate**: G-02
- **Status**: Done
- **Reads**: `docs/design-system.md` section 14 (totals pill); `docs/design/board/Main.dc.html`.
- **Do**: the totals pill in every signed-in header ("Your total" from the ledger; the administrator also sees "Server, this month" against the cap); live update on usage events during a run; `/projects/:id/cost` with the project totals and the breakdown by run, stage, role, provider and model (local models with zero cost); the 80% server-cap banner for the administrator. Ledger rows with a null `run_id` (provider tests, P1-29) are listed as tests, not dropped and not joined to a run.
- **Delivers**: header component data, cost page, route `GET /api/projects/:id/cost`; integration tests with a fixture ledger; E2E specs for live update and the banner.
- **Done when**: every RF-1010 scenario and the cost-page scenarios of RF-428 and RF-1106 have passing tests.
- **Refs**: RF-428, RF-1010, RF-1106, DEC-49.

### P1-37 - API calls and logs panels

- **Difficulty**: 7 (sonnet)
- **Size**: M
- **Depends on**: P1-35
- **Gate**: G-02
- **Status**: Done
- **Reads**: `docs/design/board/ApiCalls.dc.html`; `docs/data-model.md` sections 3.10 and 3.14.
- **Do**: the "API calls" panel listing calls live from the provider call log with filters (provider, role, agent, status), errors and retries highlighted, link to the masked transcript, "Next error"; summary per provider and role (calls, errors, P50 and P95 latency and time to first token, tokens per second for Ollama); the security-event counter filtering the log; the "Logs" panel streaming the user's own run log entries with a level filter.
- **Delivers**: the panels and their routes; integration tests for percentiles and scoping; E2E specs with recorded events.
- **Done when**: every RF-1011 scenario has a passing test; a user sees only their own runs' log entries (matrix).
- **Refs**: RF-408, RF-1011, DEC-50, DEC-51, DEC-57.

### P1-38 - Live coverage map

- **Difficulty**: 6 (sonnet)
- **Size**: S
- **Depends on**: P1-35
- **Gate**: G-02
- **Status**: Done
- **Reads**: `docs/design/board/LiveRun.dc.html` (coverage section).
- **Do**: a tree of the analysed files by area filling in from `read_file` events with the read share per area.
- **Delivers**: the component; an E2E spec with recorded events.
- **Done when**: the RF-1005 scenario has a passing E2E test.
- **Refs**: RF-1005, DEC-51.

### P1-39 - Answer open questions in the page

- **Difficulty**: 6 (sonnet)
- **Size**: S
- **Depends on**: P1-35
- **Gate**: G-02
- **Status**: Done
- **Reads**: `docs/data-model.md` section 3.16; `docs/architecture.md` section 6 (`RecordAnswers`).
- **Do**: `RecordAnswers` use case and `PUT /api/runs/:id/answers` updating `answers.md` (other answers kept); the answers list on the run page.
- **Delivers**: use case, route, component; integration and E2E tests.
- **Done when**: the RF-1007 scenario has passing tests (marking answered on re-run is RF-241, P2-05).
- **Refs**: RF-240, RF-1007, DEC-15, DEC-51.

### P1-40 - History and deletion

- **Difficulty**: 7 (sonnet)
- **Size**: M
- **Depends on**: P1-33, P1-36, P1-56
- **Gate**: G-02
- **Status**: Done
- **Reads**: `docs/design/board/History.dc.html`; `docs/data-model.md` sections 2 and 9.
- **Do**: `/projects/:id/history` listing runs with source, commit, stage, state, cost and links (report, zip from P1-56); `DeleteRun` and `DeleteProject` with a confirmation naming the folder and the space freed, disabled while running, an `info` log entry, ledger untouched; `DeleteSnapshot` and the `/admin/snapshots` page for the administrator (snapshots with size and last use, following the History artboard's table), delete disabled while a run uses it.
- **Delivers**: page, use cases, routes; integration tests for the ledger kept after deletion; E2E specs.
- **Done when**: Every RF-1008 and RF-1012 scenario has a passing test.
- **Refs**: RF-1008, RF-1012, ADR-009, DEC-51, DEC-55.

### P1-41 - Projects and project settings pages

- **Difficulty**: 6 (sonnet)
- **Size**: M
- **Depends on**: P1-14, P1-18, P1-22
- **Gate**: G-02
- **Status**: Done
- **Reads**: `docs/design/board/Projects.dc.html`.
- **Do**: `/projects` (the user's projects with last run and totals, New project form with the URL error next to the field, queue notice); `/projects/:id/settings` (models per role, caps, ignore rules, price overrides) with field errors from the API.
- **Delivers**: two pages; E2E specs: create a project from a fake GitHub URL, duplicate opens the existing one, invalid URL error, save settings with an error.
- **Done when**: the RF-010 E2E scenarios pass; the verifier walks both pages at 1280x800 in both schemes.
- **Refs**: RF-002, RF-010, RF-1108, DEC-70.

### P1-42 - Administration pages

- **Difficulty**: 6 (sonnet)
- **Size**: M
- **Depends on**: P1-10, P1-14, P1-18, P1-27
- **Gate**: G-02
- **Status**: Done
- **Reads**: `docs/design/board/AdminUsers.dc.html`, `AdminAudit.dc.html`.
- **Do**: `/admin/users` (accounts with role, state, last sign-in, month-to-date cost; create, disable, enable, reset; open a workspace; caps form; server-month meter and the 80% banner); `/admin/audit` (filter by user and action, last 30 days); the default models per role for new projects (`defaultRoles`, DEC-106).
- **Delivers**: three pages; E2E specs: create a user who must change the password, disable ends the session, caps saved, audit filter.
- **Done when**: the RF-1102 page scenario and the RF-1109 view scenario have passing E2E tests; a `user` reaching `/admin/*` sees 403 (spec).
- **Refs**: RF-1102, RF-1105, RF-1106, RF-1107, RF-1109, DEC-70, DEC-106.

### P1-43 - Markdown report, run replay page and safe rendering

- **Difficulty**: 7 (sonnet)
- **Size**: M
- **Depends on**: P1-33
- **Gate**: none
- **Status**: Done
- **Reads**: `docs/data-model.md` section 3.17; `docs/adr/ADR-013-untrusted-code-and-model-output.md`; `docs/design/board/Report.dc.html`.
- **Do**: `BuildReport` with `--format md` semantics: `report.md` linking the specification, every card, coverage and the cost report; a static "Run replay" page from `events.jsonl` (timeline of agents, turns, tool calls, cards, verdicts and cost, with play, pause and step; a static list without JavaScript) carrying the meta CSP and `referrer` of RF-1013; repository and model text rendered as text with the link rule of RF-507; a fixture card with `<script>`, `onerror` and `javascript:`. `ReadRunFile` with `GET /runs/:runId/files/*` (owner-scoped, served as text or attachment with the RF-1013 CSP); the report is also written as static HTML with every repository and model text escaped, so `site/` never relies on a Markdown renderer (DEC-112).
- **Delivers**: the use case, the Markdown writer, the replay page, the fixture; snapshot tests; an E2E spec opening the replay of a recorded run with JavaScript on and off and asserting nothing from the fixture runs.
- **Done when**: every RF-504, RF-506 and RF-507 scenario and the static-report scenario of RF-1013 have passing tests; axe passes on the replay page.
- **Refs**: RF-504, RF-506, RF-507, RF-1013, ADR-005, ADR-013, DEC-04, DEC-46.

### P1-44 - Container image

- **Difficulty**: 7 (sonnet)
- **Size**: M
- **Depends on**: P1-02, P1-07, P1-12, P1-18, P1-27, P1-31
- **Gate**: none
- **Status**: Done
- **Reads**: `docs/adr/ADR-014-container-image-local-and-hosted.md`; `docs/environments-and-delivery.md` sections 2 and 8.1.
- **Do**: multi-stage `Dockerfile` from `node:24-slim` pinned by digest: build stage (`npm ci`, `npm run build`), runtime stage with production dependencies, built server and front end, `db/migrations/`, `prompts/`, `prices/`, `templates/`, non-root user, port 8080, `HEALTHCHECK` on `/healthz`; `.dockerignore` excluding `.env*`, tests, source maps of server code and build tools; a CI job building the image and running Trivy (high and critical with a fix fail); an integration test starting the container and calling `/healthz` (Linux CI only). A separate `test` stage adds the fake provider and fake GitHub for `compose.ci.yaml`; the production stage contains no fakes.
- **Delivers**: `Dockerfile`, `.dockerignore`, the CI job, the test.
- **Done when**: every RF-1300 scenario passes in CI; `docker run --rm --entrypoint id <image>` prints a non-zero uid (verifier); `docker history` and a file listing show no `.env`, test or `.map` file; the server starts in the image with the price table loaded and `prices/`, `prompts/`, `templates/` and `common-passwords.txt` shipped.
- **Refs**: RF-1300, RNF-001, RNF-003, ADR-014, DEC-61.

### P1-45 - Docker Compose, local runbook and smoke test

- **Difficulty**: 6 (sonnet)
- **Size**: M
- **Depends on**: P1-14, P1-15, P1-23, P1-44
- **Gate**: none
- **Status**: Done
- **Reads**: `docs/environments-and-delivery.md` sections 2, 6, 9 and 14; `docs/adr/ADR-016-postgresql-and-files.md`.
- **Do**: `compose.yaml` (adds the `app` service to the `db` service of P1-06, volumes `pgdata` and `rosetta-data`, app on `127.0.0.1:8080` only, `extra_hosts: host.docker.internal:host-gateway`, health checks, restart policy); `compose.ci.yaml` (fake provider, test seed); the CI Compose smoke job (up, wait for `/healthz`, Playwright smoke: landing, sign-in, a fake-provider scan, `down -v`); `docs/runbooks/local.md` (`.env`, up, first sign-in, Ollama on the host, reset); the README quick start section. `db/init/roles.sh` creating `rosetta_app` and `rosetta_migrator` from passwords in `.env`; `compose.ci.yaml` runs the image's `test` stage with a fake GitHub sidecar. Add `host.docker.internal:host-gateway` so the documented Ollama URL resolves on Linux (P1-28).
- **Delivers**: the two Compose files, the CI job, the runbook, the README section.
- **Done when**: the CI smoke job is green; `docker compose config` shows the port bound to `127.0.0.1` (verifier); data survives `down` and `up` (test in the smoke job with a project created before the restart). The RF-1301 Ollama scenario is checked on the owner's machine (`ROSETTA_OLLAMA_URL` reaches the host's Ollama) and recorded as an owner check. The image ships `src/infrastructure/security/common-passwords.txt` (without it start-up fails with RST-2501).
- **Refs**: RF-801, RF-1009, RF-1301, RNF-011, RNF-014, ADR-014, ADR-016, DEC-61.

### P1-46 - Milestone end-to-end journeys

- **Difficulty**: 6 (sonnet)
- **Size**: M
- **Depends on**: P1-15, P1-35, P1-56, P1-42, P1-43, P1-97
- **Gate**: none
- **Status**: Done
- **Reads**: `docs/process-flows.md` flows 1, 2, 4 and 5; `docs/architecture.md` section 17.
- **Do**: journeys on the harness with the fake provider and fixture repositories: visitor to landing to sign-in; first sign-in password change; create project, scan, understand one area, watch the live page, read the Markdown report and the replay, download the zip; the administrator creates a user and sets caps, a run stops at the cap and the totals still show it; a repository in a language without a pack completes scan, understand and report (RF-112); two users cannot see each other's projects.
- **Delivers**: the journey specs under `tests/e2e/journeys/`; the pyramid line for the phase.
- **Done when**: every journey passes headless from a clean database in CI; the RF-112 end-to-end scenario passes; the pyramid report is pasted in the pull request.
- **Refs**: RF-112, RF-1001, RF-1002, RF-1105, RF-1106, RNF-005, ADR-008, ADR-010.

### P1-47 - Local reader model spike

- **Difficulty**: 6 (sonnet)
- **Size**: M
- **Depends on**: P1-25, P1-33
- **Gate**: none
- **Status**: Todo
- **Reads**: `docs/spec/requirements.md` Q-04 and Q-10; `docs/providers.md`.
- **Do**: a scoring script `eval/spike/score-reader.ts` (`npm run spike:reader`) that runs one demo area with each candidate 7-9B tool-calling model through Ollama under the local deployment and scores valid cards, valid citations, tool-call errors and time; a candidate list of at most four models that fit 8 GB of VRAM; the owner runs it on their machine; the result table and the recommended model in `docs/providers.md`.
- **Delivers**: the script, the documented results, the recommended model as the default `reader` model for Ollama in `templates/project-settings.json`.
- **Done when**: the script runs against the fake provider in a test; the results table is in `docs/providers.md` with the date and the owner's run; Q-04 can be answered by the owner from it (the answer itself is a DEC row the owner records). The owner's run also checks RNF-011: with the snapshot cached and the network to GitHub and cloud providers off, a scan and an understand run complete with Ollama only.
- **Refs**: Q-04, Q-10, RF-401, RNF-011, DEC-23, DEC-53.

### P1-48 - Host choice

- **Difficulty**: 6 (sonnet)
- **Size**: S
- **Depends on**: P1-45
- **Gate**: none
- **Status**: Done
- **Reads**: `docs/environments-and-delivery.md` sections 2, 3, 8, 10-12 and 14; `docs/adr/ADR-014-container-image-local-and-hosted.md`.
- **Do**: compare the Q-18 candidates against the requirements of environments section 2 (container from GHCR, persistent disk, managed PostgreSQL, secret store, HTTPS, health checks, under 25 USD a month, at least 1 GiB of memory for scrypt) and write a Proposed ADR (next free id) recommending one host with region and monthly cost; the pull request is `needs-owner` (it adds an ADR); after the merge the owner creates the host account and stores the secrets, which opens G-07 (DEC-104).
- **Delivers**: the host ADR and its row in the ADR index.
- **Done when**: The ADR compares at least four candidates on every requirement with sources and dates; the owner merges it.
- **Refs**: Q-18, ADR-014, DEC-61, DEC-104.

### P1-49 - Security review and the milestone verification matrix

- **Difficulty**: 10 (opus)
- **Size**: M
- **Depends on**: P1-46
- **Gate**: G-08 (DEC-133)
- **Status**: Done
- **Reads**: `docs/security/threat-model.md`; `SECURITY.md`; `docs/roadmap.md` (P1 exit criteria); `docs/architecture.md` section 10.
- **Do**: `docs/verification/m1-matrix.md`: every P1 Must and Should requirement with its passing test or recorded manual check, gaps listed; a review of every threat-model row against the code with findings ranked BLOCKING, MAJOR, MINOR; RNF-014 defaults checked on a Compose stack started from `.env.example`; an output scan of a full demo run folder and the logs for key patterns (RNF-003); licence review of fixtures (RNF-009); gaps and MAJOR findings are listed with a proposed card each; the orchestrator files them as follow-up cards (README section 9).
- **Delivers**: the matrix with the security review and the list of gaps.
- **Done when**: the matrix lists no Must without evidence, or each gap has a follow-up card; no BLOCKING finding is open; the pyramid line for P1 is recorded.
- **Refs**: RNF-003, RNF-009, RNF-014, ADR-013, DEC-57, DEC-69.

### P1-50 - Sample report on GitHub Pages

- **Difficulty**: 5 (haiku)
- **Size**: S
- **Depends on**: P1-02, P1-43
- **Gate**: G-08 (DEC-133)
- **Status**: In review (owner check: enable GitHub Pages and open the published sample, #361 merged)
- **Reads**: `docs/environments-and-delivery.md` sections 2 and 8.
- **Do**: a Pages workflow publishing `site/` from `main` with the smoke step that fetches the index and fails when the run id is missing; `site/` holding the escaped HTML report and the replay of the owner's demo run on the hosted URL (DEC-105), with a `.nojekyll` file, copied by the orchestrator after an output scan for secrets into a `needs-owner` pull request; the README link.
- **Delivers**: `.github/workflows/pages.yml`, `site/`, the README link.
- **Done when**: the RF-800 scenario is checked on the public URL; the smoke step fails on a missing run id (test with a fixture). The public URL check is an owner check after the owner merges the `site/` pull request.
- **Refs**: RF-800, RF-501, RNF-003, DEC-04.

### P1-51 - Documentation consistency tests

- **Difficulty**: 4 (haiku)
- **Size**: S
- **Depends on**: P1-01
- **Gate**: none
- **Status**: Done
- **Reads**: `docs/adr/README.md` (Totals); this file's Totals table; README section 11.
- **Do**: unit tests under `tests/unit/docs/` that parse the ADR index Totals and every ADR's Status line, and the card counts by phase, difficulty band and size of this file, and fail on any drift; a test that every card's _Depends on_ names an existing card.
- **Delivers**: the tests.
- **Done when**: the tests pass on `main`; changing one count in a disposable worktree makes them fail (verifier).
- **Refs**: RNF-005, ADR-001, ADR-010.

### P1-52 - Release v0.1.0 and the quick start

- **Difficulty**: 4 (haiku)
- **Size**: S
- **Depends on**: P1-49, P1-50
- **Gate**: none
- **Status**: Done
- **Reads**: `docs/environments-and-delivery.md` section 8; `README.md`.
- **Do**: `docs/releases.md` with the v0.1.0 notes; the README status, quick start (checked against `docs/runbooks/local.md`) and links (hosted URL, sample report, slides, video placeholders); the version bump; a walk-through of the quick start on a clean folder recorded in the pull request; the tag is created by the owner.
- **Delivers**: `docs/releases.md`, README updates, the version bump.
- **Done when**: the RF-801 scenario is walked on a clean clone and recorded; `npm run verify` green.
- **Refs**: RF-801, DEC-29.

### P1-53 - Slides and video script

- **Difficulty**: 4 (haiku)
- **Size**: S
- **Depends on**: P1-46
- **Gate**: none
- **Status**: In review (owner check: record the video, publish slides and video, fill the URLs, #362 merged)
- **Reads**: `docs/rfc/RFC-001-rosetta.md` sections 1-4; `docs/process-flows.md`; Q-02 and Q-03.
- **Do**: slides in Spanish (Q-03) presenting the problem, the pipeline, the live agents, evidence and the verifier, cost control, security, the build method and the results; a video script of about 5 minutes (Q-02) with the explainer and a clip of a real run; the owner records the video; both URLs added to the README.
- **Delivers**: `docs/hand-in/slides/` source, `docs/hand-in/video-script.md`, README links.
- **Done when**: the RF-802 scenario is checked by the owner (both URLs open).
- **Refs**: RF-802, Q-02, Q-03, DEC-04.

### P1-54 - Milestone hand-in

- **Difficulty**: 3 (haiku)
- **Size**: S
- **Depends on**: P1-52, P1-53
- **Gate**: G-06
- **Status**: Blocked (G-06)
- **Reads**: RF-803; `docs/runbooks/deploy.md`.
- **Do**: `docs/hand-in/m1.md`: the hosted URL, the teacher account's user name (the password is given only in the hand-in form), the sample report URL as a fallback, the slides and video URLs, the repository URL; a checklist the owner ticks the day before the hand-in; the owner submits (G-05).
- **Delivers**: `docs/hand-in/m1.md`.
- **Done when**: the RF-803 manual sign-in the day before the hand-in is recorded by the owner; no password appears in the file (grep).
- **Refs**: RF-803, RF-1107, DEC-67.

### P1-55 - Hosted deployment and the teacher account

- **Difficulty**: 9 (opus)
- **Size**: M
- **Depends on**: P1-45, P1-48
- **Gate**: G-07, G-08 (DEC-133)
- **Status**: Blocked (G-07)
- **Reads**: `docs/environments-and-delivery.md` sections 2, 3, 8, 10-12 and 14; the host ADR of P1-48; `docs/security/threat-model.md` section 5.
- **Do**: the release workflow `.github/workflows/release.yml` (image to GHCR as `X.Y.Z` and `sha-<short>`, CycloneDX SBOM on releases); deploy the `sha-<short>` image of `main` to the chosen host (DEC-104) with managed PostgreSQL, the persistent disk at `ROSETTA_DATA_DIR`, every secret in the host's store, `ROSETTA_TRUST_PROXY=1`, HTTPS with HTTP redirected; the OWASP ZAP baseline scan against the Compose stack before the deploy; the smoke script (health, landing, sign-in, a cheap scan); measure RNF-017 once; `docs/runbooks/deploy.md` (deploy, rollback, backup, restore, roles in the host's console, teacher account); the owner creates the `teacher` account without a forced password change (RF-1107) and sets `defaultRoles` (DEC-106); redeploy as later P1 cards merge.
- **Delivers**: the release workflow, the smoke script, the runbook, the ZAP report summary, the hosted URL recorded in `handoff.md`.
- **Done when**: every RF-1304 scenario is checked on the hosted URL and recorded in the runbook; `/healthz` answers 200 over HTTPS and HTTP redirects to HTTPS (verifier with `curl`); the ZAP baseline has no high finding; owner checks: the teacher account signs in, sees an empty workspace and runs the demo scan and understand on one area with the server keys under the caps (RF-1107); hosted by 2026-10-20 (DEC-89).
- **Refs**: RF-1107, RF-1304, RNF-016, RNF-017, Q-18, Q-21, ADR-014, DEC-61, DEC-67, DEC-89, DEC-104, DEC-106.

### P1-56 - Zip export

- **Difficulty**: 6 (sonnet)
- **Size**: S
- **Depends on**: P1-17, P1-22
- **Gate**: none
- **Status**: Done
- **Reads**: `docs/data-model.md` section 2; `docs/architecture.md` section 6 (`ExportZip`).
- **Do**: `ArchiveWriter` port and `YazlArchiveWriter`; `ExportZip`: the full run folder, or only `handoff/`, streamed, refused with 409 while the run is in progress; routes `GET /api/runs/:runId/zip` and `GET /api/runs/:runId/handoff.zip` (owner-scoped); the Download zip button on the run page.
- **Delivers**: the port, adapter, use case, routes and button; integration tests that unzip and compare the tree with the run folder; an access-matrix row.
- **Done when**: every RF-008 scenario has a passing test; another user's run id answers 404 (matrix).
- **Refs**: RF-008, RF-1105, ADR-009, DEC-24.

### P1-57 - Follow-up: format the documentation with Prettier

- **Difficulty**: 2 (haiku)
- **Size**: S
- **Depends on**: P1-01
- **Gate**: none
- **Status**: Todo
- **Reads**: `.prettierignore`; `docs/conventions.md` section 8.
- **Do**: run Prettier on every Markdown, `.github/` and `.claude/` file and narrow `.prettierignore` to nothing but generated files, so the format gate covers documentation (conventions section 8); the pull request is `needs-owner` because it reformats protected documents.
- **Delivers**: the formatted files and the narrowed `.prettierignore`.
- **Done when**: `npm run format:check` passes with `.prettierignore` holding no documentation path; the diff is whitespace and quoting only.
- **Refs**: RNF-005, ADR-011, P1-01 (verifier MINOR 3).

### P1-58 - Follow-up: block outbound network in unit and integration tests

- **Difficulty**: 5 (haiku)
- **Size**: S
- **Depends on**: P1-01
- **Gate**: none
- **Status**: Done
- **Reads**: `docs/conventions.md` section 7; ADR-008.
- **Do**: a Vitest setup file for the `unit` and `integration` projects that refuses every non-loopback connection (net, tls, http, https, fetch) with a clear error, and a test that proves a call to a public address fails while a loopback server still answers.
- **Delivers**: the setup file and its test.
- **Done when**: a test calling a public host fails with the setup error; `npm run verify` green.
- **Refs**: RNF-005, ADR-008, P1-01 (verifier MINOR 7).

### P1-59 - Follow-up: cruise web/ in the architecture check

- **Difficulty**: 3 (haiku)
- **Size**: S
- **Depends on**: P1-12
- **Gate**: none
- **Status**: Done
- **Reads**: `docs/conventions.md` section 10; `.dependency-cruiser.cjs`.
- **Do**: add `web` to the `arch` script so the `web-imports-contracts-only` rule (DEC-112) runs, with a fixture test that a `web/` file importing `src/infrastructure/` is reported.
- **Delivers**: the script change and the test.
- **Done when**: the fixture test fails without the change; `npm run verify` green.
- **Refs**: RNF-013, DEC-112, P1-01 (verifier MINOR 6).

### P1-60 - Follow-up: lefthook install test hygiene

- **Difficulty**: 2 (haiku)
- **Size**: S
- **Depends on**: P1-01
- **Gate**: none
- **Status**: Done
- **Reads**: `lefthook.yml`; `tests/integration/tooling/lefthook-install.test.ts`.
- **Do**: run the test's `git init` with the cleaned environment (no `GIT_*`) as the postinstall call already does, and reword the `lefthook.yml` comment to "a plain `npm ci` also installs them through lefthook's postinstall".
- **Delivers**: the two edits.
- **Done when**: the test passes with `GIT_DIR` set in the environment and touches no other repository; `npm run verify` green.
- **Refs**: RNF-005, ADR-011, P1-01 (fix verifier MINORs 1 and 2).

### P1-61 - Follow-up: count contract tests and it.each rows in the level report

- **Difficulty**: 4 (haiku)
- **Size**: S
- **Depends on**: P1-01
- **Gate**: none
- **Status**: Done
- **Reads**: `scripts/test-levels.mjs`; `docs/conventions.md` section 7.
- **Do**: make `npm run test:levels` count the tests that actually run, including suites in `tests/contracts/` (by the level of the file that runs them) and each `it.each` row, preferably from the Vitest JSON reporter rather than a static scan.
- **Delivers**: the script change and its tests.
- **Done when**: the printed counts equal the executed test counts of a `vitest run --reporter=json`; `npm run verify` green.
- **Refs**: RNF-005, DEC-30, P1-03 (verifier note).

### P1-62 - Follow-up: more secret shapes and key-name masking

- **Difficulty**: 9 (opus)
- **Size**: M
- **Depends on**: P1-04
- **Gate**: none
- **Status**: Done
- **Reads**: `docs/data-model.md` sections 3.6 and 3.14; `docs/security/threat-model.md`.
- **Do**: extend `SecretMasker` to `Authorization: Basic` and `token` schemes, AWS `ASIA` keys, XML `<password>` elements, `mysql -p<pw>` and `sk-` after an underscore; in the log formatter, mask the whole value of any data key that matches `password|passwd|pwd|secret|token|api[_-]?key`; keep linear time (extend the hostile-input suite); lift or document the 512-character bound on connection-string values (P1-04 scope); mask Stripe-style keys such as `api_key = "sk_live_..."` (P1-32 verifier).
- **Delivers**: the masker and formatter changes with fixture cases and hostile-input cases.
- **Done when**: every new shape is masked in a fixture test; a fake key under a `password` data key never appears in any logger output; the hostile-input suite stays within budget; `npm run verify` green.
- **Refs**: RF-009, RF-141, RNF-003, ADR-013, P1-04 (verifier MINOR 5 and open question).

### P1-63 - Follow-up: automatic Ollama context size

- **Difficulty**: 8 (sonnet)
- **Size**: M
- **Depends on**: P1-25
- **Gate**: none
- **Status**: Done
- **Reads**: `docs/spec/requirements.md` RF-401 and Q-23; `docs/data-model.md` section 3.1; `docs/providers.md` section 2; DEC-114.
- **Do**: add `providers.<name>.contextTokens` (`auto` or an int of at least 1 024, `ollama` only) to the settings schema; in the Ollama adapter, resolve `auto` once per server and model digest: start at the smaller of the model's trained context (`/api/show`) and the ceiling, load with a minimal call, read `/api/ps`, and halve while `size_vram` is below `size`, down to the floor (Q-23 defaults); send the result as `num_ctx`; for a fixed number, send it unchanged and log a warning when Ollama reports CPU offload; record the chosen value and how it was chosen in the provider call log and the run manifest.
- **Delivers**: the setting, the resolver with its cache, fake-Ollama recordings for fits, spills and model limits, and `docs/providers.md` section 2 updated.
- **Done when**: with the fake Ollama reporting partial GPU memory at 32 768 and full at 16 384, `auto` sends 16 384 and records it; a model whose trained context is 8 192 never gets more; a fixed value is sent unchanged with one warning on spill; the resolver runs once per model; `npm run verify` green.
- **Refs**: RF-401, RNF-004, ADR-003, DEC-114, Q-23.

### P1-64 - Follow-up: Windows pipe traversal and a test cast in the network guard

- **Difficulty**: 4 (haiku)
- **Size**: S
- **Depends on**: P1-58
- **Gate**: none
- **Status**: Done
- **Reads**: `tests/support/network-policy.ts`; `tests/integration/tooling/network-block.test.ts`.
- **Do**: refuse a pipe path with a `.` or `..` segment after the `\\.\`, `\\?\` or `\??\` prefix (after normalisation it can reach a remote pipe) and add the form to the remote-pipe cases; replace the double cast on the numeric-string port test with `Reflect.apply`.
- **Delivers**: the policy change and its tests.
- **Done when**: `\\.\pipe\..\UNC\<server>\pipe\x` is refused with the RNF-005 error; no `as` cast remains; `npm run verify` green.
- **Refs**: RNF-005, ADR-008, P1-58 (verifier MINORs, round 3).

### P1-65 - Follow-up: keyed array secrets and a torn last line in the call log

- **Difficulty**: 6 (sonnet)
- **Size**: S
- **Depends on**: P1-24
- **Gate**: none
- **Status**: Done
- **Reads**: `src/infrastructure/providers/provider-call-lines.ts`; `jsonl-provider-call-log.ts`; `docs/data-model.md` 3.10 and 3.15.
- **Do**: mask each primitive item of an array held by a secret-named key together with that key; when a JSONL log file ends without a newline (a crash mid-append), start the next record on a new line and count the partial line, so `seq` has no repeat.
- **Delivers**: the two fixes with fixture cases.
- **Done when**: a password key holding an array never appears in clear in any log; a file ending in a partial line gets a valid next line with the next `seq`; `npm run verify` green.
- **Refs**: RNF-003, RF-006, RF-408, P1-24 (verifier MINORs, round 2).

### P1-66 - Follow-up: Ollama adapter hardening

- **Difficulty**: 6 (sonnet)
- **Size**: S
- **Depends on**: P1-25
- **Gate**: none
- **Status**: Done
- **Reads**: `src/infrastructure/providers/ollama/`; `src/infrastructure/config/environment.ts`; `docs/providers.md` section 2.
- **Do**: strip thinking in linear time and also for an orphan closing tag, any letter case and `<thinking>`; refuse userinfo in `ROSETTA_OLLAMA_URL` at parse time; let the fake Ollama server register its port so the test-mode check trusts that port, not the caller flag; make the text-tool-protocol loader return `{ version, sha256, text }` for the manifest.
- **Delivers**: the changes with tests.
- **Done when**: a 300 KB unclosed `<think>` is stripped in under 50 ms; an orphan `</think>`, `<THINK>` and `<thinking>` never reach the answer; a URL with userinfo is refused with RST-1000; `npm run verify` green.
- **Refs**: RF-205, RF-401, RNF-004, ADR-013, P1-25 (verifier MINORs 1, 2, 4, 7, 8).

### P1-67 - Follow-up: size caps on reads and grep

- **Difficulty**: 6 (sonnet)
- **Size**: S
- **Depends on**: P1-17
- **Gate**: none
- **Status**: Done
- **Reads**: `src/infrastructure/files/`; `docs/conventions.md` size limits; RF-144, RF-146.
- **Do**: add a per-file byte cap to readLines and grep (files above `scan.maxFileBytes` refused with a reason) and a match cap on grep results with a truncation notice; keep the worker contract.
- **Delivers**: the caps and their tests.
- **Done when**: a 10 MB line is not returned whole; a pattern matching every line returns at most the cap with a notice; `npm run verify` green.
- **Refs**: RF-144, RF-146, P1-17 (verifier MINOR 5, all rounds).

### P1-68 - Follow-up: bounded shutdown when the database hangs

- **Difficulty**: 5 (haiku)
- **Size**: S
- **Depends on**: P1-07
- **Gate**: none
- **Status**: Done
- **Reads**: `src/presentation/composition-root.ts`; ADR-014.
- **Do**: bound `stop()` with a deadline: race `pool.end()` against a few seconds, then resolve so the process exits; unit test with a pool whose `end()` never settles under fake timers.
- **Delivers**: the deadline and its test.
- **Done when**: SIGTERM exits within the deadline with a frozen database; `npm run verify` green.
- **Refs**: RF-1302, ADR-014, P1-07 (verifier MINOR, round 3).

### P1-69 - Follow-up: Ollama context probe fallback and timeouts

- **Difficulty**: 6 (sonnet)
- **Size**: S
- **Depends on**: P1-63
- **Gate**: none
- **Status**: Done
- **Reads**: `src/infrastructure/providers/ollama/ollama-context-*.ts`; `docs/providers.md` 2.2; `docs/data-model.md` 3.10.
- **Do**: on a probe failure part-way through halving, send the last size known to fit (or the floor) instead of the start value and make the docs say what is sent; give probes a short timeout and a short back-off after a fallback; race the fixed-size spill check against the request signal; add tests for `num_ctx` on retried attempts, a malformed `/api/show` through the provider and an abort of one of two sharing callers; add a cache reset for test harnesses.
- **Delivers**: the changes with tests.
- **Done when**: a failure after 32 768 spilled never sends 32 768; a hanging `/api/show` costs at most the probe timeout; `npm run verify` green.
- **Refs**: RF-401, DEC-114, Q-23, P1-63 (verifier MINORs 1-4).

### P1-70 - Follow-up: reject non-Latin-1 characters in an OpenAI key

- **Difficulty**: 3 (haiku)
- **Size**: S
- **Depends on**: P1-26
- **Gate**: none
- **Status**: Done
- **Reads**: `src/infrastructure/providers/openai/openai-provider.ts`.
- **Do**: refuse a key holding any character above U+00FF at construction with RST-1511, so a deterministic SDK failure is not retried.
- **Delivers**: the check and its test.
- **Done when**: a key with a zero-width space or an emoji is refused at construction and the key never appears in the error; `npm run verify` green.
- **Refs**: RNF-003, RF-402, P1-26 (verifier MINOR, round 2).

### P1-71 - Follow-up: wire the Ollama context setting and record it in the manifest

- **Difficulty**: 4 (haiku)
- **Size**: S
- **Depends on**: P1-18, P1-22, P1-63
- **Gate**: none
- **Status**: Done
- **Reads**: `docs/data-model.md` 3.1 (`contextTokens`); RF-401; DEC-114.
- **Do**: validate `providers.<name>.contextTokens` (`auto` or an int of at least 1 024, `ollama` kind only) in the settings schema, pass it to the Ollama adapter, and record the chosen `contextTokens` and `contextSource` per model in the run manifest.
- **Delivers**: the schema field, the wiring and the manifest entry with tests.
- **Done when**: a project with `contextTokens: 8192` sends 8 192; `contextTokens` on an `openai` provider is refused; the manifest lists the value per model; `npm run verify` green.
- **Refs**: RF-401, RNF-004, DEC-114, P1-63 (verifier MINOR 5).

### P1-72 - Follow-up: stop a run before any work when Ollama is not ready

- **Difficulty**: 5 (haiku)
- **Size**: S
- **Depends on**: P1-29
- **Gate**: none
- **Status**: Done
- **Reads**: RF-401 scenario 2; `docs/providers.md` section 2.
- **Do**: at run start make one tiny call through the guards to every Ollama provider the run uses, so a stopped server or a missing model ends the run before any agent starts, with RST-1507 or RST-1508 and the fix command.
- **Delivers**: the start check and its tests.
- **Done when**: with the fake server down, a run ends before its first agent task with RST-1507; `npm run verify` green.
- **Refs**: RF-401, P1-25 (verifier MINOR 5).

### P1-73 - Follow-up: discard partial snapshot folders at start-up

- **Difficulty**: 4 (haiku)
- **Size**: S
- **Depends on**: P1-07, P1-16
- **Gate**: none
- **Status**: Done
- **Reads**: `src/presentation/composition-root.ts`; RF-122; `docs/architecture.md` section 4.
- **Do**: call `discardPartialFolders()` of the snapshot store in the start-up sequence, before the server accepts runs.
- **Delivers**: the start-up step and its test.
- **Done when**: a `.partial-*` folder left in `sources/` is gone after `start()`; `npm run verify` green.
- **Refs**: RF-122, ADR-019, P1-16 (verifier note).

### P1-74 - Follow-up: private-key lines inside a SQL statement reach the code map

- **Difficulty**: 6 (sonnet)
- **Size**: S
- **Depends on**: P1-19
- **Gate**: none
- **Status**: Done
- **Reads**: `src/infrastructure/scan/universal/sql-script.ts`; `docs/data-model.md` (code map); RNF-003.
- **Do**: write a failing test first: a SQL statement holding a `-----BEGIN PRIVATE KEY-----` block whose marker lines look like comments; then keep comment-like lines inside an open statement, or mask the raw lines before comments are dropped, so the key body is masked or left out.
- **Delivers**: the fix and its fixture test.
- **Done when**: no base64 key body from the fixture appears in `codemap.json` or the scan summary; `npm run verify` green. Must land before P1-23 sends code map text to a provider.
- **Refs**: RNF-003, RF-009, RF-104, P1-20 (verifier MINOR 1, round 3).

### P1-75 - Follow-up: a scan-wide parse budget for language packs

- **Difficulty**: 6 (sonnet)
- **Size**: S
- **Depends on**: P1-21
- **Gate**: none
- **Status**: Done
- **Reads**: `src/infrastructure/scan/packs/`; `src/infrastructure/scan/codemap/`.
- **Do**: bound the total tree-sitter parse time of a scan (a scan-wide budget, or parsing in a worker that can be stopped); files past the budget are recorded as not analysed with a reason instead of blocking the event loop.
- **Delivers**: the budget and its tests.
- **Done when**: a fixture repository whose parse time exceeds a small test budget finishes with the remaining files recorded as not analysed; `npm run verify` green.
- **Refs**: RF-110, RNF-004, P1-21 (verifier note).

### P1-76 - Follow-up: an unterminated key marker hides later SQL statements

- **Difficulty**: 5 (haiku)
- **Size**: S
- **Depends on**: P1-74
- **Gate**: none
- **Status**: Done
- **Reads**: `src/infrastructure/scan/universal/sql-script.ts`; `src/infrastructure/guards/`.
- **Do**: a `-----BEGIN ... PRIVATE KEY-----` marker with no END (for example a comment that only mentions it) masks to the end of the file, so every later statement silently leaves the code map; bound the masked span or record a notice in the scan summary that statements were hidden by masking; use the injected `SecretMasker` instead of the module-level one.
- **Delivers**: the change and its tests.
- **Done when**: a file with an unterminated marker in a comment followed by three statements keeps the statements or records the notice, and no key body leaks in either case; `npm run verify` green.
- **Refs**: RNF-003, RF-104, P1-74 (verifier MINORs 1 and 2, round 2).

### P1-77 - Follow-up: accounts and audit log hardening

- **Difficulty**: 7 (sonnet)
- **Size**: S
- **Depends on**: P1-08
- **Gate**: none
- **Status**: Done
- **Reads**: `src/infrastructure/security/scrypt-password-hasher.ts`; `src/infrastructure/db/pg-audit-log.ts`, `audit-rows.ts`, `pg-user-repository.ts`; `tests/contracts/`.
- **Do**: bound the parameters of a stored hash (N, r, p, key and salt lengths) and map every parse or scrypt failure, including `RangeError`, to RST-2209; keep the password hash out of any error cause from the user repository; strip or escape NUL in audit `detail`, `ip` and `action` before the insert; widen audit detail masking to keys `secret`, `pass`, `pw`, `value` and free text such as "password is"; make the audit filter with an invalid user id behave the same in both adapters (contract case); add a concurrent bootstrap test on PostgreSQL that fails without the advisory lock.
- **Delivers**: the changes with tests.
- **Done when**: a stored hash with `N=2^20, r=1` or `r=999` is refused with RST-2209; an audit row with a NUL is stored; the new contract case passes on both adapters; removing the advisory lock fails a test; `npm run verify` green.
- **Refs**: RF-1100, RF-1109, RNF-003, ADR-015, P1-08 (verifier-opus MINORs 1-5, 9).

### P1-78 - Follow-up: align the documents with the P1-08 defaults

- **Difficulty**: 3 (haiku)
- **Size**: S
- **Depends on**: P1-08
- **Gate**: none
- **Status**: Done
- **Reads**: `docs/architecture.md` section 5; `docs/environments-and-delivery.md`; `docs/data-model.md` section 4.
- **Do**: list the account transitions P1-08 built (enable clears the failure counters, reset sets MustChangePassword, both refused on a Disabled account except enable) in architecture section 5; mark `ROSETTA_ADMIN_USER` and `ROSETTA_ADMIN_PASSWORD` as needed only on an empty `users` table (a warning otherwise); describe the bootstrap audit row (no actor, `ip = start-up`, no user name) in the data model.
- **Delivers**: the three document edits.
- **Done when**: the documents match the code; the documentation tests pass; `npm run verify` green.
- **Refs**: RF-1102, RF-1109, P1-08 (verifier-opus MINORs 6-8).

### P1-79 - Follow-up: sign-in and request protection hardening

- **Difficulty**: 7 (sonnet)
- **Size**: S
- **Depends on**: P1-09
- **Gate**: none
- **Status**: Done
- **Reads**: `src/presentation/web/access-hooks.ts`, `session-routes.ts`; `src/application/use-cases/sign-in.ts`; RF-1303.
- **Do**: skip the session lookup on public routes so `/healthz` answers 503 (not 500) while the database is down even with a session cookie; bound the `request.refused` audit rows written for Origin refusals (rate limit or sampling, with a security event); log a security event and an audit row for the 429 of the in-flight sign-in bound and for rate-limit hits; make a wrong password for a known user cost the same database work as an unknown user name and add a timing test on PostgreSQL; rotate or clear the CSRF secret cookie at sign-in and sign-out.
- **Delivers**: the changes with tests.
- **Done when**: `/healthz` answers 503 with the database down and a session cookie; a token issued before sign-out is refused after another sign-in; `npm run verify` green.
- **Refs**: RF-1009, RF-1100, RF-1109, RF-1303, P1-09 (verifier-opus MINORs 1-5).

### P1-80 - Follow-up: project settings upper bounds and workspace audit

- **Difficulty**: 5 (haiku)
- **Size**: S
- **Depends on**: P1-18
- **Gate**: none
- **Status**: Done
- **Reads**: `src/application/projects/project-settings.ts`; `src/application/use-cases/open-workspace.ts`; `docs/data-model.md` 3.1.
- **Do**: add the allowed ranges of DEC-117 to the numeric settings and refuse a value outside them with its field and code: `agents.parallelism` 1-8; `scan.maxFileBytes` 1 KB-5 MB; `scan.areaTokenBudget` 4,000-200,000; `scan.excerptMaxLines` 20-2,000; run cost cap 0-100,000,000 micros; run tokens 0-50,000,000; `confirmAboveCostMicros` 0 up to the run cost cap; `maxOutputTokens` 256-32,768; reader `maxTurns` 1-50; `timeoutSeconds` 10-600; `maxRetries` 0-5; the template defaults stay as they are (DEC-116); audit refused and unknown-id `OpenWorkspace` attempts.
- **Delivers**: the bounds, the audit rows and their tests.
- **Done when**: a value just outside each range is refused with its field and code and the edge values are accepted; a refused workspace open writes an audit row; `npm run verify` green.
- **Refs**: RF-002, RF-1105, RF-1109, P1-18 (verifier MINORs 2 and 6), DEC-116, DEC-117.

### P1-81 - Follow-up: run event delivery and queue shutdown hardening

- **Difficulty**: 6 (sonnet)
- **Size**: S
- **Depends on**: P1-22
- **Gate**: none
- **Status**: Done
- **Reads**: `src/presentation/web/event-stream.ts`, `run-routes.ts`; `src/infrastructure/events/jsonl-event-log.ts`; `src/application/runs/run-queue.ts`.
- **Do**: cap the live events held for a page that stalls during replay (1 MiB, like live delivery) and drop the page so it reconnects with `Last-Event-ID`; get the last `seq` of a finished run without parsing the whole log (store it in the run index or read the tail); close the `RunQueue.shutDown` window in which a run launched mid-dispatch is neither aborted nor awaited.
- **Delivers**: the changes with tests.
- **Done when**: a stalled page is dropped once the held events pass the cap and the next reconnect replays the rest; a run launched during shutdown is aborted and awaited; `npm run verify` green.
- **Refs**: RF-1006, RF-1108, RNF-002, P1-22 (verifier MINORs, rounds 1 and 2).

### P1-82 - Follow-up: log the scan run fallbacks

- **Difficulty**: 3 (haiku)
- **Size**: S
- **Depends on**: P1-23
- **Gate**: none
- **Status**: Done
- **Reads**: `src/application/use-cases/run-scan.ts`; `src/infrastructure/scan/scan-pipeline.ts`.
- **Do**: log a warning when `RunScan` falls back to the current project scan settings because the manifest holds none or an invalid `scanSettings`; log when `discard()` cannot remove an output file.
- **Delivers**: the two log lines with tests.
- **Done when**: both cases write one warning without secrets; `npm run verify` green.
- **Refs**: RF-147, RNF-002, P1-23 (verifier MINORs, round 2).

### P1-83 - Follow-up: card writer logging and serialised writes

- **Difficulty**: 4 (haiku)
- **Size**: S
- **Depends on**: P1-32
- **Gate**: none
- **Status**: Done
- **Reads**: `src/infrastructure/cards/write-or-restore.ts`; `docs/data-model.md` 3.7.
- **Do**: a logger that throws while reporting a failed restore must not replace the original refusal (catch and keep the refusal); state in the doc comment and data-model 3.7 that card writes to one run folder must be serialised by the caller.
- **Delivers**: the change and its test.
- **Done when**: with a throwing logger the original refusal is returned; `npm run verify` green.
- **Refs**: RNF-002, RF-302, P1-32 (verifier-opus MINORs 1 and 2, round 3).

### P1-84 - Follow-up: web and end-to-end harness hardening

- **Difficulty**: 3 (haiku)
- **Size**: S
- **Depends on**: P1-12, P1-13
- **Gate**: none
- **Status**: Done
- **Reads**: `web-lint.config.ts`; `web/src/api/client.ts`; `eslint.config.ts`; `tests/e2e/support/serve.ts`.
- **Do**: add `setHTMLUnsafe`, `createContextualFragment`, `parseHTMLUnsafe` and `srcdoc` to the RF-507 lint selectors; make `client.ts` match its "never throws" header for paths outside `/api/` (return a typed error); give client network failures their own catalogue code instead of reusing RST-2006; block a dynamic `import()` and a default import of `@playwright/test` in e2e specs; clean the e2e data folder with the writable-temp-root helper.
- **Delivers**: the changes with tests.
- **Done when**: each new lint case fails in a fixture; `npm run verify` and `npm run test:e2e` green.
- **Refs**: RF-507, RNF-005, RNF-008, P1-12 and P1-13 (verifier MINORs).

### P1-85 - Follow-up: move the front end to Preact 11

- **Difficulty**: 3 (haiku)
- **Size**: S
- **Depends on**: P1-12
- **Gate**: none
- **Status**: Done
- **Reads**: `docs/environments-and-delivery.md` package baseline; `web/`.
- **Do**: once Preact 11.0.x is at least two weeks old (11.0.0 was published 2026-09-30), pin it exactly, update the baseline row and fix any breaking change.
- **Delivers**: the upgrade.
- **Done when**: `npm run verify` and `npm run test:e2e` green on the new pin.
- **Refs**: DEC-52, P1-12 (builder note).

### P1-86 - Follow-up: atomic sign-in failure counters

- **Difficulty**: 6 (sonnet)
- **Size**: S
- **Depends on**: P1-10
- **Gate**: none
- **Status**: Done
- **Reads**: `src/application/use-cases/sign-in.ts`, `change-password.ts`; `src/infrastructure/db/pg-user-repository.ts`; DEC-112.
- **Do**: record sign-in and change-password failures with an atomic update (an incrementing guarded `UPDATE`) so parallel wrong guesses each count and a failure write never undoes a concurrent disable or reset; add `password_hash` to the `updateIfCurrent` guard.
- **Delivers**: the changes with PostgreSQL tests.
- **Done when**: eight parallel wrong passwords count eight failures; a sign-in failure racing a disable leaves the account Disabled; `npm run verify` green.
- **Refs**: RF-1100, RF-1102, RF-1103, DEC-112, P1-10 (verifier-opus MINORs, round 2).

### P1-87 - Follow-up: lockfile health on newer npm

- **Difficulty**: 4 (haiku)
- **Size**: S
- **Depends on**: P1-01
- **Gate**: none
- **Status**: Done
- **Reads**: `package-lock.json`; `docs/conventions.md` (install); `Dockerfile`.
- **Do**: with npm 11.19 on Linux `npm ci` reports a missing `@emnapi` entry (also on `main`); find the cause, regenerate the lockfile so `npm ci --ignore-scripts` passes on the npm version CI uses and on the latest npm 11, and pin the npm version CI uses if needed. Then drop the `npm@11.6.2` pin and its comment from the `Dockerfile` (P1-44 pinned it because the lock file was written by the npm of Node.js 24.11.1) and check that both stages still pass `npm ci`.
- **Delivers**: the lockfile fix.
- **Done when**: `npm ci --ignore-scripts` passes on Linux with npm 11.19 and in CI; `npm run verify` green.
- **Refs**: RNF-005, P1-13 (verifier note).

### P1-88 - Follow-up: provider key address check gaps

- **Difficulty**: 4 (haiku)
- **Size**: S
- **Depends on**: P1-11
- **Gate**: none
- **Status**: Done
- **Reads**: `src/infrastructure/security/public-address.ts`; `src/domain/accounts/provider-keys.ts`; `src/infrastructure/security/aes-gcm-secret-box.ts`; `docs/architecture.md` section 7.
- **Do**: treat `3fff::/20`, `5f00::/16` and `::ffff:0:0:0/96` as non-public; refuse a base URL ending in a bare `?` or `#`; read the secret with strict base64 in the secret box; say in architecture section 7 that the connect-time check is not wired until P2-10.
- **Delivers**: the changes with tests.
- **Done when**: each new range and the bare `?`/`#` are refused; `npm run verify` green.
- **Refs**: RF-1104, DEC-112, P1-11 (verifier-opus MINORs 1-4).

### P1-89 - Follow-up: egress guard split-key carry and look-alike markers

- **Difficulty**: 5 (haiku)
- **Size**: S
- **Depends on**: P1-28
- **Gate**: none
- **Status**: Done
- **Reads**: `src/infrastructure/guards/mask-request.ts`, `private-key-pieces.ts`; `src/domain/egress/data-block-scan.ts`; `docs/architecture.md` section 7.
- **Do**: compare paths case-folded in the split-key carry (a case-insensitive file system can return `a.cs` for `A.cs`); document the `key: "MII...` limit in the module header and architecture section 7; refuse or defang Unicode look-alike block markers in content and headers.
- **Delivers**: the changes with tests.
- **Done when**: a key continued under a differently cased path is masked; a look-alike marker cannot open or close a block; `npm run verify` green.
- **Refs**: RF-141, RF-145, P1-28 (verifier-opus MINORs, rounds 2 and 3).

### P1-90 - Follow-up: reader tools and repair turn gaps

- **Difficulty**: 4 (haiku)
- **Size**: S
- **Depends on**: P1-31
- **Gate**: none
- **Status**: Done
- **Reads**: `src/application/understand/`; `src/infrastructure/understand/`; `prompts/`; RF-145.
- **Do**: make the memory reader answer a read past the end of a file the same way as the file reader; make `grep` skip the files the scan skipped; make the repair turn respect the turn cap, the context limit and the abort signal; add tests for an abort between tool calls and a 200-entry listing; make the RF-145 prompt test scan every folder under `prompts/`.
- **Delivers**: the changes with tests.
- **Done when**: each gap has a test that failed before the fix; `npm run verify` green.
- **Refs**: RF-145, RF-200, P1-31 (verifier MINORs).

### P1-91 - Follow-up: cost ledger and caps hardening

- **Difficulty**: 4 (haiku)
- **Size**: S
- **Depends on**: P1-27
- **Gate**: none
- **Status**: Done
- **Reads**: `src/infrastructure/budget/`; `src/application/budget/`; `src/web/`; `docs/data-model.md`; `scripts/openai-live-check.mjs`; `package.json`.
- **Do**: add a race test for the per-user lock; check that cost report sums stay below 2^53 or keep them as bigint; save `SetCaps` in one transaction; make the web dollar parser refuse `1,2,3` and values above the DEC-117 cost range; list the migration 0005 indexes in the data model; make `live:openai` load `.env` itself. Also test the comma cases of `web/src/lib/usd.ts` (`dollarsToMicros` strips every comma, so `1,5` becomes 15 and `1,2,3` becomes 123: refuse them), a `.5` input and more than six decimals, and give a negative dollar cap an `RST` code instead of a local refusal without one (P1-41 verifier MINORs).
- **Delivers**: the changes with tests.
- **Done when**: each item has a test or a document edit; `npm run live:openai` works without extra flags; `npm run verify` green.
- **Refs**: RF-420, RF-428, DEC-117, P1-27 (verifier MINORs).

### P1-92 - Follow-up: remove the gallery environment switch

- **Difficulty**: 2 (haiku)
- **Size**: S
- **Depends on**: P1-12
- **Gate**: none
- **Status**: Done
- **Reads**: `src/infrastructure/config/environment.ts`; `.env.example`; tests naming `ROSETTA_GALLERY`.
- **Do**: remove `ROSETTA_GALLERY` from the environment loader, `.env.example` and the tests; the gallery is served at `/dev/gallery` in development only (DEC-126).
- **Delivers**: the removal with its tests.
- **Done when**: no file names `ROSETTA_GALLERY`; `/dev/gallery` answers in development and 404 in production; `npm run verify` green.
- **Refs**: DEC-126, P1-12.

### P1-93 - Follow-up: provider test rate-limit logging

- **Difficulty**: 3 (haiku)
- **Size**: S
- **Depends on**: P1-29
- **Gate**: none
- **Status**: Done
- **Reads**: `src/presentation/web/provider-routes.ts`; `docs/architecture.md` section 7.
- **Do**: write the security log entry (`RST-2005`) when the per-user provider-test limit answers 429, like the per-address limit; keep the documented per-call ceiling of run-less calls (100,000 micros, 2,000 tokens) in one constant.
- **Delivers**: the change with a test.
- **Done when**: a per-user 429 writes one security log entry without secrets; `npm run verify` green.
- **Refs**: RF-009, RF-407, P1-29 (verifier MINOR 1, round 2).

### P1-94 - Follow-up: test timing flakes under full-suite load

- **Difficulty**: 4 (haiku)
- **Size**: S
- **Depends on**: P1-01
- **Gate**: none
- **Status**: Done
- **Reads**: `tests/`; `vitest.config.ts`.
- **Do**: find why `jsonl-event-log.test.ts`, `architecture-rules.test.ts` and the run-scan tests time out under full-suite load on Windows (EBUSY temp-directory cleanup, depcruise runs); fix the slow path or give those files their own timeout with a comment saying why. Set a default `maxWorkers` for the local Vitest run that keeps a Windows machine below the load that causes the flakes, so agents need not pass `--maxWorkers`.
- **Delivers**: the fix.
- **Done when**: three consecutive full `npm run verify` runs on Windows pass without a timeout.
- **Refs**: RNF-002, P1-29 and P1-31 builder and verifier notes.

### P1-95 - Live run page: stage stepper, Pause updates and the run meter in the top bar

- **Difficulty**: 7 (sonnet)
- **Size**: M
- **Depends on**: P1-35
- **Gate**: G-02
- **Status**: Done
- **Reads**: `docs/design/board/LiveRun.dc.html` and `Main.dc.html` (the "This run" meter in the top bar); `docs/design-system.md` sections 1 (principles 2 and 6), 4 (Pause updates) and 5 (Pipeline stepper, Header totals, Cost meter); `web/src/pages/LiveRunPage.tsx`; `web/src/components/Header.tsx`; pull request #211 and its verdict.
- **Do**: add the three parts of the live run artboard that P1-35 left out. (1) A stage stepper above the panels: an ordered list Snapshot, Scan, Understand, Verify, Report with each step done, current (`aria-current="step"`) or waiting, and the counts the board shows (files and areas scanned, agents done of planned, claims checked of proposed) taken from the run events and the run row; a stage the run does not include stays waiting. (2) A "Pause updates" button that freezes the agent panels, overview and event log for reading while the stream keeps filling a buffer; a counter shows how many events wait, the button then reads "Resume" and applies them in order; Stop run stays usable, nothing moves under the pointer, and the state is announced through the page's one polite status. (3) The "This run" meter in the top bar next to the project totals: `role="meter"` with a label, spent of cap and share, the warning states at 80% and 95% (design-system.md section 5), shown only while the run is active and updated from the run total the page already reads. The classes carry their own prefixes (`rst-live-stepper-`, `rst-live-pause-`, `rst-topbar-runmeter-`) in their own stylesheet and reuse no class of another page card, because parallel page cards collided on `.rst-meter` (P1-34, P1-42).
- **Delivers**: the three components, their styles and unit tests; E2E specs against the real server with the fake provider and no mocked API or event stream (no `page.route`): the stepper moves through the stages of a recorded run, Pause holds the panels while the counter rises and Resume applies the held events in order, the top-bar meter shows the cap share while the run is active and leaves when it ends; axe passes in light and dark at desktop and phone width.
- **Done when**: the RF-1002, RF-1003 and RF-1010 scenarios that name the stepper, the pause and the run meter have passing E2E tests; the verifier walks the page at 1280x800 in both schemes against the artboard; `npm run verify` and `npm run test:e2e` green.
- **Refs**: RF-1002, RF-1003, RF-424, RF-1010, RF-1006, DEC-46, DEC-49, DEC-71, P1-35 (verdict on #211; builder question answered by the owner 2026-10-12: build them).

### P1-96 - Follow-up: live cost per role from usage and budget events

- **Difficulty**: 9 (opus)
- **Size**: M
- **Depends on**: P1-27, P1-33, P1-35
- **Gate**: none
- **Status**: Done
- **Reads**: `src/infrastructure/budget/`; `src/application/budget/`; `src/application/understand/`; `docs/data-model.md` event table (`usage.recorded`, `budget.warning`, `budget.capReached`); `web/src/lib/live-run/`; ADR-007.
- **Do**: make the budget guard of a run report to the run's event sink: `usage.recorded` after every recorded call with the fields of the data model (call id, role, provider, model, tokens, cost, run totals, project totals), `budget.warning` at 50, 80 and 95 percent of a cap and `budget.capReached` when a cap stops the run; the events never carry prompts, answers or keys, and a failing sink never fails the call or lets a call skip the guard. On the live run page show tokens and cost per role and per agent from `usage.recorded` instead of a dash, keep the total re-read from the run as the check, and remove the page note that says per-role cost is missing (P1-35).
- **Delivers**: the guard reporting, the page change and their tests, including a recorded understand run whose events give a cost for each role.
- **Done when**: a recorded run shows a cost per role and per agent on the page; each warning level and the cap stop emit one event; removing the emission from the guard fails a test; a throwing sink does not change the guard's decision; `npm run verify` and `npm run test:e2e` green.
- **Refs**: RF-421, RF-422, RF-424, RF-1003, RF-1010, ADR-007, P1-33 (not done: usage and budget events), P1-35 (verdict: per-role cost).

### P1-97 - Follow-up: build the report from the run page and check the replay without JavaScript

- **Difficulty**: 6 (sonnet)
- **Size**: M
- **Depends on**: P1-35, P1-43
- **Gate**: none
- **Status**: Done
- **Reads**: `src/presentation/web/run-file-routes.ts`; `web/src/pages/LiveRunPage.tsx`; `templates/report/`; `Dockerfile`; DEC-131; the verdict comments on #197.
- **Do**: add a "Build report" control to the page of an ended run that calls `POST /api/runs/:runId/report` (DEC-131: built when the owner asks, never while the run is queued or running, 409 `runInProgress` shown as a plain sentence, 404 for another user's run) and then links the report and the replay page; P1-46 needs it for its journey. Also: run axe on the replay page with JavaScript off (P1-43 ran it with JavaScript on only); add a test that the image ships `templates/report/` with its CSS and JavaScript files; make a report that fails part-way leave every file whole (write each to a temporary name and rename, as `writeText` does) and say in `docs/data-model.md` 3.17 that the set of files is not written atomically; add a route test that a report build on a run with no events answers `RST-1701`; write down in `docs/data-model.md` 3.17 that the meta CSP of the report carries no `frame-ancestors` because only the header can (the header sets it). Correction (2026-10-13, verdict 6138235802 on #264): the text above says an empty run answers `RST-1701`; the code builds the report with 200 and an empty replay, which is right, so no `RST-1701` is expected.
- **Delivers**: the control, the checks and the document lines, with tests and an E2E spec that builds a report from the page of a finished recorded run.
- **Done when**: a finished run builds its report from the page and shows the links; a running run shows the control disabled with the reason; axe passes on the replay page with JavaScript off; `npm run verify` and `npm run test:e2e` green.
- **Refs**: RF-504, RF-506, RF-507, RF-1013, RF-1008, DEC-131, P1-43 (verdict on #197: round 1 and 2 MINORs and builder questions).

### P1-98 - Follow-up: citation range check and stable ids in the understand run

- **Difficulty**: 5 (haiku)
- **Size**: S
- **Depends on**: P1-33
- **Gate**: none
- **Status**: Done
- **Reads**: `src/application/verifier/citation-check.ts`; `src/application/use-cases/run-understand.ts`; `docs/data-model.md` 3.6; RF-200, RF-203, RF-300.
- **Do**: make the citation check refuse a citation whose start or end is not an integer or that breaks `1 <= start <= end`, with the reason `CitationInvalid`; add an integration test that a second understand run on the same snapshot re-checks the card ids and area names of the first (RF-203); say in the data model and the request documentation that an empty `areas` list means every area.
- **Delivers**: the check, the test and the document lines.
- **Done when**: a citation `src/A.cs:0-3`, `:5-2` or `:1.5-3` is marked `CitationInvalid` with its reason and never deleted; the RF-203 re-run test passes; `npm run verify` green.
- **Refs**: RF-203, RF-300, RF-200, P1-33 (verifier MINORs).

### P1-99 - Follow-up: parse budget validation and configuration

- **Difficulty**: 5 (haiku)
- **Size**: S
- **Depends on**: P1-75
- **Gate**: none
- **Status**: Done
- **Reads**: `src/infrastructure/scan/packs/`; `src/application/use-cases/compose-runs.ts`; `src/infrastructure/config/environment.ts`; `docs/environments-and-delivery.md`; `.env.example`.
- **Do**: validate the parse budget `totalMs` (a positive whole number within a stated maximum; `NaN`, zero and negative values never silently mean "no budget" or "already spent") and read it from the configuration loader with the present 2 minutes as the default, listed in `docs/environments-and-delivery.md` and `.env.example`, instead of the fixed value in `compose-runs.ts`; test and document that a language pack that cannot be stopped overruns the budget by at most the file it is parsing. The time-based budget against the deterministic scan of RF-106 is an open owner question (handoff 2026-10-12); this card keeps the budget as built.
- **Delivers**: the validation, the wiring, the document lines and tests.
- **Done when**: an invalid value is refused at start-up with a code and the field; a changed value changes the budget in a run; the overrun test passes; `npm run verify` green.
- **Refs**: RF-110, RF-106, RNF-004, P1-75 (verifier MINORs).

### P1-100 - Follow-up: statements hidden after an unterminated key marker

- **Difficulty**: 5 (haiku)
- **Size**: S
- **Depends on**: P1-76
- **Gate**: none
- **Status**: Done
- **Reads**: `src/infrastructure/scan/universal/sql-script.ts`; the tests of the SQL script scan.
- **Do**: finish the two cases P1-76 left: a bare statement verb on a line after an unterminated `BEGIN ... PRIVATE KEY` marker is masked as key text and its statement is lost (no leak, but it is lost), and an unterminated marker before a later complete key hides the statements between them (only the span after the last END is bounded). Keep each of these statements in the code map or record the notice that statements were hidden by masking, and never let a key body through. The trade-off for a bare `SELECT` line is an open owner question (handoff 2026-10-12); until it is answered keep the behaviour as built and add the tests that pin it.
- **Delivers**: the change with fixture tests.
- **Done when**: a file with an unterminated marker before a complete key keeps the statements between them or records the notice; no key body appears in `codemap.json` in any fixture; `npm run verify` green.
- **Refs**: RNF-003, RF-104, P1-76 (verifier MINORs, round 2).

### P1-101 - Follow-up: audit filters, free-text masking and the cost bound

- **Difficulty**: 6 (sonnet)
- **Size**: S
- **Depends on**: P1-77
- **Gate**: none
- **Status**: Done
- **Reads**: `src/infrastructure/db/pg-audit-log.ts`, `audit-rows.ts`; the memory audit log; `tests/contracts/`; ADR-015.
- **Do**: make the PostgreSQL and the memory audit log agree on a filter with an upper-case user id and on a NUL in the action filter (RST-2404 on one and an empty result on the other today) and cover both in the contract suite; mask the words after the first in a quoted multi-word "password is ..." sentence; take the hard-coded cost bound of 2^17 from the scrypt cost N that ADR-015 names instead of repeating the number.
- **Delivers**: the changes with contract and unit tests.
- **Done when**: both audit adapters give the same answer for the two filters; "password is a long phrase" leaves no word of the phrase in a stored row; the bound follows the ADR value; `npm run verify` green.
- **Refs**: RF-1109, RNF-003, ADR-015, P1-77 (verifier MINORs).

### P1-102 - Follow-up: test and document gaps from P1-70, P1-73, P1-90 and P1-92

- **Difficulty**: 3 (haiku)
- **Size**: S
- **Depends on**: P1-70, P1-73, P1-90, P1-92
- **Gate**: none
- **Status**: Done
- **Reads**: `src/infrastructure/providers/openai/openai-provider.ts`; `docs/providers.md`; `src/application/use-cases/compose-runs.ts`; `src/infrastructure/understand/tool-reads.ts`; the gallery route and its tests.
- **Do**: add the tests the verifiers found missing: a key with U+00FF is accepted; the `RosettaError` code is kept when `compose-runs.ts` spreads an error; the post-filter of `tool-reads.ts` has a test; the mirror contract covers case, `..` and backslash paths; a leftover `ROSETTA_GALLERY` in the environment is ignored; and fix two lines: the RST-1511 row of `docs/providers.md` lists only 401 but the code also uses it for a refused key, and `/dev/gallery` answers a literal 404 in production (or the documentation says what it answers).
- **Delivers**: the tests and the two document or route lines.
- **Done when**: each listed gap has a test that fails when its guard is removed; `npm run verify` green.
- **Refs**: RF-402, RF-145, DEC-126, P1-70, P1-73, P1-90, P1-92 (verifier MINORs).

### P1-103 - Follow-up: Ollama and OpenAI adapter gaps found in P1-66

- **Difficulty**: 7 (sonnet)
- **Size**: S
- **Depends on**: P1-66
- **Gate**: none
- **Status**: Done
- **Reads**: `src/infrastructure/providers/ollama/text-tool-protocol.ts`; `src/infrastructure/providers/openai/`; `docs/providers.md`; the run manifest writer.
- **Do**: make the fenced-block parser of `parseTextAnswer` linear (a 2.5 MB answer takes 3.2 s today); pass `redirect: 'error'` for the fetch of the Ollama and the OpenAI adapters so a redirect never leads the call to another address; record the `sha256` that the text-tool-protocol loader returns next to its version in the run manifest; widen the margin of the "opening tags with text" growth test.
- **Delivers**: the changes with tests.
- **Done when**: a 2.5 MB fenced answer parses in under 100 ms; a 302 from the fake server is an error and the second address is never called; the manifest lists the protocol file hash; `npm run verify` green.
- **Refs**: RF-205, RF-401, RF-402, RNF-004, ADR-013, P1-66 (verifier MINORs, rounds 1 and 2).

### P1-104 - Follow-up: Ollama tool results as framed data blocks

- **Difficulty**: 7 (sonnet)
- **Size**: S
- **Depends on**: P1-89, P1-25
- **Gate**: none
- **Status**: Done
- **Reads**: `src/infrastructure/providers/ollama/`; `src/domain/egress/`; ADR-013; DEC-129; `docs/providers.md` section 2.
- **Do**: the Ollama adapter sends tool results as JSON-stringified text, so the lines of a data-block frame reach the model as an escaped `\n` string and not as lines; send the result text as the content of the tool message so the opening and closing markers with their random tag (DEC-129) stand on their own lines, and add a contract test on the fake Ollama server that the request it receives holds the frame on separate lines; check that the OpenAI adapter does the same. This card depends on P1-89 because the tag comes from it.
- **Delivers**: the change and the contract test.
- **Done when**: the body the fake Ollama server receives holds each marker alone on its line; the egress guard still passes the request; `npm run verify` green.
- **Refs**: RF-145, RF-205, ADR-013, DEC-129, P1-89 (builder note).

### P1-105 - Follow-up: run list read API and the Projects page run columns

- **Difficulty**: 7 (sonnet)
- **Size**: M
- **Depends on**: P1-41, P1-22
- **Gate**: none
- **Status**: Done
- **Reads**: `src/presentation/web/run-routes.ts`; `web/src/pages/ProjectsPage.tsx`; `docs/design/board/Projects.dc.html`; RF-1108.
- **Do**: add a read API for a signed-in user's projects with, for each, the project totals, the latest run with its state and the queue position of a queued run, then use it on the Projects page for the columns and the queue notice; add "Cancel queued run" (RF-1108). The access matrix and the owner scope apply to every row. Also (from the verdict on #268, 2026-10-13): `/projects` overflows horizontally at 360 px (`scrollWidth` 529, a bug already on main): fix the layout so the page has no horizontal scroll at 360 px and add an E2E check of `scrollWidth <= innerWidth` on the phone projects.
- **Delivers**: the route, the page columns, the queue notice with Cancel, integration and E2E tests against the real server.
- **Done when**: the Projects page shows totals, last run and queue position from the server; a queued run can be cancelled and another user's run answers 404; `npm run verify` and `npm run test:e2e` green.
- **Refs**: RF-1001, RF-1008, RF-1108, RF-1105, P1-41 (verifier note).

### P1-106 - Follow-up: cap, spend and queue read APIs and a settings version check

- **Difficulty**: 7 (sonnet)
- **Size**: M
- **Depends on**: P1-34, P1-42
- **Gate**: none
- **Status**: Done
- **Reads**: `src/presentation/web/`; `src/application/budget/`; `web/src/pages/EstimateSection.tsx`, `StageAreasSection.tsx`, `ServerMeter.tsx`; DEC-108; check P1-36 first.
- **Do**: add the read APIs the start page and the administration page lack: the caps and spend remaining for the user's day and the server's month, for the estimate warning of DEC-108 (reuse the totals of P1-36 when they have landed instead of a second source; own-key spend stays out of the server total, RF-1106); the position of a queued run with polling on the start page; and a version check (`If-Match` or a version field) on the project settings `PUT` so two tabs or a cap edit and a settings save cannot overwrite each other.
- **Delivers**: the routes, the client changes and tests including a lost-update race test on PostgreSQL.
- **Done when**: the start page warning names the real remaining cap; a stale settings save is refused with a code; the server month meter excludes own-key spend; `npm run verify` and `npm run test:e2e` green.
- **Refs**: RF-1001, RF-1106, RF-1108, RF-428, DEC-108, P1-34 and P1-42 (verifier MINORs and builder notes).

### P1-107 - Follow-up: start run and administration page polish

- **Difficulty**: 6 (sonnet)
- **Size**: M
- **Depends on**: P1-34, P1-42, P1-41
- **Gate**: none
- **Status**: Done
- **Reads**: `web/src/pages/`; `docs/design/board/StartRun.dc.html`, `AdminUsers.dc.html`, `AdminAudit.dc.html`; `web/src/pages/provider-choices.ts`; `templates/project-settings.json`.
- **Do**: start page: show a model without a price as "unknown" and flag that the estimate total excludes it; warn that a run on the server key may be refused when the server has no key (`providerKeyMissing`); open the start page when a project URL is already known; refuse unknown estimate query parameters such as `?areas[]=` with a clear message instead of ignoring them; take the provider defaults from the project settings template (serve it, or test the two stay in step). Administration: one line for the row actions, a name filter, a server keys column or checkbox, unlock and an account filter, period and outcome filters on the audit page, the cap banner in the shell slot, and the status an `/admin/*` page answers (403 or the shell). Classes keep the prefix of their page. Also (from the verdicts on #271, 2026-10-13): the start page fails when the run cap is below the confirm threshold; RST-1005 and RST-1006 name `budget.confirmAboveCostMicros`, which the start page does not show. This is a bug: show that setting next to the cap, or refuse the pair before the request, and add an E2E test with a cap below the threshold.
- **Delivers**: the page changes with E2E specs against the real server.
- **Done when**: each item has a passing E2E or unit test; axe passes at desktop and phone width in both schemes; `npm run verify` and `npm run test:e2e` green.
- **Refs**: RF-1001, RF-1100, RF-1106, RF-1109, DEC-71, P1-34, P1-41, P1-42 (verifier MINORs and builder notes).

### P1-108 - Follow-up: configuration, image and README gaps from P1-15, P1-44 and P1-45

- **Difficulty**: 6 (sonnet)
- **Size**: M
- **Depends on**: P1-15, P1-44, P1-45
- **Gate**: none
- **Status**: Done
- **Reads**: `src/infrastructure/config/environment.ts`; `Dockerfile`; `compose.yaml`; `README.md`; `docs/runbooks/`; the surface contract text in `docs/design/`.
- **Do**: refuse a malformed contact address (`isEmail` accepts `?cc=` and quotes) and refuse a known or all-zero `ROSETTA_SECRET_KEY` at start-up with a code; fix the stale status line of `README.md` ("documentation phase (P0)"); change the wording "no fakes" in the image documentation to say that no tests or scripts ship and the compiled fakes in `dist` are reachable only with `ROSETTA_TEST=1`; align the cap text of the surface contract with the 0.50 default (it says 2.00); remove the runtime `apt-get upgrade` from the image once Dependabot has moved the base image digest; document the rotation of the database role passwords in the runbook.
- **Delivers**: the checks, the document edits and tests.
- **Done when**: an all-zero secret key stops start-up with a code and no value in the log; the README states the real phase; `npm run verify` green and the compose smoke job green.
- **Refs**: RNF-003, RF-1301, RF-1302, RF-1303, P1-15, P1-44, P1-45 (verifier MINORs and builder notes).

### P1-109 - Follow-up: audit retention, a 365-day purge function and a daily task

- **Difficulty**: 8 (sonnet)
- **Size**: M
- **Depends on**: P1-06, P1-08, P1-79
- **Gate**: none
- **Status**: Done
- **Reads**: `docs/decision-log.md` DEC-132; `docs/data-model.md` sections 4 (`audit_events`) and 6; `db/migrations/0003_cost_ledger_audit.sql`; `src/infrastructure/db/pg-audit-log.ts`; the `Scheduler` port and its users in `src/presentation/composition-root.ts`; `tests/support/postgres.ts`.
- **Do**: DEC-132 keeps audit rows for 365 days while `rosetta_app` still cannot update or delete them. (1) A new migration (next free number) adds a `SECURITY DEFINER` function that deletes the `audit_events` rows older than a cut-off and returns how many it deleted. It is owned by `rosetta_migrator`, sets a fixed `search_path`, refuses with an error any cut-off younger than 365 days (measured on the database clock, not the caller's), and `EXECUTE` is revoked from `PUBLIC` and granted to `rosetta_app` only when that role exists (data-model section 6). `rosetta_app` gets no `UPDATE` or `DELETE` on `audit_events`. (2) A port and a `PgAuditRetention` adapter (and a memory adapter for the contract suite) call the function with a cut-off of 365 days; a failure is logged with a code and never stops the server. (3) A daily task on the `Scheduler` port calls it at start-up and every 24 hours, stopped by the shutdown signal. (4) Update `docs/data-model.md` section 4 (`audit_events`: retention and the function) and section 6 (the grant on the function and no other right).
- **Delivers**: the migration, the port, the adapters, the scheduled task and the two document sections; unit tests for the task (fake `Scheduler` and `Clock`) and integration tests on PostgreSQL.
- **Done when**: tests prove that rows older than 365 days are deleted; rows younger than 365 days survive; a direct `DELETE` and `UPDATE` on `audit_events` by `rosetta_app` fails; a cut-off younger than 365 days is refused by the function; the daily task calls it; the schema test of P1-06 lists the new function and grant; `npm run verify` green.
- **Refs**: RF-1109, RNF-003, ADR-015, ADR-016, DEC-132, P1-08, P1-79 (the table is created by P1-06 and written by the audit log of P1-08; P1-10 only records events).

### P1-110 - Follow-up: egress test that a repeated call gets a fresh tag

- **Difficulty**: 5 (haiku)
- **Size**: S
- **Depends on**: P1-89
- **Gate**: none
- **Status**: Done
- **Reads**: `src/application/understand/run-coverage.ts`; `tests/unit/application/understand/`; `src/domain/egress/`; DEC-129; the verifier probe in comment 6134901154 on #193.
- **Do**: `src/application/understand/run-coverage.ts`: commit a test that `toolsWithReads` forwards `renderBlock`, so that the answer to a repeated call (the same tool with the same arguments a second time) carries a fresh valid random tag and not the tag of the first answer. Use the verifier's probe of comment 6134901154 on #193 as the starting case.
- **Delivers**: the test.
- **Done when**: removing the `renderBlock` forwarding from `toolsWithReads` makes the test fail; `npm run verify` green.
- **Refs**: RF-145, ADR-013, DEC-129, P1-89 (verifier finding, test gap).

### P1-111 - Follow-up: make `clearContextCache` test-only

- **Difficulty**: 5 (haiku)
- **Size**: S
- **Depends on**: P1-69
- **Gate**: none
- **Status**: Done
- **Reads**: `src/infrastructure/providers/ollama/ollama-context-resolver.ts`; the tests of the resolver; `knip.json`.
- **Do**: `src/infrastructure/providers/ollama/ollama-context-resolver.ts`: `clearContextCache` is exported for tests only. Move it so that production code cannot reach it (a test support file, or a resolver instance with its own cache that tests build fresh) and keep knip and dependency-cruiser green.
- **Delivers**: the change and the adjusted tests.
- **Done when**: no file under `src/` exports `clearContextCache`; the resolver tests still pass; `npm run verify` green.
- **Refs**: RF-401, DEC-114, P1-69 (verifier MINOR).

### P1-112 - Follow-up: secret masking gaps found in P1-62

- **Difficulty**: 6 (sonnet)
- **Size**: M
- **Depends on**: P1-62
- **Gate**: none
- **Status**: Done
- **Reads**: `src/infrastructure/guards/secret-masker.ts`; `src/infrastructure/guards/mask-deep.ts`; `src/infrastructure/scan/universal/sql-words.ts`; `docs/data-model.md` section 3.14 and the scan section near line 221; the tests of the masker; the verdict on #219.
- **Do**: close the findings of the P1-62 verdict. (1) The `contextTokens` log key is masked as a bearer token: rename the log key (and its writer) so that it no longer matches a secret rule, and fix the sentence of `docs/data-model.md` 3.14 that names it. (2) The XML `<password>` rule disagrees with the code-map cut rule (`docs/data-model.md` near line 221 and `sql-words.ts` lines 43-48): decide from the masker's behaviour, then make the document and the code say the same thing, with a test. (3) Add the missing test that an XML secret element whose end tag is on the same line is masked. (4) The mysql `-p` rule over-masks ordinary prose (`-p` followed by a word): narrow it to a command-line shape and test a prose sentence. (5) The secret keys of `mask-deep.ts` cover only `password`, `passwd` and `pwd`; add `secret`, `token` and `authorization` (and their usual variants) with tests, and say so in 3.14 and in the audit `detail` rule of section 4.
- **Delivers**: the code, the document lines and tests for each of the five items.
- **Done when**: a log line with the renamed key shows its number; a `token`, `secret` and `authorization` value is masked by `mask-deep`; the same-line XML case and the prose `-p` case have tests that fail when the rule is reverted; `npm run verify` green.
- **Refs**: RF-009, RF-141, RNF-003, P1-62 (verifier MINORs, verdict on #219).

### P1-113 - Follow-up: answers file parsing and route tests from P1-39

- **Difficulty**: 6 (sonnet)
- **Size**: S
- **Depends on**: P1-39
- **Gate**: none
- **Status**: Done
- **Reads**: `src/infrastructure/cards/answers-sections.ts`; the answers route and its tests; `docs/data-model.md` (`answers.md`); `tests/integration/access-matrix.test.ts`; the verdict on #222.
- **Do**: `src/infrastructure/cards/answers-sections.ts` splits on `\n` only, so an `answers.md` with CRLF line ends breaks: split on `\r?\n` (keep the file's own line ends when writing it back) and add a CRLF fixture test. Add the tests the 50-answer limit and the 256 KiB body limit lack (accepted at the limit, refused one over it, with the code). Add a route test that a state-changing answers request without a valid CSRF token is refused.
- **Delivers**: the parser change, a CRLF fixture and the three tests.
- **Done when**: a CRLF `answers.md` parses and saves without changing its line ends; each limit test fails when the limit constant changes; the CSRF test fails when the hook is removed from the route; `npm run verify` green.
- **Refs**: RF-203, RF-1005, RNF-003, DEC-98, P1-39 (verifier MINORs).

### P1-114 - Follow-up: bound the pill totals query and test the admin read from P1-36

- **Difficulty**: 6 (sonnet)
- **Size**: S
- **Depends on**: P1-36
- **Gate**: none
- **Status**: Done
- **Reads**: `src/infrastructure/db/pg-cost-totals.ts`; `src/application/ports/cost-totals.ts`; `tests/e2e/support/cost-run.ts`; the project cost E2E spec; the verdict on #223.
- **Do**: `CostTotals.userSummary` in `pg-cost-totals.ts` runs an unbounded `GROUP BY` over the ledger on every refresh of the header pill: bound it (an index-friendly query on the user and the period, a limit on the groups, or a short cache keyed by user) and test the bound. `tests/e2e/support/cost-run.ts` reads `Date.now()`: take the time from the harness clock or the database instead. Add the missing test that an administrator who opens another user's project reads that project's totals and not their own (and a user still gets 404 for someone else's project).
- **Delivers**: the query change, the helper change and the tests.
- **Done when**: the summary query touches a bounded number of rows for a ledger of many rows (test with a seeded ledger); `grep -n "Date.now" tests/e2e/support/cost-run.ts` is empty; the admin-reads-other test passes; `npm run verify` and `npm run test:e2e` green.
- **Refs**: RF-428, RF-1010, RF-1105, RNF-004, P1-36 (verifier MINORs).

### P1-115 - Follow-up: log the landing-page lookup failure and test fail-closed routes

- **Difficulty**: 6 (sonnet)
- **Size**: S
- **Depends on**: P1-79
- **Gate**: none
- **Status**: Done
- **Reads**: the request-protection hooks and the landing-page route from #218 (`src/presentation/web/`); `tests/integration/access-matrix.test.ts`; `docs/conventions.md` (user-facing behaviour when something is down); the verdict on #218.
- **Do**: the landing-page lookup failure (the store call that decides what the landing page shows) is swallowed without a log line: log it with a code at warn level (no request data beyond the path) and keep the answer as built. Add a fail-closed test: with the session store down, every non-public route answers the store-unavailable error and never serves its page, and the public routes still answer.
- **Delivers**: the log line and the test.
- **Done when**: a lookup failure writes one log line with its code; the fail-closed test covers a page route and an API route and fails if the hook falls open; `npm run verify` green.
- **Refs**: RF-1101, RF-1105, RNF-003, P1-79 (verifier MINORs).

### P1-116 - Follow-up: threshold and edge-case tests for settings ranges and OpenWorkspace

- **Difficulty**: 5 (haiku)
- **Size**: S
- **Depends on**: P1-80
- **Gate**: none
- **Status**: Done
- **Reads**: `src/application/use-cases/open-workspace.ts` and its tests; the settings range validation from #221; DEC-117; the verdict on #221.
- **Do**: add tests for the early return of the threshold check (the value that returns before the later checks run) and for the three edge cases the verdict lists (a value exactly on each end of a range, one step outside it, and the missing value). In the `OpenWorkspace` tests replace the loose `toMatchObject` checks with exact expectations (`toEqual` on the audit event and on the result) so an extra or missing field fails.
- **Delivers**: the tests.
- **Done when**: each added test fails when its guard or constant is changed; `npm run verify` green.
- **Refs**: RF-1106, DEC-117, P1-80 (verifier MINORs).

### P1-117 - Follow-up: zero-test guard and stale report in the level script

- **Difficulty**: 5 (haiku)
- **Size**: S
- **Depends on**: P1-61
- **Gate**: none
- **Status**: Done
- **Reads**: `scripts/test-levels.mjs` and its tests; `package.json` scripts; the verdict on #217.
- **Do**: `scripts/test-levels.mjs`: the zero-tests guard also counts Playwright tests, so a Vitest run with zero tests passes when Playwright ran some: count only the Vitest report for the Vitest guard. Standalone, the script accepts a stale `vitest.json` left from an earlier run: refuse a report older than the run it belongs to (compare its start time, or delete it before the run) and say why. Add tests for both.
- **Delivers**: the script change and tests.
- **Done when**: a Vitest report with zero tests fails even when a Playwright report has tests; a `vitest.json` older than the current run is refused standalone; `npm run verify` green.
- **Refs**: RNF-005, README section 1 (test pyramid), P1-61 (verifier MINORs).

### P1-118 - Follow-up: fixtures and line length for the call log from P1-65

- **Difficulty**: 5 (haiku)
- **Size**: S
- **Depends on**: P1-65
- **Gate**: none
- **Status**: Done
- **Reads**: the keyed-array secret masking and the call-log writer from #215 (`src/infrastructure/guards/`, `src/infrastructure/providers/`); `tests/fixtures/`; the verdict on #215.
- **Do**: wrap the long comment lines that the verdict lists to the line width used by the repository; commit fixtures and tests for the cases that were only generated inside a test: a call-log file with CRLF line ends, an empty file, and a file holding a very long array, each read back by the same code.
- **Delivers**: the comment edits and three committed fixtures with their tests.
- **Done when**: each fixture exists in `tests/fixtures/` and is read by a test that fails when the handling is removed; `npm run verify` green.
- **Refs**: RF-408, RF-009, P1-65 (verifier MINORs).

### P1-119 - Follow-up: file reader and grep gaps from P1-67

- **Difficulty**: 6 (sonnet)
- **Size**: S
- **Depends on**: P1-67
- **Gate**: none
- **Status**: Done
- **Reads**: `src/infrastructure/files/` (the file reader and the grep worker); `tests/support/memory-repository-reader.ts`; `src/application/ports/`; the verdict on #207; ADR-006.
- **Do**: test the file that grows between the size check (`stat`) and the read (it must still stop at the cap, not read the new size); pin the early stop of the grep worker with a test (a fixture with more matches than the cap stops reading further files and reports the cut); give `MemoryRepositoryReader` (`tests/support/memory-repository-reader.ts`) the same caps as the real reader so tests of its callers see the same limits, covered by the shared contract suite. The 1,000-match cap against RF-144 and RF-146 is an owner question (handoff 2026-10-13); keep it as built.
- **Delivers**: three tests and the reader change.
- **Done when**: the grow-between test, the early-stop test and a contract case that runs against both readers pass and fail when the guard is removed; `npm run verify` green.
- **Refs**: RF-144, RF-146, RNF-004, ADR-006, P1-67 (verifier MINORs).

### P1-120 - Follow-up: remove the start stagger from the P1-35 E2E specs

- **Difficulty**: 5 (haiku)
- **Size**: S
- **Depends on**: P1-35
- **Gate**: none
- **Status**: Done
- **Reads**: `tests/e2e/support/live-run-page.ts` (`waitForOwnSecond` and its call in `startAndOpenLiveRun`); `tests/e2e/live-run.spec.ts`; PR #212 (cost reservation key per user, run and call; migration 0007).
- **Do**: the stagger worked around the cost reservation key collision of runs that started in the same second; #212 fixed the cause. Remove `waitForOwnSecond`, its call, the `PROJECT_NAMES` constant if nothing else uses it and the comment that explains it, in `tests/e2e/support/live-run-page.ts`; find any other copy with `grep -rn -i "stagger\|reservation" tests/e2e`. Run the live-run specs on all four viewport projects at once to show they stay green.
- **Delivers**: the removal.
- **Done when**: the grep above finds no workaround; `npm run test:e2e` is green three times in a row; `npm run verify` green.
- **Refs**: RF-421, RF-1003, P1-35 (builder question, fixed by #212).

### P1-121 - Follow-up: history and deletion races, orphaned folders and the Report label from P1-40

- **Difficulty**: 7 (sonnet)
- **Size**: M
- **Depends on**: P1-40
- **Gate**: none
- **Status**: Done
- **Reads**: the delete use cases and routes from #256 (`src/application/use-cases/`, `src/presentation/web/`); the History page (`web/src/pages/`); `tests/e2e/history.spec.ts`; the removal tests; `docs/data-model.md` sections 2 and 9; the verdict 6136190668 on #256.
- **Do**: close the findings of the P1-40 verdict. (1) A project delete can race a queued-run insert: inside the delete transaction take a `FOR UPDATE` lock on the project row, then run the guarded delete, and add a test with two concurrent connections (a queued-run insert against a delete) that shows no run row is left without its project. (2) A run folder is orphaned when its removal fails after the rows are deleted and nothing cleans it up: log the failure with a code and add a clean-up that retries it (at start-up or on a daily task), or remove the folder first and the rows second; pick one, say so in `docs/data-model.md` section 9 and test the failure. (3) The read-only removal test is a no-op on Windows: make it fail the removal in a way that works on both systems (for example a fake file-system port that refuses) and show that it fails when the clean-up is removed. (4) The History "Report" link label clashes with the build control and links of P1-97 (same name, different action): rename the History link so that the two differ by accessible name, and keep the E2E locators unambiguous. (5) A repeating flake: `tests/e2e/history.spec.ts:58` timed out on phone-light twice in CI; find the cause (a wait on a state that is set late, or a layout that depends on the viewport) and fix it without raising the timeout.
- **Delivers**: the lock, the clean-up, the changed test, the renamed label and the stabilised spec, with the document line.
- **Done when**: the concurrent-insert test fails when the lock is removed; a failed folder removal leaves a log line and is cleaned up; the removal test fails on Windows and Linux when the clean-up is removed; the two Report controls have different accessible names; `tests/e2e/history.spec.ts` is green five times in a row on all four viewport projects; `npm run verify` and `npm run test:e2e` green.
- **Refs**: RF-1008, RF-1012, ADR-009, DEC-51, DEC-55, P1-40, P1-97 (verdict 6136190668 on #256).

### P1-122 - Follow-up: key-only log entries of deleted runs, route-level masking and percentile fixtures from P1-37 (priority)

- **Difficulty**: 7 (sonnet)
- **Size**: M
- **Depends on**: P1-37, P1-40
- **Gate**: none
- **Status**: Done
- **Reads**: the API calls and logs routes and queries from #255 (`src/presentation/web/`, `src/infrastructure/providers/jsonl-provider-call-log.ts`, `provider-call-lines.ts`); the transcript route; the `seq` parsing; the percentile tests; `tests/integration/access-matrix.test.ts`; `docs/data-model.md` sections 3.10 and 3.14; the verdict 6136282855 on #255.
- **Do**: close the findings of the P1-37 verdict; the first is a privacy bug and goes first. (1) A key-only log entry (one that carries the call key but no run id) of another user's deleted run is attributed to a live run that has the same key; P1-40's deletion now makes this reachable. Scope an entry to a run by the run id and the owner as well as the key (or drop key-only entries whose run is gone), and test it with two users, a deleted run and a live run with the same key: the second user must see none of the first user's entries in the calls list, the transcript and the logs. (2) Add a route-level masking test: seed a secret in a call, send it through the HTTP transcript route and the log route, and assert the secret appears in neither body. (3) The `seq` regex is untested: add cases for a valid number, leading zeros, a negative number, a number above the safe range and text, with the codes the routes answer. (4) Add a fixture for the percentile with two samples (P50 and P95 of a pair) next to the existing ones.
- **Delivers**: the scoping fix and the three tests with their fixtures.
- **Done when**: the two-user deleted-run test fails when the scoping is removed; the masking test fails when the masker is bypassed on either route; the `seq` and two-sample cases fail when the parsing or the percentile rule changes; the access matrix still passes; `npm run verify` green.
- **Refs**: RF-408, RF-1011, RF-009, RNF-003, DEC-50, DEC-51, DEC-57, P1-37, P1-40 (verdict 6136282855 on #255).

### P1-123 - Follow-up: owner, grant and task tests for the audit purge function from P1-109

- **Difficulty**: 6 (sonnet)
- **Size**: S
- **Depends on**: P1-109
- **Gate**: none
- **Status**: Done
- **Reads**: the migration and tests of #257 (`db/migrations/`, `tests/integration/`, `tests/support/postgres.ts`); `src/presentation/composition-root.ts` (the scheduled tasks); `docs/data-model.md` section 6; DEC-132; the verdict 6136064533 on #257.
- **Do**: add the three tests the P1-109 verdict lists. (1) The purge function is owned by `rosetta_migrator` (read the owner from the catalogue, not from the migration text). (2) `rosetta_app` cannot `ALTER` the function nor replace it with `CREATE OR REPLACE FUNCTION`, and cannot change its owner. (3) A test lists the tasks registered on the `Scheduler` port at start-up and expects the audit purge among them with its 24-hour interval, so that a task dropped from the composition root fails a test.
- **Delivers**: three tests.
- **Done when**: each test fails when the owner, the privilege or the registration is changed; `npm run verify` green.
- **Refs**: RF-1109, RNF-003, ADR-015, ADR-016, DEC-132, P1-109 (verdict 6136064533 on #257).

### P1-124 - Follow-up: more secret masking gaps found in P1-112

- **Difficulty**: 6 (sonnet)
- **Size**: M
- **Depends on**: P1-112
- **Gate**: none
- **Status**: Done
- **Reads**: `src/infrastructure/guards/secret-masker.ts`; `src/infrastructure/guards/mask-deep.ts`; the masker tests; `docs/data-model.md` section 3.14; the verdict 6136826590 on #259.
- **Do**: close the findings of the P1-112 verdict, each with a test that fails when the rule is reverted. (1) The mysql `-p` rule still leaks with two positional words before `-p` and with the database name after the options: match the password option wherever it stands in the command line. (2) The keys `Secret_2FA` and `Secret2FA` are not masked: let the secret key rule match a digit or an underscore after the word. (3) A quoted password that contains a space leaves its tail: mask to the closing quote. (4) The keys `tokenValue`, `refreshTokens`, `bearer` and `secretKey` are not masked: extend the key rule (and the plural), and say which key shapes are covered in section 3.14. (5) An XML secret element with a leading space inside the tag, or with a CDATA section, is not masked: handle both. Keep linear time and add the new shapes to the hostile-input suite.
- **Delivers**: the rule changes, the cases for the five items and the hostile-input cases.
- **Done when**: every listed shape is masked and its test fails when the rule is reverted; the hostile-input suite stays inside its time bound; `npm run verify` green.
- **Refs**: RF-009, RF-141, RNF-003, P1-112 (verdict 6136826590 on #259).

### P1-125 - Follow-up: narrow `processContextCache` and test the `retryAt` reset from P1-111

- **Difficulty**: 5 (haiku)
- **Size**: S
- **Depends on**: P1-111
- **Gate**: none
- **Status**: Done
- **Reads**: `src/infrastructure/providers/ollama/ollama-context-resolver.ts` (find `processContextCache` with `grep -rn processContextCache src tests`); the resolver tests; `knip.json`; the verdict 6136577799 on #260.
- **Do**: `processContextCache` is exported with public mutable `Map` and `Set` fields: narrow the export (an interface with the few methods callers use) or make the fields `readonly`, so no caller can reassign or clear them; keep knip and dependency-cruiser green. Add the missing test that the `retryAt` of a failed probe is reset after a later success (a failed probe sets it, a success clears it, the next call probes at once).
- **Delivers**: the narrower type and the test.
- **Done when**: no file outside the resolver can assign or clear the cache fields (a type test or a compile check); the `retryAt` test fails when the reset is removed; `npm run verify` green.
- **Refs**: RF-401, DEC-114, P1-111 (verdict 6136577799 on #260).

### P1-126 - Follow-up: line ends and byte-order mark in the answers file from P1-113

- **Difficulty**: 6 (sonnet)
- **Size**: S
- **Depends on**: P1-113
- **Gate**: none
- **Status**: Done
- **Reads**: `src/infrastructure/cards/answers-file.ts` (`FileAnswersFile.addQuestions`, line 68); `src/infrastructure/cards/answers-sections.ts`; the answers tests and fixtures; `docs/data-model.md` (`answers.md`); the verdict 6137529664 on #261.
- **Do**: `FileAnswersFile.addQuestions` joins with `\n` onto a file that has CRLF line ends, so the file gets mixed line ends and is then rewritten as CRLF: detect the file's own line end once and use it for the lines it appends. Add the missing tests: a file with a lone CR (old Mac line ends) and a byte-order mark before a heading; each must parse, keep the other answers and write back without changing the line ends or dropping the mark.
- **Delivers**: the join fix and fixtures for a CRLF append, a lone CR and a BOM.
- **Done when**: an append to a CRLF file leaves only CRLF line ends; the lone-CR and BOM fixtures parse and round-trip; each test fails when its handling is removed; `npm run verify` green.
- **Refs**: RF-203, RF-1005, RNF-003, P1-113 (verdict 6137529664 on #261).

### P1-127 - Follow-up: reader-level grow test and the memory reader cut notice from P1-119

- **Difficulty**: 6 (sonnet)
- **Size**: S
- **Depends on**: P1-119
- **Gate**: none
- **Status**: Done
- **Reads**: `src/infrastructure/files/` (the file reader and its `stat` then `readUpTo` path); `tests/support/memory-repository-reader.ts`; the shared reader contract suite in `tests/contracts/`; the verdict 6137566727 on #262.
- **Do**: the wiring from `stat` to `readUpTo` for a file that grows between the two is untested at the reader level (P1-119 tested the helper): add a test that drives the reader itself with a file that grows after the size check and still stops at the cap. The cut notice of the memory reader is faked (a fixed string): make it use the same notice builder as the real reader and cover the notice text in the contract suite for both readers.
- **Delivers**: the reader-level test and the shared notice with its contract case.
- **Done when**: the grow test fails when the cap is read from the `stat` size only; the contract case compares the notice of both readers and fails when they differ; `npm run verify` green.
- **Refs**: RF-144, RF-146, RNF-004, ADR-006, P1-119 (verdict 6137566727 on #262).

### P1-128 - Follow-up: drop the unused `userGroups` from the cost totals port in P1-114

- **Difficulty**: 5 (haiku)
- **Size**: S
- **Depends on**: P1-114
- **Gate**: none
- **Status**: Done
- **Reads**: `src/application/ports/cost-totals.ts`; `src/infrastructure/db/pg-cost-totals.ts`; the memory adapter and the contract suite; `knip.json`; the verdict 6137727261 on #263.
- **Do**: `CostTotals.userGroups` has no production caller (only tests use it): remove it from the port, from both adapters and from the contract suite, and move any case it covered that nothing else covers onto `userSummary`.
- **Delivers**: the removal and the adjusted tests.
- **Done when**: `grep -rn userGroups src tests` is empty; the contract suite still covers the grouping through `userSummary`; `npm run verify` green.
- **Refs**: RF-428, RF-1010, P1-114 (verdict 6137727261 on #263).

### P1-129 - Follow-up: settings range tests assert the code and cover both budget fields from P1-116

- **Difficulty**: 5 (haiku)
- **Size**: S
- **Depends on**: P1-116
- **Gate**: none
- **Status**: Done
- **Reads**: the settings range tests and the `OpenWorkspace` tests from #267; `src/application/projects/project-settings.ts`; DEC-117; the verdict 6138390870 on #267.
- **Do**: the missing-value test asserts only the field name, not the error code, and skips the two budget fields (the run cost cap and the run tokens): assert field and code, and cover both budget fields. `maxCost` is duplicated in the tests (two copies of the same constant): keep one, exported from a test support file.
- **Delivers**: the stricter test and the single constant.
- **Done when**: the missing-value test fails when the code changes and covers the cost cap and the token cap; one definition of `maxCost` remains; `npm run verify` green.
- **Refs**: RF-1106, DEC-117, P1-116 (verdict 6138390870 on #267).

### P1-130 - Follow-up: stepper Report step done once a report exists (P1-95)

- **Difficulty**: 6 (sonnet)
- **Size**: S
- **Depends on**: P1-95, P1-97
- **Gate**: none
- **Status**: Done
- **Reads**: `web/src/pages/LiveRunPage.tsx` and the stepper component from #268; the run read route and its contract in `web/src/api/`; `docs/design/board/LiveRun.dc.html`; the verdict 6139949379 on #268.
- **Do**: the Report step of the stage stepper shows done as soon as a report exists for the run, not only when the run events say so. The page needs a report-exists signal: add it to the run read model (or to the file listing the page already reads) and set it after the build of P1-97 without a page reload. Test the three states: no report (waiting), a report built from the page (done at once) and a report built earlier (done on load).
- **Delivers**: the signal, the stepper change and unit and E2E tests.
- **Done when**: building a report from the page turns the Report step to done without a reload; a run with an earlier report shows it done on load; `npm run verify` and `npm run test:e2e` green.
- **Refs**: RF-1002, RF-504, DEC-131, P1-95 (verdict 6139949379 on #268).

### P1-131 - Follow-up: journey with a server key and administrator caps (P1-46)

- **Difficulty**: 6 (sonnet)
- **Size**: M
- **Depends on**: P1-46
- **Gate**: none
- **Status**: Done
- **Reads**: `tests/e2e/journeys/`; `tests/e2e/support/` (the harness has no server key); `docs/process-flows.md` flow 5; the verdicts on #271.
- **Do**: administrator caps apply only to runs on a server key, and the E2E harness has no server key, so the cap journey of P1-46 cannot cover them. Give the harness a server key for the fake provider (set in the test environment only, never printed) and add a journey: the administrator sets a cap, a user starts a run on the server key, the run stops at the cap and the user and server totals show it.
- **Delivers**: the harness server key and the journey.
- **Done when**: the journey passes headless from a clean database and fails when the cap check is skipped for server keys; no key value appears in logs or reports; `npm run test:e2e` green.
- **Refs**: RF-1105, RF-1106, RF-428, RNF-005, P1-46 (verdicts on #271).

### P1-132 - Follow-up: harness clock in the run folder helper and the phone-dark contrast flake

- **Difficulty**: 5 (haiku)
- **Size**: S
- **Depends on**: P1-13
- **Gate**: none
- **Status**: Done
- **Reads**: `tests/e2e/support/run-folder.ts` (`appendLogs`, lines 64 and 69); `tests/e2e/support/` for the harness clock; `tests/e2e/smoke.spec.ts` (line 46); `docs/conventions.md`.
- **Do**: `appendLogs` calls `new Date()` on lines 64 and 69, which breaks the rule that time comes from the harness clock: take the time from the harness clock. Separately, `tests/e2e/smoke.spec.ts:46` on phone-dark failed a colour-contrast check once in CI: reproduce it (run the axe check on the phone-dark project in a loop and read the failing node and colour pair), then fix the colour or the moment the check runs (for example before a transition has finished) instead of retrying.
- **Delivers**: the clock change and the stabilised check.
- **Done when**: `grep -n "new Date\|Date.now" tests/e2e/support/run-folder.ts` is empty; `tests/e2e/smoke.spec.ts` is green ten times in a row on phone-dark; `npm run verify` and `npm run test:e2e` green.
- **Refs**: RNF-005, P1-13 (CI flake and a hard-rule finding, 2026-10-13).

### P1-133 - Follow-up: a successful sign-in must not undo a concurrent disable

- **Difficulty**: 7 (sonnet)
- **Size**: S
- **Depends on**: P1-86
- **Gate**: none
- **Status**: Done
- **Reads**: `src/application/use-cases/sign-in.ts`; `src/application/ports/user-repository.ts`; `src/infrastructure/db/pg-user-repository.ts` and `memory-user-repository.ts`; `tests/contracts/user-repository.contract.ts` and `failed-sign-in-counter.contract.ts`; `tests/integration/application/sign-in-failure-races.test.ts`; `tests/integration/infrastructure/db/pg-user-repository-hardening.test.ts`; `tests/support/postgres.ts`; the verdict 6141942123 on #291.
- **Do**: **priority (security).** A successful sign-in writes the whole account row back, so it can undo a disable that an administrator made at the same moment: a disabled account signs in once more or becomes enabled again. Make the success write conditional on the account still being enabled and on the row not having changed, or write only the columns that sign-in owns (failure counter, lock, last sign-in), and test it on PostgreSQL with two connections: a disable that lands between the read and the success write keeps the account disabled and the sign-in is refused. Also test the lock-expiry boundary (`<=`: a lock that ends exactly now no longer locks) and add a parallel `SignIn` test on PostgreSQL (several sign-ins of one account at once, correct and wrong passwords mixed) that checks the failure counter and the lock.
- **Delivers**: the conditional or column-scoped success write in both repositories and the contract, the boundary test and the parallel PostgreSQL tests.
- **Done when**: the disable-race test fails on the old whole-row write and passes now; the `<=` boundary test fails when the comparison is changed to `<`; the parallel test is green ten times in a row; `npm run verify` green.
- **Refs**: RF-1100, RF-1102, RF-1103, RF-1109, P1-86 (verdict 6141942123 on #291).

### P1-134 - Follow-up: more secret-masking gaps in command lines

- **Difficulty**: 6 (sonnet)
- **Size**: S
- **Depends on**: P1-124
- **Gate**: none
- **Status**: Done
- **Reads**: `src/infrastructure/guards/secret-masker.ts`; `tests/unit/infrastructure/guards/secret-masker.test.ts`; `tests/integration/infrastructure/guards/secret-masker-performance.test.ts`; `docs/security/threat-model.md` (secret shapes); the verdict 6142376462 on #285.
- **Do**: three shapes still leak in a command line: a quoted executable path (`"C:\Program Files\tool.exe" --password x`), a quoted database name before the credentials, and a redirect placed before the options (`> out.txt --token x`). Write a failing case for each, with the secret value and a harmless neighbour, then close the gap without making the masker slower on the performance fixture and without masking the harmless neighbour.
- **Delivers**: the three masker fixes and their tests.
- **Done when**: the three cases fail on `main` and pass now; the performance test keeps its bound; `npm run verify` green.
- **Refs**: RF-009, RF-141, RNF-003, P1-124 (verdict 6142376462 on #285).

### P1-135 - Follow-up: BOM-only and mixed-line-end answers files

- **Difficulty**: 4 (haiku)
- **Size**: S
- **Depends on**: P1-126
- **Gate**: none
- **Status**: Done
- **Reads**: `src/infrastructure/cards/answers-file.ts` and `answers-sections.ts`; `tests/unit/infrastructure/cards/answers-line-ends.test.ts`, `answers-sections-crlf.test.ts` and `answers-file.test.ts`; the verdict 6141894338 on #286.
- **Do**: an `answers.md` that holds only a byte-order mark loses the mark when an answer is recorded, and a file with mixed line ends (some `\r\n`, some `\n`) is rewritten in one style without a rule. Write a failing test for each, then keep the mark of a BOM-only file and keep each existing line's own ending, using the ending of the preceding line for new lines.
- **Delivers**: the two fixes and their tests.
- **Done when**: both tests fail on `main` and pass now; an unchanged part of the file is byte-identical after a record; `npm run verify` green.
- **Refs**: RF-203, RF-1005, RNF-003, P1-126 (verdict 6141894338 on #286).

### P1-136 - Follow-up: three tables scroll sideways at 360 px

- **Difficulty**: 5 (haiku)
- **Size**: S
- **Depends on**: P1-107
- **Gate**: none
- **Status**: Done
- **Reads**: `tests/e2e/support/sweep.ts`; `tests/e2e/visual/sweep-admin.spec.ts` and `sweep-runs.spec.ts` (the `wideTable` exemption); `web/src/styles/`; the pages for users, snapshots and history; `docs/design-system.md` (tables at 360 px); the verdict 6146557849 on #307.
- **Do**: the users, snapshots and history tables are wider than 360 px, and the sweep exempts them through `scrollsSidewaysUntil`. Fix the CSS so each table fits (stack the cells or hide a secondary column at narrow widths, following the design system), then remove the table exemption from the sweep so a table that scrolls sideways fails it.
- **Delivers**: the CSS changes and the sweep without the table exemption.
- **Done when**: the sweep is green on phone-light and phone-dark with no table exemption; the 1280 px layout is unchanged; `npm run verify` and `npm run test:e2e` green.
- **Refs**: RNF-010, RF-1008, RF-1100, DEC-71, P1-107 (PR #307, verdict 6146557849).

### P1-137 - Follow-up: Projects overview query cost

- **Difficulty**: 6 (sonnet)
- **Size**: S
- **Depends on**: P1-105
- **Gate**: none
- **Status**: Done
- **Reads**: `src/presentation/web/project-overview-routes.ts`; `src/application/use-cases/list-project-overview.ts`; `web/src/pages/use-project-overview.ts`; `tests/integration/presentation/web/project-overview.test.ts`; the verdict 6144213653 on #294.
- **Do**: `GET /api/projects/overview` makes two queries per project plus a queue read, and the Projects page polls it every 5 s, so the cost grows with the number of projects and the number of open tabs. Bound it: read the latest run and the totals of all the user's projects in a fixed number of queries (a join or a grouped query, scoped to the user), and cap the number of projects it answers with a documented limit. Test the bound by counting queries with 1, 10 and 50 projects (the count does not grow) and test the limit.
- **Delivers**: the bounded query, the limit and the tests.
- **Done when**: the query count is the same for 1 and 50 projects; another user's projects never appear; `npm run verify` green.
- **Refs**: RF-1001, RF-1008, RF-1108, RF-1105, P1-105 (verdict 6144213653 on #294).

### P1-138 - Follow-up: deletion error route test and the folder removal outside the transaction

- **Difficulty**: 6 (sonnet)
- **Size**: S
- **Depends on**: P1-121
- **Gate**: none
- **Status**: Done
- **Reads**: `src/application/use-cases/delete-run.ts`; `tests/integration/presentation/web/delete-run-project.test.ts`; `src/infrastructure/files/run-folder.ts`; `docs/conventions.md` (errors); the verdict 6144290364 on #295.
- **Do**: two gaps. First, RST-1115 (HTTP 500, the folder could not be removed) is tested only at use-case level: add a route test that makes the removal fail and checks the status, the error code and that nothing leaks in the body. Second, the folder removal runs inside the database transaction, so a slow disk holds a pooled connection and the row lock: move the removal out of the transaction (delete the rows, commit, then remove the folder, keeping the orphan clean-up of P1-121 as the safety net) or bound it with a timeout, and test that the connection is released before the removal starts.
- **Delivers**: the route test and the changed order or bound with its test.
- **Done when**: the route test fails when the error mapping is removed; a test with a deliberately slow removal shows the pool is not held; `npm run verify` green.
- **Refs**: RF-1012, RF-1008, ADR-009, DEC-55, P1-121 (verdict 6144290364 on #295).

### P1-139 - Follow-up: start and admin page gaps

- **Difficulty**: 5 (haiku)
- **Size**: S
- **Depends on**: P1-107
- **Gate**: none
- **Status**: Done
- **Reads**: `web/src/pages/` (the start-run page and the administration caps page); `tests/e2e/start-run.spec.ts` and `admin-polish.spec.ts`; `tests/e2e/support/axe.ts`; the unit test of the cap banner; the verdict 6144206682 on #296.
- **Do**: two gaps. The administrator cap banner has only a unit test: add an E2E check of the banner and an axe check of the page in both colour schemes. In the "none" estimate state, a refusal because the threshold is above the cap is shown in a field that is not on the page, so the user sees nothing: show the message where the page has a field for it, and test it.
- **Delivers**: the E2E and axe checks, the message placement and its test.
- **Done when**: the refusal is visible and announced in the "none" state; the banner is covered by E2E and axe; `npm run verify` and `npm run test:e2e` green.
- **Refs**: RF-1001, RF-1100, RF-1106, RNF-010, DEC-71, P1-107 (verdict 6144206682 on #296).

### P1-140 - Follow-up: small test and comment gaps

- **Difficulty**: 4 (haiku)
- **Size**: S
- **Depends on**: P1-98, P1-81, P1-127, P1-132, P1-103
- **Gate**: none
- **Status**: Done
- **Reads**: `src/application/understand/understand-options.ts`; `src/application/use-cases/start-run.ts`; `tests/unit/application/verifier/citation-check.test.ts`; `src/application/runs/run-queue.ts`; `tests/support/fs-trap.ts`; `tests/e2e/support/`; `tests/unit/infrastructure/providers/ollama/parse-text-answer-speed.test.ts` and the other speed bounds from #300; the verdicts 6144652613 (#302), 6144312780 (#299), 6144307484 (#298), 6142032481 (#292) and 6144534207 (#300).
- **Do**: P1-98: add the citation cases 5-4 and 3-3 (a range that ends before it starts, and a one-line range; a mutation of the range check survives today) and fix the stale comments at `understand-options.ts:24` and `start-run.ts:31`. P1-81: add a one-line comment on `isClosing` at `run-queue.ts:134` saying why the flag exists. P1-127: reword the comment in `tests/support/fs-trap.ts` as the verdict asks. P1-132: no committed test needs the transition wait of the harness, so remove the wait or say in a comment which test needs it. P1-103: replace the wall-clock speed bounds, including the 250 ms bound on the 500k case, with a check that does not depend on machine load (compare the time of the large input with a small one, or count operations).
- **Delivers**: the two tests, the comment fixes and the load-insensitive speed checks.
- **Done when**: the two citation cases kill the surviving mutation; the speed tests stay green when the machine is loaded (ten runs with a parallel CPU load); `npm run verify` green.
- **Refs**: RF-203, RF-300, RF-1006, RF-205, RNF-004, P1-98, P1-81, P1-127, P1-132, P1-103 (verdicts 6144652613, 6144312780, 6144307484, 6142032481, 6144534207).

### P1-141 - Follow-up: test flakes seen on 2026-10-13

- **Difficulty**: 4 (haiku)
- **Size**: S
- **Depends on**: P1-13
- **Gate**: none
- **Status**: Done
- **Reads**: `tests/integration/infrastructure/providers/provider-output-scan.test.ts`; `tests/e2e/live-coverage.spec.ts` (line 100); `tests/e2e/support/seed.ts` and `sign-in.ts`; the CI logs of runs 38379124565 and 38393978228.
- **Do**: two flakes. The test "no file the call log writes ... fixture secret" in `provider-output-scan.test.ts` took 5051 ms on Windows (run 38379124565): find what is slow (the scan of a large tree, a real wait) and bound it or speed it up. `live-coverage.spec.ts:100` failed on desktop-dark on `main` (run 38393978228), possibly because its two tests share one account and interfere: reproduce it by running the spec repeatedly with workers, then give each test its own account or run folder instead of retrying.
- **Delivers**: the faster scan test and the isolated E2E tests.
- **Done when**: the scan test finishes under 2 s on the Windows runner; `live-coverage.spec.ts` is green twenty times in a row on desktop-dark; `npm run verify` and `npm run test:e2e` green.
- **Refs**: RNF-003, RNF-005, P1-13 (CI flakes of 2026-10-13).

### P1-142 - Follow-up: secret masking gaps after P1-134

- **Difficulty**: 6 (sonnet)
- **Size**: S
- **Depends on**: P1-134
- **Gate**: none
- **Status**: Done
- **Reads**: `src/infrastructure/guards/secret-masker.ts`; `tests/unit/infrastructure/guards/secret-masker.test.ts`; `tests/support/secret-command-shapes.ts`; the verdict 6148899278 on #326.
- **Do**: three gaps. A redirect before the options still leaks when it is `&>` or `>|` (`mysql &> out.sql -u root -pSECRET` is not masked): mask those as `>` is masked. `--token Bearer <value>` masks only the word `Bearer` and leaves the value visible: mask the value after a scheme word. Nothing tests the lookbehind of `optionStart`: add `x--token abc` and `---token abc` as innocent texts that stay visible.
- **Delivers**: the masker changes and their tests.
- **Done when**: the three shapes are masked and the innocent texts stay visible; removing the lookbehind fails a test; the speed bound of the masker still holds; `npm run verify` green.
- **Refs**: RNF-005, RF-408, P1-134 (verdict 6148899278 on #326).

### P1-143 - Follow-up: sign-in gaps after P1-133

- **Difficulty**: 6 (sonnet)
- **Size**: S
- **Depends on**: P1-133
- **Gate**: none
- **Status**: Done
- **Reads**: `src/application/accounts/sign-in.ts`; the account repositories (`src/infrastructure/db/`); the sign-in tests; the verdict on #322.
- **Do**: `markSignedIn` does not guard against a lock set by another server instance between the read and the write: make the write conditional on the account state it read, as the disable path does, and test it with two instances. Add the missing test that the audit row carries the reason `account-changed` when that happens. Shorten the long comment in `sign-in.ts` to the why.
- **Delivers**: the guarded write, the two tests and the comment.
- **Done when**: a sign-in never clears a lock or a disable written after its read (tested on both repositories); the audit reason is tested; `npm run verify` green.
- **Refs**: RF-1100, RF-1102, RNF-005, P1-133 (verdict on #322).

### P1-144 - Follow-up: small gaps after the 2026-10-13 merges

- **Difficulty**: 4 (haiku)
- **Size**: S
- **Depends on**: P1-64, P1-72, P1-83, P1-129, P1-131, P1-140
- **Gate**: none
- **Status**: Done
- **Reads**: `tests/unit/support/network-policy.test.ts`; `src/infrastructure/cards/write-or-restore.ts`; `tests/e2e/support/caps-lock.ts`; `src/application/understand/understand-options.ts`; `web/src/` (the `transitions.ts` comment); the verdicts on #331, #328, #321, #320, #308 and #333.
- **Do**: P1-64: add a lone `.` segment and a trailing `..` to the Windows pipe path cases. P1-83: a logger that throws synchronously still replaces the refusal: keep the refusal and test it. P1-129: use the project import alias the verdict names. P1-131: the minor points of the stale-lock takeover in `caps-lock.ts` from the verdict. P1-140: the `transitions.ts` comment says `background-color` where the CSS uses `background`; the header of `understand-options.ts` still says "every area when absent". P1-72: `run-understand.ts` is at the 300-line limit; move one helper out so the next change has room.
- **Delivers**: the tests and the small fixes above.
- **Done when**: each item is done or answered in the PR with the reason; the new tests fail on the mutation of the code they protect; `npm run verify` green.
- **Refs**: RNF-005, RF-1007, P1-64, P1-72, P1-83, P1-129, P1-131, P1-140 (verdicts on #331, #328, #321, #320, #308, #333).

### P1-145 - Follow-up: more test flakes seen on 2026-10-13

- **Difficulty**: 4 (haiku)
- **Size**: S
- **Depends on**: P1-141
- **Gate**: none
- **Status**: Done
- **Reads**: `tests/e2e/start-run.spec.ts` (lines 171 and 212); `tests/e2e/live-run.spec.ts` (line 155); `tests/e2e/api-calls.spec.ts`; `tests/e2e/page-shots.spec.ts`; `tests/integration/infrastructure/events/jsonl-event-log.test.ts`; the CI logs of the P1-64 runs on #331.
- **Do**: `start-run.spec.ts:171` and `live-run.spec.ts:155` failed once each in CI and passed on a re-run; `api-calls.spec.ts` (RF-1011) failed once under local load; `page-shots` misses its `/healthz` wait on a busy machine; `jsonl-event-log` times out under full-suite load. Find the shared cause (shared accounts, a fixed wait, a server start bound) and fix each without retries. `start-run.spec.ts:212` fails on every local run because of a stale "no OpenAI key" assumption: make it independent of the local `.env`.
- **Delivers**: the fixed tests.
- **Done when**: each named test is green twenty times in a row with four workers; `start-run.spec.ts:212` passes locally with and without a key in `.env`; `npm run verify` and `npm run test:e2e` green.
- **Refs**: RNF-003, RNF-005, P1-141 (CI flakes of 2026-10-13).

### P1-146 - Follow-up: CI waste on pull request edits and uneven e2e shards

- **Difficulty**: 5 (haiku)
- **Size**: S
- **Depends on**: P1-02
- **Gate**: none
- **Status**: Done
- **Reads**: `.github/workflows/ci.yml`; `tests/integration/tooling/workflows.test.ts`; `playwright.config.ts`; `docs/environments-and-delivery.md` section 6; the shard times on #325.
- **Do**: the `edited` event of `pull_request` re-runs the whole CI when only the body changes and cancels the running run: run only the pr-title job on `edited`, and keep the full run on `opened`, `synchronize` and `reopened`. Shard 1 of the e2e job takes about 4 minutes while shard 3 takes under 2, because Playwright splits by count in file order: balance the shards (move the long journey and administration specs apart, or split by duration) so that the slowest shard is under about 3 minutes.
- **Delivers**: the workflow change, its test and the balanced shards.
- **Done when**: editing a pull request body runs only pr-title; the slowest e2e shard is under about 3 minutes on two runs; the `e2e` aggregate stays the required check; `npm run verify` green.
- **Refs**: RNF-001, DEC-42, P1-02 (CI time work of 2026-10-13, #297, #304, #307, #325).

### P1-147 - Follow-up: local acceptance fixes from the owner's first test

- **Difficulty**: 6 (sonnet)
- **Size**: M
- **Depends on**: P1-41, P1-34, P1-107
- **Gate**: none
- **Status**: Done
- **Reads**: `web/src/pages/ProjectsPage.tsx`; `web/src/lib/live-run/run-failures.ts`; `src/domain/errors/descriptions.ts`; `src/presentation/web/run-routes.ts` and `estimate-query.ts`; the start page and its area list; the code map builder under `src/infrastructure/scan/codemap/`; `web/src/pages/ProviderTest.tsx`; issue #353.
- **Do**: six bugs from the owner's hands-on local test of 2026-10-13. (a) The demo URL uses `/tree/master/`, but the demo repository's default branch is now `main`, so the scan fails with RST-1901: use `main`. (b) The live run failure text knows only a few codes and shows a generic message for the rest: show the catalogue message and next step for every code. (c) Starting a run has a 1 KB body limit while it allows 200 areas of up to 1 024 characters, so 42 real area names are refused with RST-2000: make the limit and the schema agree, and test the largest allowed body. (d) Long area names overflow the Stage and areas card on the start page: keep them inside the card at 1280 px and 360 px. (e) The code map offers vendored third-party JavaScript (jQuery bundles, MSAjax, esm and umd builds) as areas, and they dominate the estimate: leave areas made only of vendored or minified files unticked and marked "third-party", using a conservative, tested rule. (f) Test providers shows little progress during a cold model load: mark each role as being tested and the button busy.
- **Delivers**: the six fixes with their tests and the documents that describe them.
- **Done when**: a project from the demo URL scans; a run with 42 long area names starts; RST-1901 shows its catalogue text on the live run page; the area list stays inside its card at 1280 px and 360 px; vendored areas start unticked and marked; Test providers shows progress per role; `npm run verify` and `npm run test:e2e` green.
- **Refs**: RF-010, RF-100, RF-1001, RF-1108, RNF-010, DEC-71, G-08 (the owner's local test of 2026-10-13, issue #353).

### P1-148 - Follow-up: secret masking gaps after P1-142

- **Difficulty**: 6 (sonnet)
- **Size**: S
- **Depends on**: P1-142
- **Gate**: none
- **Status**: Done
- **Reads**: `src/infrastructure/guards/secret-masker.ts`; `tests/support/secret-command-shapes.ts`; the masker tests and the speed bound; the verdict 6151856171 on #345.
- **Do**: these shapes still leak the value: `--token Negotiate <value>` (and other scheme words), `--token 'Bearer' <value>`, `--token Bearer Bearer <value>`, `--token Bearer` followed by many spaces and a value; `mysql 2>&1 -u root -pSECRET` and `mysql >& out.sql -u root -pSECRET` are not masked. Mask them, keep the harmless neighbours visible and masking idempotent, and add hostile pieces for the new patterns to the adversarial speed input.
- **Delivers**: the masker changes and their tests.
- **Done when**: every shape above is masked; the innocent texts stay visible; `mask(mask(x))` equals `mask(x)`; the speed bound holds with the new pieces; `npm run verify` green.
- **Refs**: RNF-005, RF-408, P1-142 (verdict 6151856171 on #345).

### P1-149 - Follow-up: sign-in lock precision and the counters note

- **Difficulty**: 5 (haiku)
- **Size**: S
- **Depends on**: P1-143
- **Gate**: none
- **Status**: Done
- **Reads**: `src/infrastructure/db/pg-user-repository.ts`; `src/application/ports/user-repository.ts`; `tests/contracts/successful-sign-in.contract.ts`; the verdict 6152015674 on #346.
- **Do**: a lock stored with more than millisecond precision (manual SQL, a database `now()`, a restore) reads back truncated, so the guarded sign-in write never matches and the account cannot sign in until an administrator resets it: compare at millisecond precision and add a contract case. Write the default that the failure counters are not compared into the port documentation. Shorten the long header comment of the contract file.
- **Delivers**: the comparison change, the contract case and the two text fixes.
- **Done when**: a sub-millisecond lock that has expired lets a correct sign-in through on PostgreSQL; a live lock still refuses it; `npm run verify` green.
- **Refs**: RF-1100, RF-1102, RNF-005, P1-143 (verdict 6152015674 on #346).

### P1-150 - Follow-up: end-to-end harness gaps after 2026-10-13

- **Difficulty**: 5 (haiku)
- **Size**: M
- **Depends on**: P1-145, P1-146
- **Gate**: none
- **Status**: Done
- **Reads**: `tests/e2e/support/` (the start page helper, `caps-lock.ts`, `serve.ts`, the global setup); `scripts/run-e2e.mjs`; `tests/integration/tooling/workflows.test.ts` and `e2e-shards.test.ts`; `tests/e2e/api-calls.spec.ts`; `tests/support/understand-run-harness.ts`; the verdicts on #334, #344, #349 and #351.
- **Do**: (1) the start page helper checks for "No projects yet" and then creates the project, so two parallel tests on one account can race: make the create idempotent. (2) No test covers the `--shard` selection of `run-e2e.mjs`: an empty selection would run every spec in every shard. (3) The workflow test checks the pr-title job id, not its `name: pr-title`, which the ruleset matches. (4) The caps lock folder is not cleared when an e2e run starts, so a killed run makes the next one wait up to 10 minutes: key it per run. (5) `api-calls.spec.ts:35` still times out about once in twenty repeats under four workers. (6) `tests/support/understand-run-harness.ts` is at the 300-line limit: split it.
- **Delivers**: the six fixes with tests.
- **Done when**: each item has a test that fails without its fix (or, for item 5, twenty green repeats with four workers); `npm run verify` and `npm run test:e2e` green.
- **Refs**: RNF-001, RNF-003, P1-141, P1-145, P1-146, P1-144 (verdicts on #334, #344, #349, #351).

### P1-151 - Follow-up: table label check and report word breaks

- **Difficulty**: 4 (haiku)
- **Size**: S
- **Depends on**: P1-136
- **Gate**: none
- **Status**: Done
- **Reads**: `tests/e2e/support/sweep.ts`; `web/src/` (`CallsTable.tsx`, `HistoryRuns.tsx`); `templates/report/report.css`; the verdict 6151652627 on #335.
- **Do**: the stacked-table label check exempts cells that hold a link or a button, so a text column made only of links (Transcript in the calls table, Open in history) can lose its label unnoticed: check those cells too, by their link text. The static report's Cards table breaks words in the middle at 360 px ("Cata/log"): break at word boundaries only.
- **Delivers**: the stricter check and the report CSS.
- **Done when**: removing the label of the Transcript or Open cell fails the sweep; no mid-word break in the report at 360 px; `npm run verify` and the visual sweep green.
- **Refs**: RNF-010, DEC-71, P1-136 (verdict 6151652627 on #335).

### P1-152 - Follow-up: sweep the folders of deleted projects

- **Difficulty**: 6 (sonnet)
- **Size**: S
- **Depends on**: P1-138
- **Gate**: none
- **Status**: Todo
- **Reads**: `src/application/projects/delete-project.ts`; the project repositories; `docs/data-model.md` section 9; the verdict 6153137792 on #348; RF-1012, DEC-55, Q-16.
- **Do**: since P1-138 the rows of a project are deleted before its folder, so a folder that cannot be removed, or a crash after the commit, leaves a folder with no row and no way to retry from the app. Add a sweep that removes project and run folders with no row, at start-up and daily, logs each removal, never touches a folder that still has a row, and is tested on both repositories. Built after the milestone unless the owner says otherwise (agenda).
- **Delivers**: the sweep and its tests.
- **Done when**: an orphaned project folder is removed by the next sweep; a folder with a row is never removed; `npm run verify` green.
- **Refs**: RF-1012, DEC-55, Q-16, P1-138 (verdict 6153137792 on #348).

### P1-153 - Follow-up: token scheme words before flags and operators

- **Difficulty**: 5 (haiku)
- **Size**: S
- **Depends on**: P1-148
- **Gate**: none
- **Status**: Done
- **Reads**: `src/infrastructure/guards/secret-masker.ts`; `tests/support/secret-command-shapes.ts`; the masker speed test; the verdict 6157434972 on #363.
- **Do**: since P1-148 the run of scheme words after `--token` is atomic, so a scheme word followed by a flag or a shell operator is no longer masked (`--token Negotiate --verbose`, `--token Bearer > out`, `--token Bearer ; ls`); main before P1-148 masked them. Also `--token Bearer-x S` and `--token Bearerx S` take the word as the value and leave `S` visible. Mask these on the safe side without bringing back the quadratic case: keep the P1-148 speed cases green and masking idempotent.
- **Delivers**: the masker change and its tests.
- **Done when**: every shape above is masked; the P1-148 speed cases still pass at the 1 MB bound; `mask(mask(x))` equals `mask(x)`; `npm run verify` green.
- **Refs**: RNF-005, RF-408, P1-148 (verdict 6157434972 on #363).

### P1-154 - Follow-up: secret masking gaps after P1-153 and P1-100

- **Difficulty**: 6 (sonnet)
- **Size**: S
- **Depends on**: P1-153, P1-100
- **Gate**: none
- **Status**: Done
- **Reads**: `src/infrastructure/guards/secret-masker.ts`; `src/infrastructure/scan/universal/sql-script.ts`; `tests/support/secret-command-shapes.ts`; the masker speed test; `tests/unit/infrastructure/scan/universal/sql-key-property.test.ts`; the verdicts 6158526651 on #369 and 6159639314 on #373.
- **Do**: these shapes still show a secret, all the same on main before the two cards: a shell line continuation (a backslash, `^` or a backtick at the end of the line) between `--token Bearer` and the value; `--token Bearer -<value>`; `--token Bearer-x "<value>"`; and in a SQL script, a line holding the END and the BEGIN of a key followed by a statement-looking line leaks key text. Mask each on the safe side, keep the P1-148 speed cases green at the 1 MB bound and masking idempotent, and add the new SQL shapes to the seeded property test.
- **Delivers**: the masker and SQL script changes and their tests.
- **Done when**: every shape above is masked or kept out of the statements; the speed and property tests still pass; `npm run verify` green.
- **Refs**: RNF-005, RF-408, P1-153 (verdict 6158526651 on #369), P1-100 (verdict 6159639314 on #373).

### P1-155 - Follow-up: test flakes seen on 2026-10-14

- **Difficulty**: 5 (haiku)
- **Size**: S
- **Depends on**: P1-150
- **Gate**: none
- **Status**: Done
- **Reads**: `tests/e2e/journeys/server-key-cap.spec.ts`; `tests/integration/infrastructure/files/grep-worker.test.ts`; `tests/e2e/support/caps-lock.ts`; `tests/e2e/support/live-run-page.ts`; the CI runs of #366 (38492853305) and #373; the verdicts on #367 and #372.
- **Do**: (1) `server-key-cap.spec.ts` failed once on CI shard 1 with ENOENT on a `.tmp` file during a rename (#366): find the writer that races and make it safe. (2) `grep-worker.test.ts` crashed a worker on `verify (windows-latest)` with exit 0xC0000005 once (#373): find whether a worker is left running or killed too early and make the test deterministic. (3) The EPERM retry in `caps-lock.ts` has no test: inject the error through a seam and test the bounded retry. (4) The cause of the shared-account flake fixed by #372 is not pinned by a test (a reload right after the create click survived 15 repeats): add a test that fails with that reload, or say why none can.
- **Delivers**: the fixes and tests.
- **Done when**: each item has a test that fails without its fix, or, for a flake that cannot be forced, thirty green repeats with four workers before and after; `npm run verify` and `npm run test:e2e` green.
- **Refs**: RNF-001, RNF-003, P1-150 (verdicts on #367 and #372).

### P1-156 - Follow-up: small test and document gaps from 2026-10-14

- **Difficulty**: 3 (haiku)
- **Size**: S
- **Depends on**: P1-125, P1-99, P1-102, P1-151
- **Gate**: none
- **Status**: Done
- **Reads**: `src/infrastructure/providers/ollama/ollama-provider.ts`; `src/infrastructure/config/environment.ts`; `tests/unit/infrastructure/config/environment-parse-budget.test.ts`; `docs/providers.md`; `templates/report/report.css`; the verdicts 6159080232 on #371, 6159923882 on #374, 6160341905 on #375 and 6158433278 on #366.
- **Do**: (1) no test covers the Ollama provider default `options.contextCache ?? processCache` (a fresh cache per provider passes every test): add one. (2) No test pins `ROSETTA_SCAN_PARSE_BUDGET_MS=""` as unset (Compose passes an empty value when it is not set): add the case. (3) `docs/providers.md` RST-1511 row: also name the no-break space (U+00A0) that `isUsableKey` refuses. (4) The `templates/report/report.css` comment says "below 720 px" while the query is `max-width: 720px`: make the comment exact.
- **Delivers**: the tests and the text fixes.
- **Done when**: each new test fails when its guarded line is mutated; `npm run verify` green.
- **Refs**: RF-401, RF-110, RNF-003, RNF-010, P1-125, P1-99, P1-102, P1-151.

### P1-157 - Follow-up: bound the audit writes of refused requests

- **Difficulty**: 9 (opus)
- **Size**: M
- **Depends on**: P1-49
- **Gate**: none
- **Status**: Done
- **Reads**: `docs/verification/m1-matrix.md` F-01 and PC-01; `src/presentation/web/access-hooks.ts`; `src/presentation/web/server.ts`; `src/presentation/web/session-routes.ts`; `src/presentation/web/route-access.ts`; `src/application/use-cases/record-refused-request.ts`; `docs/security/threat-model.md`; architecture section 10.
- **Do**: owner question first (handoff agenda 28; DEC-124 keeps every refusal row, so this changes it). Default: one limit per client address covers every writer of a `request.refused` row (the `Origin` refusal, the route rate limits' `onExceeded`, the in-flight bounds of sign-in and password change, and any other): up to 30 rows a minute per address, then one `request.refused` row with reason `rate-limit` and a count for the rest of that minute, while the requests are still refused with their usual status; the stored path (audit `target_id`, the security event's message and data) is cut to 512 characters with a marker that it was cut. Record the DEC. Failing tests first; update architecture section 10 and the threat model.
- **Delivers**: the limit, the cut, the tests and the document edits.
- **Done when**: 1,000 cross-origin POSTs from one address in a minute write at most 31 audit rows; 1,000 same-origin `POST /api/session` requests from one address in a minute write at most 31 audit rows; a refused request with a 16 KB path stores at most 512 characters of it in the audit row and the log; a signed-in user's refusals below the limit still each write a row; the DEC row exists; `npm run verify` green.
- **Refs**: RF-1009, RF-1100, RF-1109, RF-009, DEC-124, DEC-132, P1-49 (F-01, verdicts 6165183598 and 6165270947 on #388).

### P1-158 - Follow-up: keep the migrator credentials out of the serving process

- **Difficulty**: 9 (opus)
- **Size**: M
- **Depends on**: P1-49
- **Gate**: none
- **Status**: Done
- **Reads**: `docs/verification/m1-matrix.md` F-02, F-19 and PC-02; `compose.yaml`; `src/infrastructure/config/environment.ts`; the migration runner; ADR-014; ADR-016; `docs/runbooks/local.md`.
- **Do**: run the migrations with `DATABASE_MIGRATOR_URL` in a one-off step (a `migrate` service or command in `compose.yaml`, the same in the P1-55 host procedure) that ends before the server starts, and start the server with `DATABASE_URL` only; the server refuses to start when given a migrator URL it does not need, and warns when `DATABASE_URL` connects as the schema owner. If this alters ADR-014 or ADR-016, open the amendment first as its own PR for the owner to merge (handoff agenda 29). Add the residual risk to the threat model until it lands.
- **Delivers**: the Compose and start-up change, the tests, the runbook and threat-model edits.
- **Done when**: the app container's environment holds no migrator password (`docker compose exec app env`); an integration test shows the server's credential cannot update or delete `audit_events` or `cost_ledger`; the Compose smoke job passes; `npm run verify` green.
- **Refs**: RF-1302, RF-1305, ADR-014, ADR-016, P1-49 (F-02, F-19).

### P1-159 - Follow-up: security documentation drift from P1-49

- **Difficulty**: 3 (haiku)
- **Size**: S
- **Depends on**: P1-49
- **Gate**: none
- **Status**: Done
- **Reads**: `docs/verification/m1-matrix.md` PC-04; `docs/security/threat-model.md`; `SECURITY.md`; `src/presentation/web/server.ts`; `docs/orchestration/README.md` section 5.1.
- **Do**: in `docs/security/threat-model.md` reword TB4 (model output used only as checked read-only paths), mark the release, SBOM and GHCR controls of TB7 and A03 as arriving with P1-55, and LLM09 and LLM10 as partial until P2-02 and P2-08; in `SECURITY.md` say no release is published yet; fix the comment at `src/presentation/web/server.ts:220`; list the three known false positives next to the greps of orchestration README section 5.1 in a note for the owner (that README is owner-merged; put the note in the PR body if the file cannot change here).
- **Delivers**: the text fixes.
- **Done when**: each listed sentence matches the code; `npm run verify` green.
- **Refs**: ADR-013, RNF-003, P1-49 (F-07, F-11, F-16, F-22, F-23, F-24).

### P1-160 - Follow-up: security hardening gaps from P1-49

- **Difficulty**: 9 (opus)
- **Size**: M
- **Depends on**: P1-49
- **Gate**: none
- **Status**: Done
- **Reads**: `docs/verification/m1-matrix.md` PC-05; the snapshot reader; `src/infrastructure/files/grep-runner.ts`; the event-stream routes; `access-hooks.ts`; architecture section 10.
- **Do**: test first for each: count decompressed bytes (and skipped entries) against the snapshot byte limit; cap the total bytes one grep reads and set worker `resourceLimits`; end a user's open event streams when the session ends or the account is disabled; record the actor of a cross-origin refusal when a valid session cookie is present; audit the 429 of the password-change bound; send stream replay failures to the application log.
- **Delivers**: the six fixes with tests.
- **Done when**: each behaviour has a failing-then-passing test named after its requirement; architecture section 10 matches; `npm run verify` green.
- **Refs**: RF-127, RF-146, RF-1101, RF-1109, RF-009, P1-49 (F-05, F-06, F-09, F-10, F-12, F-14).

### P1-161 - Follow-up: security test and supply-chain gaps from P1-49

- **Difficulty**: 6 (sonnet)
- **Size**: M
- **Depends on**: P1-49
- **Gate**: none
- **Status**: Done
- **Reads**: `docs/verification/m1-matrix.md` PC-06; the archive tests; `tests/e2e/live-run.spec.ts`; `tests/e2e/run-report.spec.ts`; `pages-site.test.ts`; `.github/dependabot.yml`; `.github/workflows/`; `src/infrastructure/db/`.
- **Do**: hostile archives with backslash, drive-letter, device and FIFO entries; the hostile card in `live-run.spec.ts` and `run-report.spec.ts`; a test that fails while `PublicAddressAgent` is not used by an adapter that connects to a stored base URL (to be met by P2-09; mark it expected-to-fail with a reason if the runner allows, else document it in the PR); a key-pattern scan of `site/` in `pages-site.test.ts`; a Dependabot `docker` entry (with the DEC-125 cooldown); CI service images pinned by digest; a lint or test that finds SQL text built with `${` anywhere in `src/infrastructure/db/`; `CREATE` in `public` refused for `rosetta_app`; provenance notes for the remaining fixture and recording folders.
- **Delivers**: the tests and the configuration changes.
- **Done when**: each new test fails when its control is removed (verifier mutation); `npm run verify` green.
- **Refs**: RF-122, RF-127, RF-507, RF-1104, RNF-003, RNF-009, ADR-016, DEC-125, P1-49 (F-04, F-08, F-13, F-15, F-17, F-18, F-20, F-21, F-25).

### P1-162 - Follow-up: mask a token value after `--token=` and a line continuation

- **Difficulty**: 6 (sonnet)
- **Size**: S
- **Depends on**: P1-154
- **Gate**: none
- **Status**: Todo
- **Reads**: `src/infrastructure/guards/secret-masker.ts`; `tests/support/secret-continuation-shapes.ts`; `tests/unit/infrastructure/guards/secret-masker.test.ts`; `secret-masker-performance.test.ts`; verdict 6165263754 on #389.
- **Do**: `--token=` followed by a line continuation (`\`, `^` or a backtick at the end of the line, LF or CRLF) and then the value leaves the value visible (on main too). Add the shapes to the continuation fixture, failing first, then mask them; keep `mask(mask(x)) == mask(x)` and the P1-148 1 MB speed cases.
- **Delivers**: the masker change and the tests.
- **Done when**: the new shapes are masked and fail when the rule is removed; the speed cases stay green; `npm run verify` green.
- **Refs**: RNF-003, RF-408, P1-154, P1-153.

### P1-163 - Follow-up: small gaps from P1-96, P1-104, P1-106, P1-137 and P1-155

- **Difficulty**: 4 (haiku)
- **Size**: M
- **Depends on**: P1-96, P1-104, P1-106, P1-137, P1-155
- **Gate**: none
- **Status**: Done
- **Reads**: `docs/conventions.md`; `docs/data-model.md`; the web queue-position poll; `tests/integration/presentation/web/limits.test.ts`; `run-budget-events.ts`; `docs/architecture.md` (port rows near lines 314-325); the Projects page; `node-output-writer.ts`; the verdicts on #385, #384, #386, #387 and #382.
- **Do**: (1) list RST-1007 (`settingsVersionStale`, 409) in `docs/conventions.md` and the settings sentence of `docs/data-model.md`. (2) The queued-run position poll retries every 2 s forever: back off (2 s doubling to 30 s) and stop when the page is hidden. (3) Move the `new Date` in `limits.test.ts` behind the `tests/support` clock. (4) Remove the duplicate comment and wrap the comment lines over 100 columns at `run-budget-events.ts:135`. (5) An end-to-end case sends a tool result holding backticks through the fake Ollama server and checks the fence is longer. (6) Add the new overview methods to the architecture port rows. (7) The Projects overview shows only the newest 100 projects: show a notice saying so when there are more (handoff agenda 34). (8) `node-output-writer`: a test for a non-ENOENT error after the folder is gone.
- **Delivers**: the fixes and tests.
- **Done when**: each code change has a test that fails without it; `npm run verify` green.
- **Refs**: RNF-008, P1-96, P1-104, P1-106, P1-137, P1-155.

### P1-164 - Follow-up: Windows test-worker crashes in CI

- **Difficulty**: 7 (sonnet)
- **Size**: S
- **Depends on**: P1-155
- **Gate**: none
- **Status**: Done
- **Reads**: `src/infrastructure/files/grep-runner.ts`; `tests/integration/infrastructure/files/grep-worker.test.ts`; `tests/integration/infrastructure/files/node-repository-reader.test.ts`; CI runs 38541463529 (#385, exit 3221226505 = 0xC0000409) and the #373 run (0xC0000005).
- **Do**: the vitest fork worker on `windows-latest` dies with 0xC0000005 or 0xC0000409 while running the grep and repository-reader tests, about once a day; reruns pass. A candidate cause is `grep-runner.ts:43,48` terminating the worker thread right after its answer. Reproduce under load on Windows (repeat the two files 50 times with 4 workers), find the cause, fix it (for example let the worker exit on its own, or await `terminate()`), and add a test that fails on the old shape when possible; otherwise record the evidence in the PR.
- **Delivers**: the fix and the evidence.
- **Done when**: 50 repeats on Windows pass with no worker crash; `npm run verify` green.
- **Refs**: RNF-008, P1-155.

### P1-165 - Follow-up: small gaps from P1-84, P1-161 and P1-164

- **Difficulty**: 5 (haiku)
- **Size**: S
- **Depends on**: P1-84, P1-161, P1-164
- **Gate**: none
- **Status**: Done
- **Reads**: `web-lint.config.ts`; `tests/e2e/support/serve.ts`; the writable-temp-root helper; `tests/support/sql-template-scan.ts`; `src/infrastructure/files/grep-runner.ts`; the verdicts on #391, #403 and #402.
- **Do**: (1) the RF-507 lint does not refuse `el.setAttributeNS(null, "srcdoc", x)`, destructuring (`const { setHTMLUnsafe } = el`) or a template-literal computed key: add fixtures, failing first, then the selectors. (2) No test shows `serve.ts` clears the data folder through the writable helper: add one. (3) The helper can `chmod` through a symlinked root: refuse a symlinked root. (4) The SQL `${}` scan misses a template in `COPY ... TO STDOUT` outside a `query(` argument: add the case. (5) `grep-runner.ts`: the "worker exits without an answer" branch and "first verdict wins" have no test: add both (a fake worker).
- **Delivers**: the fixes and tests.
- **Done when**: each new test fails when its guard is removed; `npm run verify` green.
- **Refs**: RF-507, RNF-005, RNF-008, RF-146, P1-84, P1-161, P1-164.

### P1-166 - Follow-up: bugs from the owner's local test on 2026-10-14

- **Difficulty**: 7 (sonnet)
- **Size**: M
- **Depends on**: P1-108, P1-147
- **Gate**: none
- **Status**: Done
- **Reads**: the card parser and citation schema; `web/src/lib/live-run/claim-events.ts`; `web/src/pages/ClaimsList.tsx`; the start page; `docs/runbooks/local.md` section 1; the run page data loading.
- **Do**: (1) accept `path:N` as `path:N-N` (RF-207); a recorded gemma4 answer with one-line citations must produce cards. (2) Honest verification labels (RF-1014): "citations checked" with the note, in the claims list, stepper and run summary. (3) Warn on a code map from an older scanner (RF-113): the code map records the scanner version; the start page offers a new scan first. (4) Runbook: an install that used the all-zero placeholder key moves it to `ROSETTA_SECRET_KEY_PREVIOUS` before setting a new key, so stored provider keys are re-encrypted, then removes it after the start-up log reports the re-encryption. (5) The live run page fetches `GET /api/runs/:id` several times a second during a run: refetch at most once per second, driven by the event stream.
- **Review probes**: citations `a.cs:30`, `a.cs:30-30`, `a.cs:0`, `a.cs:31-30`, `a.cs:` and a Windows path; a code map without a version; a run with 500 events in 10 s (count the run reads).
- **Delivers**: fixes, tests, the runbook text.
- **Done when**: each item has a test that fails without it; `npm run verify` green.
- **Refs**: RF-113, RF-202, RF-207, RF-1004, RF-1014, RNF-003, DEC-136.

### P1-167 - Read before answering and questions only the code cannot answer

- **Difficulty**: 8 (sonnet)
- **Size**: M
- **Depends on**: P1-166
- **Gate**: none
- **Status**: Done
- **Reads**: the agent loop; the reader prompt; the `OQ` schema; RF-206, RF-243; the `invalid-output` and transcripts of the owner's 2026-10-14 run as examples.
- **Do**: refuse a final answer from a reader that has read none of its area's files and tell it which files to read (RF-206); the `OQ` schema needs what the code shows, a citation and a question about something outside the code, and a question asking what the code, an area or the application does is refused with a repair message (RF-243); duplicate questions across areas are merged and grouped by feature or area; an area of third-party or generated code writes no question. Prompts versioned; recordings.
- **Review probes**: "What does this area do?", "What is the purpose of the application?", "What is the business logic of X?" (refused); "Who uses these pages?" with a citation (kept); the same question from three areas (merged once with three citations); an agent answering at turn 1 with no reads.
- **Behaviour to preserve**: good `OQ` cards that cite code and ask about intent keep working; answers already in `answers.md` stay attached to their questions.
- **Delivers**: loop and schema changes, prompts, recordings, tests.
- **Done when**: every RF-206 and RF-243 scenario has a passing test; `npm run verify` green.
- **Refs**: RF-202, RF-206, RF-240, RF-243, DEC-136.

### P1-168 - Overview of the application before any question

- **Difficulty**: 8 (sonnet)
- **Size**: M
- **Depends on**: P1-167
- **Gate**: none
- **Status**: In progress
- **Reads**: RF-264; the summariser role configuration; the spec writer.
- **Do**: after understand, the `summariser` role writes `overview.md` from the cards whose citations passed (what the application is, who uses it, features, screens, data, integrations, what was not covered), each statement linking its cards and no statement without a card; a thin run says so and suggests the next step; `spec.md` and the Markdown report open with it; the run page shows it first (with P1-170). Prompt versioned; the budget guard and the estimate include the call.
- **Review probes**: a run whose cards are mostly third-party (the overview says the run cannot explain the application yet); a model answer holding a statement with no card link (dropped); hostile card text (rendered as text).
- **Delivers**: the use case, prompt, writer, recordings, tests.
- **Done when**: every RF-264 scenario has a passing test; `npm run verify` green.
- **Refs**: RF-204, RF-264, RF-420, RF-427, RF-504, RF-507, DEC-136.

### P1-169 - Run page while running: journey, living code map and tabs

- **Difficulty**: 8 (sonnet)
- **Size**: M
- **Depends on**: P1-166
- **Gate**: none
- **Status**: Done
- **Reads**: `docs/design/proposals/run-page-v2.html` (the reference); `web/src/pages/LiveRunPage.tsx` and its parts; `docs/design-system.md`; RF-1002..RF-1005, RF-1010, RF-1011, RF-1015, RF-1016.
- **Do**: rebuild the running state of the run page as the proposal shows: the run journey, the living code map (tiles sized by tokens, states, hatched third-party areas, reduced motion), spend for the run, "working now" (three agents in plain words), and tabs for cards so far, all agents and activity (events, calls, logs). Existing data sources and event handling are reused; no API change. Update `docs/design-system.md` with the new components.
- **Review probes**: 1 area and 120 areas; a 60-character area name; an area name holding HTML; light and dark; 360 px wide; keyboard only; reduced motion; a run that fails at the first step.
- **Behaviour to preserve**: every figure the current page shows (RF-1003 cost, RF-1010 project totals, RF-1011 calls and logs) is still reachable within one click.
- **Delivers**: components, page, tests, design-system update.
- **Done when**: every RF-1015 (first and third scenarios) and RF-1016 scenario has a passing test; the page matches the proposal in light and dark at desktop and phone widths; `npm run verify` and `npm run test:e2e` green.
- **Refs**: RF-1002..RF-1005, RF-1010, RF-1011, RF-1015, RF-1016, RNF-010, ADR-012, DEC-137.

### P1-170 - Run page after the run: overview, your turn, questions, evidence

- **Difficulty**: 8 (sonnet)
- **Size**: M
- **Depends on**: P1-168, P1-169
- **Gate**: none
- **Status**: Todo
- **Reads**: `docs/design/proposals/run-page-v2.html`; RF-1007, RF-1014, RF-1015, RF-1017.
- **Do**: the ended state of the run page as the proposal shows: the Overview tab first, the "Your turn" panel with the run facts, the Your questions tab (question, why the code cannot answer it with its citation, what depends on it, answer field, default), the Evidence tab (cards, claims, coverage, code map) and the Activity tab (replay, events, calls, logs); the page switches modes when the run ends.
- **Review probes**: a run with no questions; 40 questions; an overview that says the run could not explain the application; a failed run (no overview; the page says what failed and what to do); the switch while the page is open.
- **Behaviour to preserve**: answering questions still writes `answers.md` (RF-240, RF-1007); report and download links stay one click away.
- **Delivers**: components, page, tests.
- **Done when**: every RF-1015 (second scenario) and RF-1017 scenario has a passing test; `npm run verify` and `npm run test:e2e` green.
- **Refs**: RF-240, RF-1007, RF-1008, RF-1014, RF-1015, RF-1017, RF-264, RNF-010, DEC-137.

### P1-171 - Follow-up: keep valid cards and retry failed agent tasks

- **Difficulty**: 8 (sonnet)
- **Size**: M
- **Depends on**: P1-166
- **Gate**: none
- **Status**: Done
- **Reads**: the card parser and repair path (RF-202); the agent loop; the run end state; the `invalid-output` folders of the owner's runs `20261014-145748-understand`, `20261014-153115-understand` and `20261014-154704-understand` (11 of 41, 11 of 42 and 6 of 16 tasks failed; in the third run, with library areas left out, all 6 were one-line citations and they included Models, Services, ViewModel and Setup).
- **Do**: as RF-208: take the JSON out of prose or a fence; keep valid claims and cards, drop and list invalid ones; a second, targeted repair; ask a cut-off answer to continue; retry a task with no usable cards once with a fresh conversation (split an area too large for the context); report failed areas in the coverage and the run summary with "Retry failed areas"; a run with failed areas never shows as a plain success.
- **Review probes**: the recorded failing answers of both runs (each must yield its valid cards); an answer that is all prose; JSON with a trailing comma; an answer cut mid-string; a card whose every claim is invalid; a model that fails the same way three times (the run still ends, with the area marked failed and no endless loop).
- **Behaviour to preserve**: valid answers parse exactly as today; the budget guard counts every repair and retry; a task never runs more than its turn limit plus one retry.
- **Delivers**: parser, loop and summary changes, recordings, tests.
- **Done when**: every RF-208 scenario has a passing test; replaying the two recorded runs loses no area to a format error; `npm run verify` green.
- **Refs**: RF-201, RF-202, RF-208, RF-230, RF-420, DEC-138.

### P1-172 - Follow-up: choose areas quickly on the start page

- **Difficulty**: 6 (sonnet)
- **Size**: S
- **Depends on**: P1-166
- **Gate**: none
- **Status**: Done
- **Reads**: the start page and its area list; P1-147 (third-party default); `docs/design/proposals/run-page-v2.html` (look and tokens); RF-1018.
- **Do**: as RF-1018: only own code listed and selected; third-party and generated code folded into one collapsed line after the list ("12 library areas left out ... Show") that expands to the areas and their reason; Select all, Select none and Own code only buttons; a filter; the list scrolls inside its panel; a summary bar with areas, files, estimate and Start stays visible; a one-time confirmation when third-party areas are chosen.
- **Review probes**: 1 area; 120 areas; every area third-party; a 60-character area name; keyboard only; 360 px wide; Start pressed with nothing selected (disabled, with the reason).
- **Behaviour to preserve**: the estimate, caps and confirm-threshold behaviour of the start page (P1-91, P1-106) are unchanged.
- **Delivers**: the page changes and tests.
- **Done when**: every RF-1018 scenario has a passing test; `npm run verify` and `npm run test:e2e` green.
- **Refs**: RF-1001, RF-1018, RF-427, RNF-010, DEC-138.

---

## Phase 2 - Full understand

Sized, not dated, until Q-01 is answered (roadmap.md).

### P2-01 - Resume a stopped run

- **Difficulty**: 8 (sonnet)
- **Size**: M
- **Depends on**: P1-33, P1-35, P1-40
- **Gate**: none
- **Status**: Done
- **Reads**: `docs/architecture.md` section 8; `docs/data-model.md` section 3.6.
- **Do**: `ResumeRun`: after the cap is raised, process only unfinished tasks and `Unverified` claims into the same run folder and manifest; the Resume button on the run and history pages; claims left unjudged at a cap are `Unverified`.
- **Delivers**: the use case, route and buttons; integration tests with the fake provider; an E2E spec.
- **Done when**: every RF-006 and RF-304 scenario has a passing test.
- **Refs**: RF-006, RF-304, ADR-007, DEC-13.

### P2-02 - Verifier judgement step

- **Difficulty**: 9 (opus)
- **Size**: M
- **Depends on**: P1-33, P1-35
- **Gate**: none
- **Status**: Done
- **Reads**: `docs/adr/ADR-005-evidence-cards-and-two-step-verifier.md`; `docs/architecture.md` section 8 (verifier role).
- **Do**: step 2 with the `verifier` role: the model sees the claim and only the cited lines with a small margin, answers with the reason before the verdict, one retry on an invalid answer, otherwise `Unverified`; a warning when reader and verifier share a model family; `prompts/verifier/claim.v1.md` with the data-block rule; verdict events for the live page.
- **Delivers**: the step, the prompt, recordings; integration tests with recorded responses; a unit test on the family check.
- **Done when**: every RF-301 scenario has a passing test; the live page shows `Supported` and `Rejected` from recorded events (E2E).
- **Refs**: RF-301, RF-1004, ADR-005, ADR-013, DEC-19, DEC-57.

### P2-03 - Verification summary and verifier calibration

- **Difficulty**: 7 (sonnet)
- **Size**: M
- **Depends on**: P2-02, P2-11
- **Gate**: none
- **Status**: Todo
- **Reads**: `docs/data-model.md` section 3.19; `docs/adr/ADR-008-testing-with-recorded-responses.md`.
- **Do**: the summary of claims per status per area and the supported share in the run summary and report; a calibration set of about 30 hand-labelled claims under `eval/calibration/`; `npm run eval -- --calibration` reporting agreement per model and the disagreements.
- **Delivers**: the summary writer, the calibration set, the eval mode; snapshot and integration tests.
- **Done when**: every RF-303 and RF-305 scenario has a passing test or a recorded evaluation run.
- **Refs**: RF-303, RF-305, ADR-005, ADR-008, DEC-57.

### P2-04 - Coverage per area

- **Difficulty**: 6 (sonnet)
- **Size**: M
- **Depends on**: P1-33
- **Gate**: none
- **Status**: Done
- **Reads**: `docs/data-model.md` section 3.8.
- **Do**: `coverage.json` and `coverage.md` per run: every file in each area as read (with line ranges) or not read, and the share of area tokens read in the run summary.
- **Delivers**: the writer; integration tests with the fake provider.
- **Done when**: the RF-230 scenario has a passing test.
- **Refs**: RF-230, ADR-005.

### P2-05 - Re-run with answers

- **Difficulty**: 8 (sonnet)
- **Size**: M
- **Depends on**: P1-39
- **Gate**: none
- **Status**: Done
- **Reads**: `docs/data-model.md` section 3.16; `docs/architecture.md` section 6 (`RunUnderstand` options).
- **Do**: the "with answers" option of `RunUnderstand`: affected areas run again with the answers as context, answered `OQ` cards marked `Answered`, new and changed cards listed in the run summary.
- **Delivers**: the option, prompt changes as a new prompt version, recordings; integration tests.
- **Done when**: the RF-241 scenario has a passing test.
- **Refs**: RF-241, RF-1007, ADR-003, DEC-15.

### P2-06 - Consolidate cards across areas

- **Difficulty**: 8 (sonnet)
- **Size**: M
- **Depends on**: P1-33
- **Gate**: none
- **Status**: Done
- **Reads**: `docs/architecture.md` section 8 (summariser role).
- **Do**: consolidation with the `summariser` role: duplicate entities and rules from several areas merged into one card keeping every citation; the merge recorded; `prompts/summariser/merge.v1.md`.
- **Delivers**: the step, prompt, recordings; integration tests.
- **Done when**: the RF-250 scenario has a passing test; no citation is lost in a merge (test).
- **Refs**: RF-250, ADR-005.

### P2-07 - Excerpt size limit

- **Difficulty**: 5 (haiku)
- **Size**: S
- **Depends on**: P1-31
- **Gate**: none
- **Status**: Done
- **Reads**: `docs/data-model.md` section 3.1 (limits).
- **Do**: `read_file` cuts a request beyond the configured maximum lines and tells the agent the remaining range.
- **Delivers**: the change and unit tests.
- **Done when**: the RF-144 scenario has a passing test.
- **Refs**: RF-144, ADR-006.

### P2-08 - Estimate confirmation, caps per role and unpriced models

- **Difficulty**: 8 (sonnet)
- **Size**: M
- **Depends on**: P1-30, P1-34
- **Gate**: none
- **Status**: Done
- **Reads**: `docs/adr/ADR-007-cost-control.md`.
- **Do**: the confirmation threshold on the start page (RF-425 second scenario); caps per role in the budget guard; a non-local model missing from the price table stops the run unless allowed, then cost shows as unknown and only the token cap applies.
- **Delivers**: the changes; integration and E2E tests.
- **Done when**: the second RF-425 scenario and every RF-423 and RF-427 scenario have passing tests.
- **Refs**: RF-423, RF-425, RF-427, ADR-007, DEC-97.

### P2-09 - Anthropic adapter

- **Difficulty**: 7 (sonnet)
- **Size**: M
- **Depends on**: P1-29
- **Gate**: none
- **Status**: Done
- **Reads**: `docs/adr/ADR-003-provider-swappable-agent-loop.md`; `docs/providers.md`.
- **Do**: `AnthropicProvider` on `@anthropic-ai/sdk`: tool calling, the stable prompt prefix marked for caching, cached-token usage, retries; key from the provider set; the Anthropic section of `docs/providers.md`.
- **Delivers**: the adapter, recordings, the contract suite run on it; one live call by the owner recorded.
- **Done when**: every RF-404 scenario has a passing test; an npm `live:anthropic` script loads `.env` itself (as `node --env-file=.env`) and passes against the owner's key.
- **Refs**: RF-404, ADR-003, ADR-008.

### P2-10 - OpenAI-compatible adapter

- **Difficulty**: 9 (opus)
- **Size**: M
- **Depends on**: P1-29
- **Gate**: none
- **Status**: Done
- **Reads**: `docs/adr/ADR-003-provider-swappable-agent-loop.md`; RF-1104; DEC-112; `docs/security/threat-model.md` (SSRF row); `src/infrastructure/security/public-address-agent.ts`.
- **Do**: `OpenAiCompatibleProvider` with a base URL and key from the provider set (URL rules of RF-1104), same contract; a section in `docs/providers.md`.
- **Delivers**: the adapter, recordings, the contract suite run on it.
- **Done when**: the RF-403 scenario has a passing test; every request of the adapter goes through a dispatcher whose connect uses `publicOnlyLookup` and refuses internal IP literals (P1-11 built the check but no adapter used it); redirects are not followed or each one is checked again; a DNS rebinding test and an internal-literal test on the adapter pass; the verifier-opus security review passes.
- **Refs**: RF-403, RF-1104, ADR-003.

### P2-11 - Golden set and the evaluation runner

- **Difficulty**: 9 (opus)
- **Size**: L
- **Depends on**: P2-02
- **Gate**: none
- **Status**: In progress
- **Reads**: `docs/data-model.md` section 3.19; `docs/rfc/RFC-001-rosetta.md` section 7.
- **Do**: the golden set for the demo app under `eval/golden/` (hand-checked features, rules, entities and "not in the code" cases); `npm run eval` running each case at least 3 times with the chosen models, saving results with date, models, model versions, prompt hashes and settings, reporting precision of `Supported` claims, recall of golden rules, citation validity, the spread, and estimate accuracy against `cost.json`.
- **Delivers**: the golden set, runner, output schema; a schema test; the first recorded evaluation.
- **Done when**: RNF-006, RNF-012 and RNF-015 each have a recorded evaluation or a passing schema test; the runner uses the fake provider in its own tests.
- **Refs**: RNF-006, RNF-012, RNF-015, ADR-008, DEC-57.

### P2-12 - Backups and restore drill

- **Difficulty**: 6 (sonnet)
- **Size**: M
- **Depends on**: P1-55
- **Gate**: none
- **Status**: Todo
- **Reads**: `docs/environments-and-delivery.md` section 12; `docs/runbooks/deploy.md`.
- **Do**: daily database backups kept 7 days (host or scheduled `pg_dump`), weekly data-folder copy, a restore drill into the local Compose stack recorded in the runbook.
- **Delivers**: the backup configuration or script and the runbook section.
- **Done when**: the RF-1306 drill is recorded with its date.
- **Refs**: RF-1306, ADR-016.

### P2-13 - Full-understand end-to-end journeys

- **Difficulty**: 6 (sonnet)
- **Size**: M
- **Depends on**: P2-01, P2-03, P2-04, P2-05, P2-06, P2-08
- **Gate**: none
- **Status**: Todo
- **Reads**: `docs/process-flows.md` flows 2-4.
- **Do**: journeys: understand every area with both verifier steps, a cap stop and resume, answer questions and re-run, consolidation visible in the specification.
- **Delivers**: journey specs.
- **Done when**: the journeys pass headless in CI.
- **Refs**: RF-006, RF-241, RF-301, ADR-010.

### P2-14 - Phase 2 verification matrix and owner review

- **Difficulty**: 9 (opus)
- **Size**: S
- **Depends on**: P2-09, P2-10, P2-11, P2-12, P2-13
- **Gate**: none
- **Status**: Todo
- **Reads**: `docs/roadmap.md` (P2 exit criteria).
- **Do**: `docs/verification/p2-matrix.md` for every P2 requirement with its evidence; the golden-set result against the RFC success criteria; the owner's hands-on review agenda; gaps and the review's changes listed for the orchestrator to file as follow-up cards; the pyramid line.
- **Delivers**: the matrix and the list of gaps.
- **Done when**: no P2 Must lacks evidence or a follow-up card.
- **Refs**: RNF-005, RNF-006.

### P2-15 - Follow-up: settings sliders within the allowed ranges

- **Difficulty**: 5 (haiku)
- **Size**: S
- **Depends on**: P1-14, P1-80
- **Gate**: none
- **Status**: Done
- **Reads**: DEC-117; `docs/design-system.md`; `src/web/` settings page; P1-80.
- **Do**: show each numeric project setting as a slider limited to its DEC-117 range, with the template default marked; show a warning that suggests keeping the default when a value moves away from it; keyboard and screen-reader use as for the other controls.
- **Delivers**: the sliders, their warnings and tests.
- **Done when**: every numeric setting has a slider bounded by its range; a value away from the default shows the warning; the accessibility checks pass; `npm run verify` green.
- **Refs**: DEC-116, DEC-117, RF-002.

### P2-16 - Follow-up: price Anthropic cache writes

- **Difficulty**: 9 (opus)
- **Size**: M
- **Depends on**: P2-09
- **Gate**: none
- **Status**: Done
- **Reads**: `prices/default-prices.yaml` and its schema; `src/infrastructure/budget/`; `src/infrastructure/providers/anthropic/`; `docs/data-model.md` (cost ledger, cost report) and section 7 (migrations); ADR-007; verdict comment 6132492790 on pull request #210.
- **Do**: Anthropic bills prompt-cache writes at 1.25 times the input price, but the price table has no cache-write price, so the adapter counts cache-write tokens as plain input and the ledger understates the cost of those calls. Add a cache-write price per model to the price table (`prices/default-prices.yaml` and its schema); carry cache-write tokens through the usage record and the ledger (new columns through a new migration with the next free number of the release block, and `docs/data-model.md` in the same change); price them in the budget guard's worst case and in the settled cost; show them in the cost report.
- **Delivers**: the price field, the migration, the usage and ledger changes, the guard pricing and the report column, with unit, integration and contract tests.
- **Done when**: a recorded Anthropic call with cache-write tokens settles at the cache-write price and the reserved worst case covers it; a model without a cache-write price is handled as the price table rules say for a missing price; the cost report lists the cache-write tokens and cost; `npm run verify` green.
- **Refs**: RF-428, RF-404, ADR-007, P2-09 (verdict comment 6132492790 on #210; owner-approved 2026-10-12).

### P2-17 - Follow-up: move `@anthropic-ai/sdk` from 0.128.0 to the 0.133 line

- **Difficulty**: 5 (haiku)
- **Size**: S
- **Depends on**: P2-09
- **Gate**: none
- **Status**: Todo
- **Reads**: `package.json`; `package-lock.json`; `src/infrastructure/providers/anthropic/`; DEC-125; the verdict on #210.
- **Do**: not before 2026-10-23 (the 0.133 line must be two weeks old, DEC-125): move `@anthropic-ai/sdk` from the exact pin 0.128.0 (the owner's choice for P2-09) to the 0.133 line, keep the exact pin style, regenerate the lockfile so that `npm ci --ignore-scripts` passes, and run the Anthropic contract suite and `npm run live:anthropic` if G-04 is open.
- **Delivers**: the version change and the lockfile.
- **Done when**: `npm run verify` and the Anthropic adapter contract tests are green on the new version; the audit check passes.
- **Refs**: RF-404, ADR-013, DEC-125, P2-09 (owner chose the 0.128.0 pin on 2026-10-12).

### P2-18 - Flow and screen card types

- **Difficulty**: 7 (sonnet)
- **Size**: M
- **Depends on**: P2-06
- **Gate**: none
- **Status**: Done
- **Reads**: `src/domain/cards/card-vocabulary.ts`; `src/domain/cards/card.ts`; the card schema and parser; `docs/architecture.md` section 5 (state lists); `docs/adr/ADR-005-evidence-cards-and-two-step-verifier.md` (DEC-134 note).
- **Do**: add `FLOW` and `SCRN` to the card vocabulary (Q-24) with their schemas: `FLOW` (trigger, ordered steps each with a target card id when one exists and at least one citation, numbered branches, outcome) and `SCRN` (route or page, roles, fields with input kind, required flag and cited validations, actions naming a handler or `FLOW` id, "leads to" links); parser, repair path (RF-202), stable ids (RF-203), card files under `cards/flow/` and `cards/scrn/`, `index.json`; architecture section 5 lists the new types.
- **Delivers**: schemas, parser cases, card writers, tests.
- **Done when**: a valid and an invalid fixture of each type pass and fail the schema as RF-202 requires; a step without a citation is refused; `npm run verify` green.
- **Refs**: RF-202, RF-203, RF-204, RF-260, RF-261, ADR-005, DEC-134, Q-24.

### P2-19 - Agent prompts and area planning for flows and screens

- **Difficulty**: 8 (sonnet)
- **Size**: M
- **Depends on**: P2-18
- **Gate**: none
- **Status**: Done
- **Reads**: `prompts/`; the area planner (RF-200); the code map; `tests/recordings/`; RF-427 estimate code.
- **Do**: versioned prompt changes so the agent writes `FLOW` cards where the code map finds entry points (page actions, HTTP handlers, scheduled jobs, message handlers) and `SCRN` cards where it finds pages, forms, views or templates (Q-25); the code map marks those areas; suspected paths become `OQ` cards; record responses on the WebForms demo; the run estimate (RF-427) and coverage (RF-230) count the new types; an area with no pages reports "no screens found".
- **Delivers**: prompts, planner and code-map changes, recordings, integration tests.
- **Done when**: a recorded understand run of the demo yields `FLOW` cards for the order and catalogue journeys and `SCRN` cards for their pages, each step cited; a library-only area writes neither and its coverage says so; `npm run verify` green.
- **Refs**: RF-200, RF-230, RF-260, RF-261, RF-263, RF-427, DEC-134, Q-25.

### P2-20 - Verifier checks for flow steps and screen claims

- **Difficulty**: 8 (sonnet)
- **Size**: M
- **Depends on**: P2-18, P2-02
- **Gate**: none
- **Status**: In progress
- **Reads**: the verifier (RF-300..RF-305); `src/domain/cards/claim-transitions.ts`.
- **Do**: every `FLOW` step and every `SCRN` field validation and action is a claim checked by both verifier steps; a step whose citation is invalid or rejected is marked on the card and the flow is reported as incomplete in the card file, the specification and the coverage; calibration (RF-303) includes the new claims.
- **Delivers**: verifier changes and tests with recorded responses.
- **Done when**: a fixture flow with one bad step is shown as incomplete with that step marked; a fixture screen with a made-up validation has that claim `Rejected`; `npm run verify` green.
- **Refs**: RF-260, RF-261, RF-300..RF-305, ADR-005, DEC-134.

### P2-21 - Diagram generators with safe labels

- **Difficulty**: 9 (opus)
- **Size**: M
- **Depends on**: P2-18
- **Gate**: none
- **Status**: In review
- **Reads**: `docs/security/threat-model.md`; RF-507; RF-508; the Mermaid syntax reference for sequence, flowchart and entity-relationship diagrams.
- **Do**: pure functions in the domain or application layer that build Mermaid text from cards: a sequence diagram from a `FLOW` card, a flowchart screen map from `SCRN` cards, an entity-relationship diagram from `ENT` cards (unknown cardinality drawn as unknown); every label goes through one escaping function so that text from the analysed code cannot end a diagram, open a new statement, add a `click` or `href`, or carry HTML; ids are generated, never taken from the code. The model never writes Mermaid (DEC-134).
- **Delivers**: the generators, the escaping function, snapshot and property tests.
- **Done when**: names holding `end`, `;`, newlines, `-->`, `%%`, `click`, `<script>`, `"` and `javascript:` produce valid diagrams with the text shown literally (property test over generated names); the generated text parses with the pinned Mermaid parser in a test; `npm run verify` green.
- **Refs**: RF-260, RF-261, RF-262, RF-507, RF-508, ADR-013, DEC-134, Q-26.

### P2-22 - Legacy data model file and the new specification sections

- **Difficulty**: 6 (sonnet)
- **Size**: M
- **Depends on**: P2-19, P2-21
- **Gate**: none
- **Status**: Todo
- **Reads**: the `spec.md` writer (RF-204); consolidation (RF-250).
- **Do**: write `data-model.md` from verified `ENT` cards (entities, fields, keys, relations, citations, the generated ER diagram, a "to confirm" list for unknown relations; merged entities once); add the flows section, the screens section with the screen map, and the data-model link to `spec.md`, each item linking its card.
- **Delivers**: the writers and snapshot tests.
- **Done when**: every RF-262 and RF-263 scenario has a passing test; every `ENT` card appears once in `data-model.md`; `npm run verify` green.
- **Refs**: RF-204, RF-250, RF-262, RF-263, DEC-134.

### P2-23 - Golden set for flows, screens and the data model

- **Difficulty**: 7 (sonnet)
- **Size**: M
- **Depends on**: P2-11, P2-22
- **Gate**: none
- **Status**: Todo
- **Reads**: the golden set and the evaluation runner (P2-11); RFC-001 section 7.
- **Do**: add to the golden set the expected flows (journeys and their steps), screens (fields and actions) and entities with relations of the demo application, written by hand from the code; the evaluation runner reports step recall, screen field recall and relation precision next to the existing measures; P2-14's verification matrix includes RF-260..RF-263.
- **Delivers**: golden-set files, runner measures, a measured baseline.
- **Done when**: the runner prints the three new measures for a recorded run; the baseline is recorded in the PR; `npm run verify` green.
- **Refs**: RF-260..RF-263, RNF-006, RNF-012, P2-11, P2-14, DEC-134.

### P2-24 - Follow-up: cache-write prices in the estimate and own-key overrides

- **Difficulty**: 6 (sonnet)
- **Size**: S
- **Depends on**: P2-16
- **Gate**: none
- **Status**: Done
- **Reads**: `src/application/estimate/estimate-run.ts`; `src/infrastructure/guards/budget-pricing.ts`; `web/src/pages/PriceOverrides.tsx`; verdict comment 6229742224 on #445.
- **Do**: the run estimate (RF-425) prices Anthropic prompt input at the highest of the input and cache-write prices for its high figure, so the confirmation threshold is never low by the cache-write premium; an own-key Anthropic override without a cache-write price gets an error that names the override (not "no price in the price table"), and the settings page warns before saving such an override.
- **Delivers**: estimate change, error text, page warning, tests.
- **Done when**: an Anthropic estimate's high figure covers cache writes (unit test with a recorded price table); the override error names the override (unit and route test); the page shows the warning (web test); `npm run verify` green.
- **Refs**: RF-425, RF-428, P2-16 (verdict comment 6229742224 on #445).

### P2-25 - Follow-up: re-run answers with consolidation, question state on the page

- **Difficulty**: 6 (sonnet)
- **Size**: M
- **Depends on**: P2-05, P2-06
- **Gate**: none
- **Status**: In review
- **Reads**: `src/application/understand/answer-rerun.ts`; `understand-session.ts`; `web/src/pages/RunAnswers.tsx`; verdict comments 6227862573 and 6228789543 on #443.
- **Do**: tests for a re-run with answers whose cards are merged by consolidation (the New and Changed lists survive the merge; a failed merge write leaves the questions Open); a log line for each answered question that is skipped (deleted run, area no longer in the code map, already Answered); the answers page shows each question's state (Open or Answered); the start page offers "Re-run with answers" when the project has answered questions.
- **Delivers**: tests, log line, page state, start option.
- **Done when**: each item above has a test that fails without it; `npm run verify` green.
- **Refs**: RF-241, RF-1007, RF-250, P2-05, P2-06.

### P2-26 - Follow-up: settings and role-cap gaps from P2-08 and P2-15

- **Difficulty**: 5 (haiku)
- **Size**: S
- **Depends on**: P2-08, P2-15
- **Gate**: none
- **Status**: Done
- **Reads**: `web/src/pages/LimitSetting.tsx`; `src/infrastructure/guards/budget-guard.ts`; verdict comments 6227081401 on #435 and 6227966648 on #442.
- **Do**: the limit slider gets an `aria-label` that keeps field labels unique; a typed value beyond the slider range shows an inline hint before Save; the default warning is rendered in an axe check; a concurrency test proves that simultaneous reservations for one role with room for one let exactly one through (PostgreSQL contract); the settings page warns when a role cap is above the run cap.
- **Delivers**: page changes, tests.
- **Done when**: each item above has a test that fails without it; `npm run verify` green.
- **Refs**: RF-002, RF-423, DEC-117, P2-08, P2-15.

### P2-27 - Follow-up: one lock folder per test run for the e2e caps lock

- **Difficulty**: 3 (haiku)
- **Size**: S
- **Depends on**: none
- **Gate**: none
- **Status**: Todo
- **Reads**: `tests/unit/support/e2e-caps-lock.test.ts`; the caps-lock helper it tests; builder reports on #454 and #461.
- **Do**: the test takes its lock folders under a temporary root unique to the test process (for example `mkdtemp` or the pid in the run key) instead of fixed names in the shared `%TEMP%`, so a killed run in one worktree cannot make another worktree's run wait for the stale timeout; the behaviour of the lock itself is unchanged.
- **Delivers**: test and helper changes.
- **Done when**: two test processes started at once, with a stale folder from a killed run left in the shared temp folder, both pass; `npm run verify` green.
- **Refs**: RNF-005, P1-94.

### P2-28 - Follow-up: resume keeps the coverage failure and merged areas

- **Difficulty**: 6 (sonnet)
- **Size**: S
- **Depends on**: P2-01, P2-06
- **Gate**: none
- **Status**: Todo
- **Reads**: `src/infrastructure/cards/task-results-schema.ts`; `src/infrastructure/cards/task-results-flow-screen.ts`; builder report on #461 (open question 5).
- **Do**: `task-results.json` keeps the coverage `failure` field and the card `mergedAreas` when a run is stopped and resumed, as it now keeps the FLOW and SCRN fields; a round-trip test covers every field of the stored task result, so a dropped field fails it.
- **Delivers**: schema change, tests.
- **Done when**: a resumed run reports the same coverage failures and merged areas as an uninterrupted one; `npm run verify` green.
- **Refs**: RF-006, RF-230, RF-250, P2-01.

### P2-29 - Follow-up: small gaps from the P2-19 and P2-26 verdicts

- **Difficulty**: 5 (haiku)
- **Size**: S
- **Depends on**: P2-19, P2-26
- **Gate**: none
- **Status**: Todo
- **Reads**: `web/src/pages/setting-limits.ts`; `src/domain/code-map/area-surface.ts`; `src/infrastructure/scan/universal/artefact-rules.ts`; verdict comments on #458 and #461.
- **Do**: the thousands-grouping regex in `setting-limits.ts` works again (its backslashes were lost) or is removed if unused; the confirm field shows no range hint while the run cap itself is invalid; the flow and screen marks also recognise WebForms `.ashx` and `.asmx` handlers, `.html`, `.jsx` and `.tsx` views, and handler class names in the plural (`OrderHandlers`).
- **Delivers**: code changes, tests.
- **Done when**: each item above has a test that fails without it; `npm run verify` green.
- **Refs**: RF-002, RF-260, RF-261, P2-19, P2-26.

### P2-30 - Follow-up: verdicts follow claim ids through a card merge

- **Difficulty**: 7 (sonnet)
- **Size**: M
- **Depends on**: P2-02, P2-06
- **Gate**: none
- **Status**: Todo
- **Reads**: `src/application/cards/card-merge.ts`; the judgement events of P2-02; verdict comments on #454.
- **Do**: when the summariser merges cards and renumbers claim ids, the judgement events and the verdicts shown on the run page, in the replay and in the report refer to the new ids (a mapping recorded with the merge); no verdict is lost or attached to the wrong claim.
- **Delivers**: code changes, tests.
- **Done when**: a run whose merge renumbers claims shows every verdict on the right claim on the run page, in the replay and in the report; `npm run verify` green.
- **Refs**: RF-250, RF-301, RF-1014, P2-02, P2-06.

---

## Phase 3 - Report and plan

### P3-01 - HTML report: rendering approach and dashboard

- **Difficulty**: 8 (sonnet)
- **Size**: L
- **Depends on**: P1-43, P2-03
- **Gate**: none
- **Status**: Todo
- **Reads**: `docs/design/board/Report.dc.html`; `docs/data-model.md` section 3.17; ADR index deferred decision "Report rendering approach".
- **Do**: a Proposed ADR for the rendering approach (Preact components rendered to static HTML at build time, DEC-52) as the first commit (the pull request is `needs-owner`); `BuildReport` writing a static site: dashboard (cards by type, claims by status, coverage, cost, project totals at generation time), the open questions and the cost report, every page carrying the meta CSP of RF-1013.
- **Delivers**: the ADR, the site writer, the dashboard; snapshot tests.
- **Done when**: the RF-500 scenario has passing tests for the dashboard pages.
- **Refs**: RF-500, RF-1010, RF-1013, ADR-005, DEC-44, DEC-52.

### P3-02 - Area and card pages with the evidence

- **Difficulty**: 7 (sonnet)
- **Size**: M
- **Depends on**: P3-01
- **Gate**: none
- **Status**: Todo
- **Reads**: `docs/design/board/Report.dc.html`.
- **Do**: a page per area and per card; each citation shows the cited lines with context, line numbers, the claim status and reason, and the permalink.
- **Delivers**: the pages; snapshot tests.
- **Done when**: the RF-502 scenario and the page parts of RF-500 have passing tests.
- **Refs**: RF-500, RF-502, RF-125, RF-507.

### P3-03 - Filters and the replay in the HTML report

- **Difficulty**: 6 (sonnet)
- **Size**: M
- **Depends on**: P3-02
- **Gate**: none
- **Status**: Todo
- **Reads**: `docs/design/board/Report.dc.html`.
- **Do**: client-side filters by type, area and status without a server; the replay page of P1-43 linked from the dashboard.
- **Delivers**: the filters; E2E specs.
- **Done when**: the RF-503 scenario has a passing E2E test.
- **Refs**: RF-503, RF-506.

### P3-04 - Self-contained report, downloads and accessibility

- **Difficulty**: 7 (sonnet)
- **Size**: M
- **Depends on**: P3-03
- **Gate**: none
- **Status**: Todo
- **Reads**: `docs/design-system.md` section 8.
- **Do**: the report works from disk and from a sub-path with no external request; "Download all" zips of the run and, when present, the hand-off package; WCAG 2.1 AA in both themes (axe plus a keyboard walk).
- **Delivers**: the changes; E2E specs from disk and from a sub-path, downloading and unzipping both files, axe.
- **Done when**: every RF-501 and RF-505 scenario and RNF-010 have passing tests.
- **Refs**: RF-501, RF-505, RNF-010, DEC-24.

### P3-05 - Principle catalogue files

- **Difficulty**: 5 (haiku)
- **Size**: M
- **Depends on**: P1-01
- **Gate**: none
- **Status**: Done
- **Reads**: `docs/adr/ADR-018-planning-brief-and-principle-catalogue.md`; RF-606.
- **Do**: `prompts/catalogue/` with a version: every group and entry of RF-606, each with a one-line rule, why it matters and how to check it, in Rosetta's own words; the six architecture styles with selection criteria; a README crediting the master (Master en Desarrollo con IA, BIG School); a zod schema and loader.
- **Delivers**: the catalogue files, schema, loader; a schema test and a defaults test.
- **Done when**: every RF-606 scenario has a passing test.
- **Refs**: RF-606, ADR-018, DEC-73, DEC-74, DEC-84, DEC-85.

### P3-06 - Planning brief model and storage

- **Difficulty**: 6 (sonnet)
- **Size**: M
- **Depends on**: P3-05, P1-18
- **Gate**: none
- **Status**: Done
- **Reads**: `docs/data-model.md` section 3.20.
- **Do**: domain `PlanningBrief`, `CatalogueEntry`, `ArchitectureStyle`, `StackChoice`; the `planning-brief.json` schema; save and load per project with defaults for every unanswered question (DEC-80); "out of date" when the brief changes after a package exists.
- **Delivers**: domain types, schema, use cases and routes; unit and integration tests.
- **Done when**: the save and out-of-date scenarios of RF-605 have passing tests.
- **Refs**: RF-605, ADR-018, DEC-72, DEC-80.

### P3-07 - Architecture recommendation and stack options

- **Difficulty**: 8 (sonnet)
- **Size**: M
- **Depends on**: P3-06, P2-03
- **Gate**: none
- **Status**: Todo
- **Reads**: `docs/adr/ADR-018-planning-brief-and-principle-catalogue.md`.
- **Do**: from the code map and the verified cards, propose the two best-fitting styles with trade-offs, the evidence card ids and one marked recommended (planner role through the guards, prompt versioned); two pre-filled stack options per layer from the legacy stack found by the scan.
- **Delivers**: the use case, prompt, recordings; integration tests.
- **Done when**: the first RF-608 scenario and the first RF-609 scenario have passing tests.
- **Refs**: RF-608, RF-609, ADR-007, ADR-018, DEC-76, DEC-77, DEC-78.

### P3-08 - Plan setup page

- **Difficulty**: 7 (sonnet)
- **Size**: M
- **Depends on**: P3-07, P3-09, P3-11
- **Gate**: G-02
- **Status**: Todo
- **Reads**: `docs/design/board/PlanSetup.dc.html`; `docs/design-system.md` section 14.
- **Do**: `/projects/:id/plan-setup` as the approved artboard: steps principles, architecture, migration, stack, project context and build method; each question with its default, reason and "(Recommended)" option; catalogue toggles; "What I recorded" summary; the plan estimate (P3-11) and Write the package.
- **Delivers**: the page; E2E specs with the fake provider.
- **Done when**: every RF-605 scenario has a passing E2E test; the verifier walks the page in both schemes.
- **Refs**: RF-605, RF-608, RF-609, RF-610, RF-611, DEC-72, DEC-86.

### P3-09 - Planner and the hand-off package

- **Difficulty**: 9 (opus)
- **Size**: L
- **Depends on**: P3-06, P2-03
- **Gate**: none
- **Status**: Todo
- **Reads**: `docs/adr/ADR-018-planning-brief-and-principle-catalogue.md`; `docs/data-model.md` section 3.17 (`handoff/`).
- **Do**: `BuildPlan` writing `handoff/` from `Supported` claims, answered questions and the brief: README with reading order, requirements specification with source card ids, target architecture, ADRs, entity mapping, roadmap, task cards with acceptance criteria, risks and open questions (unanswered brief questions with their defaults, excluded claims with their ids); plain Markdown and Mermaid only; the manifest records the brief, catalogue version and prompt versions.
- **Delivers**: the use case, writers, prompts, recordings; structure tests of the package.
- **Done when**: every RF-601, RF-602, RF-603 and RF-604 scenario has a passing test.
- **Refs**: RF-601, RF-602, RF-603, RF-604, RNF-004, ADR-005, ADR-018, DEC-10, DEC-80.

### P3-10 - Principles, styles, stack, migration and build method in the package

- **Difficulty**: 8 (sonnet)
- **Size**: M
- **Depends on**: P3-09
- **Gate**: none
- **Status**: Todo
- **Reads**: `docs/adr/ADR-018-planning-brief-and-principle-catalogue.md`.
- **Do**: each chosen principle as conventions rules and task-card checks (TDD lists the tests first, SDD names requirement ids, SOLID and KISS in review checklists); the style ADR and a target architecture following it; an ADR per stack layer; the migration strategy ordering the roadmap with its ADR; project context shaping phases and sizes; the AI-assisted build method (AGENTS.md, rated cards, plan before build, human review).
- **Delivers**: the writers; structure tests.
- **Done when**: every RF-607, RF-610, RF-611 and RF-612 scenario and the second scenarios of RF-608 and RF-609 have passing tests.
- **Refs**: RF-607, RF-608, RF-609, RF-610, RF-611, RF-612, ADR-018, DEC-75, DEC-76, DEC-79.

### P3-11 - Plan estimate and caps

- **Difficulty**: 7 (sonnet)
- **Size**: S
- **Depends on**: P3-09
- **Gate**: none
- **Status**: Todo
- **Reads**: `docs/adr/ADR-007-cost-control.md`.
- **Do**: the `planner` estimate against the user's caps on Plan setup; every planner call through the guards.
- **Delivers**: the estimator extension and route; integration tests.
- **Done when**: the RF-613 scenario has a passing test.
- **Refs**: RF-613, ADR-007, DEC-81.

### P3-12 - Release 1 journeys and verification matrix

- **Difficulty**: 9 (opus)
- **Size**: M
- **Depends on**: P3-04, P3-08, P3-10, P3-11
- **Gate**: none
- **Status**: Todo
- **Reads**: `docs/roadmap.md` (P3 exit criteria); `docs/process-flows.md` flows 1 and 7.
- **Do**: journeys from a GitHub URL to a downloaded hand-off package with a saved brief; `docs/verification/r1-matrix.md` covering every release-1 requirement; the pyramid for the release; gaps listed for the orchestrator to file as follow-up cards.
- **Delivers**: journey specs, the matrix.
- **Done when**: every journey passes in CI; no R1 Must lacks evidence or a follow-up card.
- **Refs**: RF-601, RF-604, RF-605, RNF-005, RNF-010.

### P3-13 - Follow-up: catalogue rule tests and the catalogue version in the run manifest

- **Difficulty**: 5 (haiku)
- **Size**: S
- **Depends on**: P3-05
- **Gate**: none
- **Status**: Done
- **Reads**: `src/infrastructure/prompts/catalogue-files.ts`; `src/infrastructure/prompts/catalogue-entry-file.ts`; `src/domain/planning/catalogue.ts`; `src/domain/runs/run-manifest.ts`; RF-606; the verdict on #208.
- **Do**: add the two schema tests P3-05 lacks (a rule longer than 200 characters is refused; the bullets list needs at least two items, `min(2)`). `loadCatalogue` is not called at start-up (RF-606): call it once in the composition root so a broken catalogue stops start-up with a code, and record the catalogue version and its sha256 in the run manifest of a run that uses it.
- **Delivers**: the tests, the start-up call and the manifest fields (with their line in `docs/data-model.md`).
- **Done when**: a catalogue with a 201-character rule or one bullet fails its test; a broken catalogue file stops start-up; the manifest of a run lists the version and sha; `npm run verify` green.
- **Refs**: RF-606, ADR-018, P3-05 (verifier MINORs).

### P3-14 - Diagrams in the HTML report

- **Difficulty**: 8 (sonnet)
- **Size**: M
- **Depends on**: P3-01, P2-21
- **Gate**: none
- **Status**: Todo
- **Reads**: RF-507, RF-508; the HTML report (P3-01..P3-04); `package.json` dependency rules (DEC-125).
- **Do**: ship a pinned Mermaid build inside the report folder (Q-26; version at least two weeks old, licence notice kept), draw every diagram of the specification and the package with `securityLevel: 'strict'` and no network; a diagram that fails shows its source as text with a note.
- **Delivers**: the rendering, the vendored file, end-to-end tests.
- **Done when**: every RF-508 scenario has a passing test, including the hostile fixture; the report works offline from disk and on GitHub Pages; `npm run verify` and `npm run test:e2e` green.
- **Refs**: RF-505, RF-507, RF-508, RNF-010, ADR-013, DEC-125, DEC-134, Q-26.

### P3-15 - Package documentation set and the PRD

- **Difficulty**: 7 (sonnet)
- **Size**: M
- **Depends on**: P3-09
- **Gate**: none
- **Status**: Todo
- **Reads**: ADR-018; RF-601..RF-604; the planner (P3-09).
- **Do**: extend the package README reading order with the documentation set (RF-620); write `prd.md` from the brief and the verified cards (problem and goal, users and roles, features with MoSCoW and `FEAT` links, rules to keep with `BR` links, out of scope, non-functional expectations, success measures); sections the code cannot answer get a marked placeholder and an open question with its default; prompts versioned, recordings.
- **Delivers**: writers, prompts, recordings, structure tests.
- **Done when**: every RF-620 and RF-621 scenario has a passing test; no PRD statement lacks a card link or a placeholder marker; `npm run verify` green.
- **Refs**: RF-601, RF-602, RF-620, RF-621, ADR-018, DEC-80, DEC-134.

### P3-16 - Technical requirements document

- **Difficulty**: 7 (sonnet)
- **Size**: M
- **Depends on**: P3-10, P2-21
- **Gate**: none
- **Status**: Todo
- **Reads**: RF-608..RF-610; the package ADR writers (P3-10).
- **Do**: write `trd.md`: architecture overview with a generated Mermaid component diagram, stack per layer, integrations to keep or replace with `INT` links, security and data protection, non-functional targets, deployment and environments, migration approach; each section links the ADR that decided it.
- **Delivers**: writer, prompt changes, recordings, structure tests.
- **Done when**: every RF-622 scenario has a passing test; every section links an ADR or says why none applies; `npm run verify` green.
- **Refs**: RF-608, RF-609, RF-610, RF-622, ADR-018, DEC-134.

### P3-17 - Target data model

- **Difficulty**: 8 (sonnet)
- **Size**: M
- **Depends on**: P3-09, P2-22
- **Gate**: none
- **Status**: Todo
- **Reads**: RF-262, RF-609, RF-623; the entity mapping written by P3-09.
- **Do**: write the package `data-model.md`: each target table with columns, types in the chosen database, keys, constraints and indexes, the legacy source of each column or "new", dropped legacy fields with reasons, type changes that can lose data as migration risks, and a generated ER diagram; no executable DDL (RF-603); the entity mapping of RF-601 links it.
- **Delivers**: writer, prompts, recordings, structure and snapshot tests.
- **Done when**: every RF-623 scenario has a passing test; every legacy `ENT` field is mapped or listed as dropped; `npm run verify` green.
- **Refs**: RF-601, RF-603, RF-623, ADR-018, DEC-134.

### P3-18 - API contract

- **Difficulty**: 8 (sonnet)
- **Size**: M
- **Depends on**: P3-17
- **Gate**: none
- **Status**: Todo
- **Reads**: RF-624; the target data model (P3-17); `package.json` dependency rules (DEC-125).
- **Do**: when the chosen front end is separate from the back end, write `api/openapi.yaml` (OpenAPI 3.1, Q-28) covering every operation the target features and flows need, schemas from the target data model, errors and authentication, each operation naming its `FEAT` or `FLOW` card; otherwise the README says no contract applies and why; a dev-only OpenAPI schema validator checks the file in tests.
- **Delivers**: writer, prompts, recordings, validation test.
- **Done when**: every RF-624 scenario has a passing test; the demo package's contract validates; `npm run verify` green.
- **Refs**: RF-603, RF-624, ADR-018, DEC-125, DEC-134, Q-28.

### P3-19 - Target flows

- **Difficulty**: 7 (sonnet)
- **Size**: M
- **Depends on**: P3-16, P2-20
- **Gate**: none
- **Status**: Todo
- **Reads**: RF-625; the TRD components (P3-16).
- **Do**: write `flows/` with one file per main journey (Q-27): steps mapped to target components and a generated sequence diagram, each linking its legacy `FLOW` card; journeys outside the brief listed as out of scope.
- **Delivers**: writer, prompts, recordings, structure tests.
- **Done when**: every RF-625 scenario has a passing test; every verified `FLOW` card is mapped or listed; `npm run verify` green.
- **Refs**: RF-625, ADR-018, DEC-134, Q-27.

### P3-20 - User-interface material

- **Difficulty**: 8 (sonnet)
- **Size**: M
- **Depends on**: P3-19
- **Gate**: none
- **Status**: Todo
- **Reads**: RF-626; `docs/design-system-brief.md` (as the model of a design brief); RF-507.
- **Do**: write `ux/`: a generated target screen map with each legacy screen kept, merged or dropped and why; one low-fidelity wireframe per main screen (Q-27) as a plain HTML file (layout boxes, fields, actions, navigation; no script, no event attribute, no external resource, text escaped); a design brief for an external design tool (audience, tone, components, WCAG 2.1 AA).
- **Delivers**: writers, prompts, recordings, an HTML check in tests.
- **Done when**: every RF-626 scenario has a passing test; a hostile screen name renders as text in its wireframe; `npm run verify` green.
- **Refs**: RF-507, RF-626, RNF-010, ADR-013, ADR-018, DEC-134, Q-27.

### P3-21 - Implementation plan coverage

- **Difficulty**: 7 (sonnet)
- **Size**: M
- **Depends on**: P3-15, P3-17, P3-18, P3-19, P3-20
- **Gate**: none
- **Status**: Todo
- **Reads**: RF-601, RF-627; the roadmap and task-card writers (P3-09).
- **Do**: make the package roadmap and task cards cover the whole set: every PRD feature, target table, API operation, target flow and main screen named by at least one task card that links it; the first card writes the migrations in the chosen stack (RF-623); uncovered items go to the package checks file and the run is not reported complete.
- **Delivers**: planner changes, a coverage check, tests.
- **Done when**: every RF-627 scenario has a passing test; the demo package has no uncovered item; `npm run verify` green.
- **Refs**: RF-601, RF-623, RF-627, ADR-018, DEC-134.

### P3-22 - Documentation set journey and owner review

- **Difficulty**: 8 (sonnet)
- **Size**: M
- **Depends on**: P3-14, P3-21, P2-23
- **Gate**: none
- **Status**: Todo
- **Reads**: P3-12; the demo planning brief.
- **Do**: an end-to-end journey that runs understand and plan on the demo with recorded responses and checks the whole documentation set (spec with flows, screens and data model; PRD, TRD, data model, API contract, flows, UX, implementation plan) and the report diagrams; publish the demo package with the sample report (RF-800) for the owner to read; record the owner's review changes as follow-up cards.
- **Delivers**: the journey, the published sample, the review notes.
- **Done when**: the journey passes in CI; the owner has read the sample package and the changes are filed; P3-12's verification matrix includes RF-260..RF-263, RF-508 and RF-620..RF-627.
- **Refs**: RF-260..RF-263, RF-508, RF-620..RF-627, RF-800, P3-12, DEC-134.

### P3-23 - Task-card quality: invariants, probes, guard tests and risk class

- **Difficulty**: 7 (sonnet)
- **Size**: M
- **Depends on**: P3-09, P3-10
- **Gate**: none
- **Status**: Todo
- **Reads**: RF-601, RF-612, RF-630, RF-633, RF-635; the task-card writer (P3-09); the build-method writer (P3-10); `docs/orchestration/tasks.md` of this repository as a worked example.
- **Do**: the card template of the package gains an invariant, Given/When/Then Done-when with concrete inputs, a "review probes" list for cards that add a check, filter, limit or parser, and a risk class next to the difficulty; the build method states the guard-test rule with the mutation check and the tier rule for risky cards; prompts versioned, recordings.
- **Delivers**: template, writers, prompts, recordings, structure tests.
- **Done when**: every RF-630, RF-633 and RF-635 scenario has a passing test; the demo package has no card without an invariant; `npm run verify` green.
- **Refs**: RF-601, RF-612, RF-630, RF-633, RF-635, ADR-018, DEC-135.

### P3-24 - Behaviour to preserve and realistic data shapes

- **Difficulty**: 8 (sonnet)
- **Size**: M
- **Depends on**: P3-23, P2-22
- **Gate**: none
- **Status**: Todo
- **Reads**: RF-631, RF-632; the code map and scan statistics; the `FEAT`, `BR`, `FLOW` and `SCRN` cards.
- **Do**: each card that touches a covered item lists the behaviours to keep with their citations and an approval test for each; the open-questions writer refuses a default that changes legacy behaviour; `fixtures.md` is generated by code from the scan (largest files, size by kind, deepest paths, unusual names, encodings, line endings) and linked from limit and parser cards.
- **Delivers**: writers, a generator for `fixtures.md`, structure and snapshot tests.
- **Done when**: every RF-631 and RF-632 scenario has a passing test; the demo's `fixtures.md` names its `.map` and bundled-script volume and any reserved device names found; `npm run verify` green.
- **Refs**: RF-631, RF-632, ADR-018, DEC-80, DEC-135.

### P3-25 - Parallel-safe cards and agent operations

- **Difficulty**: 7 (sonnet)
- **Size**: M
- **Depends on**: P3-23
- **Gate**: none
- **Status**: Todo
- **Reads**: RF-612, RF-634, RF-636; the roadmap writer.
- **Do**: each card lists expected files and the shared identifiers it needs, allocated by the plan per card or from one registry; overlapping cards are ordered, never in one parallel group; the roadmap lists parallel groups; `AGENTS.md` gains the operations section of RF-636.
- **Delivers**: allocator, overlap check, writers, tests.
- **Done when**: every RF-634 and RF-636 scenario has a passing test; a fixture plan with two cards needing an error code gets two different codes; `npm run verify` green.
- **Refs**: RF-612, RF-634, RF-636, ADR-018, DEC-135.

### P3-26 - Open questions linked to cards, build metrics and the catalogue

- **Difficulty**: 6 (sonnet)
- **Size**: S
- **Depends on**: P3-23, P3-05
- **Gate**: none
- **Status**: Todo
- **Reads**: RF-606, RF-637, RF-638; the principle catalogue files (P3-05).
- **Do**: each open question lists the cards it blocks and the roadmap marks them waiting; the build method names the measures of RF-638; the "AI-assisted build" group of the principle catalogue gains entries for the lessons of DEC-135 (shared probes, behaviour to preserve, guard tests, parallel-safe ids, risk class, agent operations, measure one change at a time) with a new catalogue version.
- **Delivers**: writers, catalogue entries, tests.
- **Done when**: every RF-637 and RF-638 scenario has a passing test; the catalogue version increases and the run manifest records it; `npm run verify` green.
- **Refs**: RF-606, RF-637, RF-638, ADR-018, DEC-135.
