# Conventions

|             |                                                                                                                                                                                                                                                                        |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**  | Proposed (2026-10-09)                                                                                                                                                                                                                                                  |
| **Date**    | 2026-10-11 (review of the build plan, DEC-112)                                                                                                                                                                                                                         |
| **Owner**   | BlackLigth (blacklight0101)                                                                                                                                                                                                                                            |
| **Related** | [Architecture](architecture.md) - [Environments and delivery](environments-and-delivery.md) - [ADR-009](adr/ADR-009-clean-architecture.md) - [ADR-010](adr/ADR-010-spec-driven-and-test-driven-development.md) - [ADR-011](adr/ADR-011-toolchain-and-quality-gates.md) |

The rules every builder applies the same way. Rules marked **(tool)** are enforced by a gate of `npm run verify`
([environments and delivery](environments-and-delivery.md) section 6); the rest are checked by the verifier. This
document is the canonical home of the error-code catalogue (section 6) and the test naming rules (section 7).

## 1. Language and compiler

- TypeScript 6.0, ES modules only (`"type": "module"`), `module` and `moduleResolution` `nodenext`, target and lib
  `es2024`. **(tool)**
- `tsconfig.json` turns on `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `noImplicitOverride`, `noPropertyAccessFromIndexSignature`, `noFallthroughCasesInSwitch`, `noImplicitReturns`,
  `useUnknownInCatchVariables`, `verbatimModuleSyntax`, `isolatedModules`, `erasableSyntaxOnly`,
  `forceConsistentCasingInFileNames`. **(tool)**
- `erasableSyntaxOnly` forbids `enum`, `namespace` and parameter properties: use string-literal unions with an
  `as const` object, modules and explicit fields. **(tool)**
- Node built-ins are imported with the `node:` prefix (`node:fs/promises`, `node:path`). **(tool)**
- Type-only imports use `import type`. **(tool)**

## 2. Folders, files and names

| Thing                  | Rule                                                                                                                                                                                                | Example                                  |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Layers                 | `src/domain`, `src/application`, `src/infrastructure`, `src/presentation` ([architecture](architecture.md))                                                                                         |                                          |
| Files                  | kebab-case, one main export per file, named after it                                                                                                                                                | `budget-guard.ts` exports `BudgetGuard`  |
| Types, classes         | PascalCase; no `I` prefix on interfaces                                                                                                                                                             | `LlmProvider`, `CodeMap`                 |
| Functions, variables   | camelCase; verbs for functions                                                                                                                                                                      | `parseCitation`, `estimateRun`           |
| Constants              | camelCase for module constants; UPPER_SNAKE only for environment variable names                                                                                                                     | `defaultMaxTurns`, `OPENAI_API_KEY`      |
| Ports                  | a noun for the capability, in `src/application/ports/`                                                                                                                                              | `RepositoryReader`, `Clock`              |
| Adapters               | technology plus port, in `src/infrastructure/<area>/`                                                                                                                                               | `OpenAiProvider`, `NodeRepositoryReader` |
| Use cases              | verb phrase, one per file in `src/application/use-cases/`                                                                                                                                           | `RunUnderstand`                          |
| Tests                  | next to nothing in `src`; under `tests/<level>/` mirroring `src`                                                                                                                                    | `tests/unit/domain/citation.test.ts`     |
| Prompts                | `prompts/<role>/<name>.v<n>.md`; a change creates a new version file                                                                                                                                | `prompts/reader/area.v3.md`              |
| SQL tables and columns | `snake_case`; tables plural; `id` primary key; `<singular>_id` foreign keys; `*_at` `timestamptz`; `*_micros` `bigint`; enumerations as `text` with `CHECK` ([data-model](data-model.md) section 1) | `cost_ledger.cost_micros`                |
| Migrations             | `db/migrations/NNNN_snake_name.sql`, never edited after merge                                                                                                                                       | `0001_accounts.sql`                      |
| HTTP routes            | pages at kebab-case paths; JSON API under `/api/`, plural nouns, ids as path segments                                                                                                               | `GET /api/projects/:projectId/runs`      |
| Environment variables  | `ROSETTA_` prefix for Rosetta's own; provider and database names as the ecosystem uses them                                                                                                         | `ROSETTA_SECRET_KEY`, `DATABASE_URL`     |

- **Named exports only**; no default exports. **(tool)**
- No barrel files (`index.ts` re-exporting a folder) inside `src`; import the file you need. **(tool: knip,
  dependency-cruiser)**

## 3. Types and data

- No `any`. At a boundary (file, network, model output, tool arguments, configuration) data is `unknown` and is
  parsed with a zod schema before use; after parsing, types flow from `z.infer`. **(tool: `no-explicit-any`,
  `no-unsafe-*`)**
- No non-null assertions (`!`) and no `as` casts except `as const`; narrow with checks or schemas instead.
  **(tool: `no-non-null-assertion`, `consistent-type-assertions`)**
- Prefer `readonly` properties and `ReadonlyArray`; domain objects are immutable; changes return new values.
- Exhaustive `switch` over unions. **(tool: `switch-exhaustiveness-check`)**
- No `Date.now()`, `new Date()`, `Math.random()` or `crypto.randomUUID()` in `domain` or `application`; take a `Clock`
  or `IdGenerator` port so tests are deterministic.
- Paths: build with `node:path`, resolve against a root and check the result stays inside it (no path traversal);
  citations and stored paths use forward slashes relative to the repository root.

## 4. Functions and modules

- One responsibility per module; a use case does one thing.
- Size limits: function body at most 50 lines, file at most 300 lines, cyclomatic complexity at most 10, nesting depth
  at most 3, at most 4 parameters (pass an options object beyond that). **(tool: `max-lines-per-function`,
  `max-lines`, `complexity`, `max-depth`, `max-params`)**
- Dependencies arrive through constructor or factory parameters; no singletons, no module-level mutable state; the
  composition root in `src/presentation` is the only place that creates adapters.
- No `console` outside `src/presentation`; other layers report through a `Logger` port. **(tool: `no-console`)**
- Logs go to standard output as JSON lines through the `Logger` port (RF-009); there is no other console output.

## 5. Asynchronous code

- No floating promises and no promises in places that expect a value. **(tool: `no-floating-promises`,
  `no-misused-promises`)**
- Every network call has a timeout and accepts an `AbortSignal`; Stop, shutdown and budget caps cancel through the
  same signal (RF-422, RNF-002).
- Use `node:fs/promises`; no synchronous file system calls outside server start-up. **(tool: `n/no-sync`)**
- Retries only in the provider adapters, with exponential back-off and jitter (RF-406); nowhere else.

## 6. Errors

- Throw only `Error` subclasses with a stable `code`; never strings or plain objects. **(tool:
  `only-throw-error`)**
- Expected failures in `domain` and `application` (invalid citation, cap reached, unknown area) are returned as a
  typed `Result`; exceptions are for programming errors and infrastructure failures.
- Wrap with `cause` when rethrowing; never swallow an error in an empty `catch`. **(tool: `no-empty`)**
- The HTTP layer maps every error to an HTTP status (RF-007) and returns `RST-xxxx`, a plain message and the next
  step; stack traces only in the `debug` log, never in a response. Authentication and authorization failures never
  say whether the user or the resource exists. The status of each code with an HTTP cause is listed in
  `src/presentation/web/error-mapper.ts` (RST-2000..2006 for 400, 401, 403, 404, 409, 429 and 500; RST-2007,
  RST-2008 and RST-2212 for 403, RST-2201 for 401; the account rules RST-2202..2204, RST-2206, RST-2207, RST-2211 and
  RST-2214 for 400; RST-2205, RST-2208, RST-2213, RST-2306 (a run, project or snapshot in use cannot be deleted) and RST-2307 (a run that cannot be resumed) and RST-2308 (a run that cannot be deepened) for 409; RST-2309, a Deepen without the owner's confirmation, for 400; the key rules RST-2301 and RST-2304 for 400; RST-1515, a cloud run without consent, and RST-1521, an uploaded project's cloud run without the private-code confirmation, for 400; RST-1007, a settings save that started from an older version, for 409); any other code
  answers 500, and the body carries the catalogue message and next step, never the error's own message.

**Error-code catalogue** (canonical; a new code gets the next free number in its range). Individual codes live in one
registry, `src/domain/errors/codes.ts`, one code per line, so two parallel pull requests that take the same number
conflict visibly; the codes already shown on the design board are reserved there first (DEC-112):

| Range          | Area                                                                            |
| -------------- | ------------------------------------------------------------------------------- |
| RST-1000..1099 | configuration: server environment and project settings (CLI usage until DEC-59) |
| RST-1100..1199 | file system, ignore rules, output folder                                        |
| RST-1200..1299 | scan and language packs                                                         |
| RST-1300..1399 | agent loop, tools and card parsing                                              |
| RST-1400..1499 | verifier                                                                        |
| RST-1500..1599 | providers                                                                       |
| RST-1600..1699 | budget and cost                                                                 |
| RST-1700..1799 | report and export                                                               |
| RST-1800..1899 | plan                                                                            |
| RST-1900..1999 | sources: GitHub (URL, ref resolution, download, rate limits) and uploaded zips  |
| RST-2000..2099 | web UI and HTTP server (routes, validation, CSRF, headers)                      |
| RST-2100..2199 | logging and observability                                                       |
| RST-2200..2299 | accounts, sign-in, sessions, roles and audit (RF-1100..RF-1109)                 |
| RST-2300..2399 | provider keys, caps and the run queue (RF-1104, RF-1106, RF-1108)               |
| RST-2400..2499 | database and migrations (RF-1302)                                               |
| RST-2500..2599 | deployment, start-up and health (RF-1300..RF-1306)                              |

RST-2009 is the web client's own code (`web/src/api/client.ts`) for a request that got no answer at all (a network failure or a timeout, status 0); the server never sends it. RST-2010 is the same client's code for a request the caller cancelled itself, status 0, also never sent by the server. A request to a path outside `/api/` is refused by the client with RST-2006 before anything is sent.

## 7. Tests

- Vitest projects `unit`, `integration`, `e2e` under `tests/<level>/`; the level is the project, so every test has
  one. Split about 60 / 30 / 10 as a guideline that warns (DEC-30); a run with zero tests fails.
- `npm run test:levels` (and the level step of `npm run test:ci`) counts the Vitest tests that ran, from the run's JSON
  report (`test-results/vitest.json`): every passed or failed test counts once, so each `it.each` row counts, and a
  contract suite from `tests/contracts/` counts at the level of the test file that runs it; a test that ran outside
  the three level folders fails the report. Playwright specs are counted from their source (P1-61). The zero-test
  guard looks at the Vitest report alone, so Playwright specs cannot make an empty Vitest run pass. A report whose
  `startTime` is more than an hour old is refused as stale, and a report without a numeric `startTime` is refused as
  not a Vitest JSON report (P1-117).
- **Test names start with the requirement id** they prove, then the behaviour (ADR-010):
  `it('RF-422 stops the run when the next call would exceed the cap', ...)`. Tests for internal helpers name the
  requirement their caller serves.
- Arrange, act, assert; one behaviour per test; no logic in tests beyond setup tables (`it.each`).
- Unit tests touch no disk, network, clock or randomness; integration tests cross exactly one real boundary (the file
  system in a temporary folder from `fs.mkdtemp`, a disposable PostgreSQL, the HTTP server in process through
  `fastify.inject`, or a recorded provider); end-to-end tests drive a browser with Playwright against a running
  server.
- Every route has a row in the access matrix test (anonymous, user, other user, administrator) (RF-1105).
- End-to-end specs are Playwright files named `tests/e2e/**/*.spec.ts` (the Vitest `e2e` project keeps `*.test.ts`); both
  count as E2E in `npm run test:levels`. A spec imports `test` and `expect` from `tests/e2e/support/fixtures.ts`, whose
  `network` fixture aborts every request and WebSocket outside 127.0.0.1 and fails the test unless the test asserts on it with
  `network.takeBlocked()`. `npm run test:e2e` runs the project against a disposable PostgreSQL
  (`ROSETTA_TEST_DATABASE_URL`) with Chromium installed by `npx playwright install chromium`; `ROSETTA_E2E_PORT` moves the
  test server (default 18080); the test server trusts one proxy hop and the `clientAddress` fixture gives every test an address of its own in `X-Forwarded-For`, so the per-address rate limits of sign-in and password change never couple tests, and `accountFor(kind, project)` gives each Playwright project accounts of its own (`tests/e2e/support/seed.ts`). A page card adds an axe check (`expectNoSeriousViolations`) to its spec.
- Where an end-to-end test runs is decided by its tag (`playwright.config.ts`, architecture.md section 17); a new spec
  needs no change to the configuration:
  - **No tag** (the default): a behavioural test. It runs once, in `desktop-light`; its `expectNoSeriousViolations`
    calls are made there in all four views (1280 and 360 px, light and dark) on the page in the state the test reached.
    Write a new test, journeys included, this way.
  - **`@visual`**: runs in all four projects. Use it for a check that depends on the project's colour scheme or
    viewport and nothing else, and for the visual sweep. A page card that adds a page or route also adds it to the
    sweep in `tests/e2e/visual/`, through `expectPageInView(page)` (`'static'` for a page the front end does not draw):
    axe, the colour scheme and no sideways scroll. A table at 360 px must fit its box: no table is named as an exception
    (architecture.md section 17); a table that is too wide stacks (`rst-table--stack`, a `data-label` on each cell).
  - **`@phone`**: a test about the 360 px layout (a `scrollWidth` check, an element that must fit the screen). It runs
    in `desktop-light` and `phone-light`; in `phone-light` it runs on its own, so it makes what it needs itself.
  - Tag a test with its details object, `test('RF-123 ...', { tag: '@phone' }, async ({ page }) => { ... })`, or a
    whole block with `test.describe('...', { tag: '@visual' }, () => { ... })`.
- No real provider calls: the test setup sets `ROSETTA_TEST=1` and blocks outbound network; providers are the fake
  provider with recordings in `tests/recordings/` (ADR-008).
- Every port has a contract test suite that the real adapters and the fakes both pass.
- No `.only`, no skipped tests on `main`, no snapshot for something an assertion can state. **(tool:
  `@vitest/eslint-plugin`)**
- The front end in `web/` has its own `web/tsconfig.json` (DOM library) and a Vitest project `web` with happy-dom and
  `@testing-library/preact` for component tests, counted as unit tests (DEC-112). Its tests live in `tests/unit/web/`,
  which has its own `tsconfig.json` (the root program excludes it) and a setup file; `npm run typecheck` runs all three
  programs. A test that needs a real build runs in `tests/integration/web/`.
- Coverage thresholds (v8): `domain` and `application` at least 90% lines and 85% branches; whole project at least
  80% lines (RNF-005). **(tool)**

## 8. Formatting

Prettier with `printWidth: 100`, `singleQuote: true`, `trailingComma: "all"`, `semi: true`; Markdown is formatted
too. ESLint never formats (`eslint-config-prettier` last). **(tool)**

## 9. Branches, commits and pull requests

- Branches: `task/<card-id>-<slug>` (lower case, for example `task/p1-04-budget-guard`), `docs/<topic>`,
  `fix/<issue>-<slug>`.
- Commits: Conventional Commits, `type(scope): subject` in the imperative, at most 72 characters, types `feat`,
  `fix`, `test`, `refactor`, `docs`, `chore`, `ci`, `build`, `perf`; body explains why; footer `Refs:` with card,
  `RF`, `ADR` and `DEC` ids. **(tool: commitlint)**
- Attribution (DEC-139): a commit written by an agent ends with a `Co-Authored-By:` line naming the tool and model that
  wrote it, and a pull request opened by an agent ends with one line naming the tool; the exact forms are in `AGENTS.md`.
  No tool or model is fixed: Claude, Codex or any other agent uses its own line.
- TDD order on every code card: `test:` commit(s) with failing tests, then `feat:`/`fix:`, then optional
  `refactor:` (ADR-010).
- Pull requests use the template, close their issue, and are merged with squash, by the orchestrator under `docs/orchestration/README.md` section 3.1 or, when labelled `needs-owner`, by the owner (DEC-96); the squash title is the
  pull request title in Conventional Commit form.
- Packages: a new package version is adopted only when it is at least two weeks old; a newer release waits and the
  baseline in `docs/environments-and-delivery.md` section 7 keeps the older pin (DEC-125).

## 10. Lint configuration summary

`eslint.config.ts` (flat): `@eslint/js` recommended; `typescript-eslint` `strictTypeChecked` and
`stylisticTypeChecked` with `parserOptions.projectService: true`; `eslint-plugin-n` `flat/recommended-module`;
`@vitest/eslint-plugin` recommended on `tests/**`; `eslint-config-prettier` last. Added rules, all errors:
`consistent-type-imports`, `switch-exhaustiveness-check`, `no-import-type-side-effects`,
`explicit-module-boundary-types`, `prefer-readonly`, `no-restricted-exports` (default), `no-console` (except
`src/presentation`), `eqeqeq`, `complexity` 10, `max-depth` 3, `max-params` 4, `max-lines` 300,
`max-lines-per-function` 50, `n/no-sync`, `n/prefer-node-protocol`, in `web/**` a `no-restricted-syntax` rule that rejects `innerHTML`, `outerHTML`,
`insertAdjacentHTML`, `dangerouslySetInnerHTML`, `document.write` and `DOMParser` (RF-507; the selectors are in `web-lint.config.ts`), and in `src/infrastructure/db/**` a
`no-restricted-syntax` rule that rejects a template literal as the first argument of `query` (parameterised SQL,
ADR-016). Lint runs with `--max-warnings 0`. A disabled rule
needs an inline `eslint-disable-next-line <rule> -- <reason>`; blanket disables are forbidden. **(tool)**

`.dependency-cruiser.cjs`: `domain` may import only `domain`; `application` only `domain` and `application`;
`infrastructure` may not import `presentation`; nothing in `src` imports `tests`; no circular dependencies; no
dependency missing from `package.json`; provider SDKs, `web-tree-sitter`, `yazl` and `yauzl` only from `src/infrastructure`; `tar` only from
`src/infrastructure/github/` and `ignore` only from `src/infrastructure/files/` (ADR-019); `web/` may import from
`src/` only `src/application/contracts/`.
**(tool)**
