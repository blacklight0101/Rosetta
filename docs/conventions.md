# Conventions

| | |
|---|---|
| **Status** | Proposed (2026-10-09) |
| **Date** | 2026-10-09 |
| **Owner** | BlackLigth (blacklight0101) |
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

| Thing | Rule | Example |
|---|---|---|
| Layers | `src/domain`, `src/application`, `src/infrastructure`, `src/presentation` ([architecture](architecture.md)) | |
| Files | kebab-case, one main export per file, named after it | `budget-guard.ts` exports `BudgetGuard` |
| Types, classes | PascalCase; no `I` prefix on interfaces | `LlmProvider`, `CodeMap` |
| Functions, variables | camelCase; verbs for functions | `parseCitation`, `estimateRun` |
| Constants | camelCase for module constants; UPPER_SNAKE only for environment variable names | `defaultMaxTurns`, `OPENAI_API_KEY` |
| Ports | a noun for the capability, in `src/application/ports/` | `FileReader`, `Clock` |
| Adapters | technology plus port, in `src/infrastructure/<area>/` | `OpenAiProvider`, `NodeFileReader` |
| Use cases | verb phrase, one per file in `src/application/use-cases/` | `RunUnderstand` |
| Tests | next to nothing in `src`; under `tests/<level>/` mirroring `src` | `tests/unit/domain/citation.test.ts` |
| Prompts | `prompts/<role>/<name>.v<n>.md`; a change creates a new version file | `prompts/reader/area.v1.md` |
| SQL tables and columns | `snake_case`; tables plural; `id` primary key; `<singular>_id` foreign keys; `*_at` `timestamptz`; `*_micros` `bigint`; enumerations as `text` with `CHECK` ([data-model](data-model.md) section 1) | `cost_ledger.cost_micros` |
| Migrations | `db/migrations/NNNN_snake_name.sql`, never edited after merge | `0001_accounts.sql` |
| HTTP routes | pages at kebab-case paths; JSON API under `/api/`, plural nouns, ids as path segments | `GET /api/projects/:projectId/runs` |
| Environment variables | `ROSETTA_` prefix for Rosetta's own; provider and database names as the ecosystem uses them | `ROSETTA_SECRET_KEY`, `DATABASE_URL` |

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
- Standard output carries results (and `--json`); progress and logs go to standard error (RF-004).

## 5. Asynchronous code

- No floating promises and no promises in places that expect a value. **(tool: `no-floating-promises`,
  `no-misused-promises`)**
- Every network call has a timeout and accepts an `AbortSignal`; Ctrl+C and budget caps cancel through the same
  signal (RF-422, RNF-002).
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
  say whether the user or the resource exists.

**Error-code catalogue** (canonical; a new code gets the next free number in its range):

| Range | Area |
|---|---|
| RST-1000..1099 | configuration: server environment and project settings (CLI usage until DEC-59) |
| RST-1100..1199 | file system, ignore rules, output folder |
| RST-1200..1299 | scan and language packs |
| RST-1300..1399 | agent loop, tools and card parsing |
| RST-1400..1499 | verifier |
| RST-1500..1599 | providers |
| RST-1600..1699 | budget and cost |
| RST-1700..1799 | report and export |
| RST-1800..1899 | plan |
| RST-1900..1999 | GitHub sources (URL, ref resolution, snapshot download, rate limits) |
| RST-2000..2099 | web UI and HTTP server (routes, validation, CSRF, headers) |
| RST-2100..2199 | logging and observability |
| RST-2200..2299 | accounts, sign-in, sessions, roles and audit (RF-1100..RF-1109) |
| RST-2300..2399 | provider keys, caps and the run queue (RF-1104, RF-1106, RF-1108) |
| RST-2400..2499 | database and migrations (RF-1302) |
| RST-2500..2599 | deployment, start-up and health (RF-1300..RF-1306) |

## 7. Tests

- Vitest projects `unit`, `integration`, `e2e` under `tests/<level>/`; the level is the project, so every test has
  one. Split about 60 / 30 / 10 as a guideline that warns (DEC-30); a run with zero tests fails.
- **Test names start with the requirement id** they prove, then the behaviour (ADR-010):
  `it('RF-422 stops the run when the next call would exceed the cap', ...)`. Tests for internal helpers name the
  requirement their caller serves.
- Arrange, act, assert; one behaviour per test; no logic in tests beyond setup tables (`it.each`).
- Unit tests touch no disk, network, clock or randomness; integration tests cross exactly one real boundary (the file
  system in a temporary folder from `fs.mkdtemp`, a disposable PostgreSQL, the HTTP server in process through
  `fastify.inject`, or a recorded provider); end-to-end tests drive a browser with Playwright against a running
  server.
- Every route has a row in the access matrix test (anonymous, user, other user, administrator) (RF-1105).
- No real provider calls: the test setup sets `ROSETTA_TEST=1` and blocks outbound network; providers are the fake
  provider with recordings in `tests/recordings/` (ADR-008).
- Every port has a contract test suite that the real adapters and the fakes both pass.
- No `.only`, no skipped tests on `main`, no snapshot for something an assertion can state. **(tool:
  `@vitest/eslint-plugin`)**
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
- TDD order on every code card: `test:` commit(s) with failing tests, then `feat:`/`fix:`, then optional
  `refactor:` (ADR-010).
- Pull requests use the template, close their issue, and are merged by the owner with squash; the squash title is the
  pull request title in Conventional Commit form.

## 10. Lint configuration summary

`eslint.config.ts` (flat): `@eslint/js` recommended; `typescript-eslint` `strictTypeChecked` and
`stylisticTypeChecked` with `parserOptions.projectService: true`; `eslint-plugin-n` `flat/recommended-module`;
`@vitest/eslint-plugin` recommended on `tests/**`; `eslint-config-prettier` last. Added rules, all errors:
`consistent-type-imports`, `switch-exhaustiveness-check`, `no-import-type-side-effects`,
`explicit-module-boundary-types`, `prefer-readonly`, `no-restricted-exports` (default), `no-console` (except
`src/presentation`), `eqeqeq`, `complexity` 10, `max-depth` 3, `max-params` 4, `max-lines` 300,
`max-lines-per-function` 50, `n/no-sync`, `n/prefer-node-protocol`. Lint runs with `--max-warnings 0`. A disabled rule
needs an inline `eslint-disable-next-line <rule> -- <reason>`; blanket disables are forbidden. **(tool)**

`.dependency-cruiser.cjs`: `domain` may import only `domain`; `application` only `domain` and `application`;
`infrastructure` may not import `presentation`; nothing in `src` imports `tests`; no circular dependencies; no
dependency missing from `package.json`; provider SDKs, `web-tree-sitter` and `yazl` only from `src/infrastructure`.
**(tool)**
