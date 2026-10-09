# Conventions: naming, errors and user-facing behaviour

| | |
|---|---|
| **Status** | Proposed (2026-10-09) <!-- FILL: Accepted once the owner has reviewed it; add "revised YYYY-MM-DD for DEC-nn" on every later change --> |
| **Scope** | names for code, database objects, files, routes, permissions, configuration keys, resources, tests, branches and commits; error codes and handling; log fields; versioning; what the user sees when something is down |
| **Related** | [CLAUDE.md](../CLAUDE.md) hard rules, [data model](data-model.md) section 1 (database), [design system](design-system.md) (UI patterns), [architecture](architecture.md) sections 4 and 11, [orchestration](orchestration/README.md) (branch and commit names) |

Every name a builder invents is fixed here first. A convention that is missing is added to this document in the
same branch that needs it. Where this document and a stack preset disagree, this document wins and the
difference is recorded in an ADR.

<!-- FILL: Fill every table for the chosen stack. The examples are generic placeholders; replace them with names
from this project. Delete rows that do not apply. Keep the tables short: a rule plus one example is enough. -->

## 1. Code

| Item | Rule | Example |
|---|---|---|
| Root namespace or package | <!-- FILL --> | `RST.Application` <!-- FILL: example, replace --> |
| Folders | exactly those of [architecture](architecture.md) section 4 | |
| Types | <!-- FILL: casing, one type per file, sealed or final by default, suffixes by role (Service, Repository, Client, Adapter, Job, Dto, Result) --> | `RequestService` |
| Fakes | `Fake<Port>` next to the adapters or in the test project when only tests need them | `FakeExternalSystemAClient` |
| Async | <!-- FILL: suffix and cancellation parameter rule --> | |
| Enums | singular, members equal to the database check-constraint values | `RequestState.Submitted` |
| Constants and literals | no business literals (site codes, device ids, time-zone ids, shift times) in code; they are data | |

## 2. Database

Per [data model](data-model.md) section 1. Queries in code are parameterised and schema-qualified, never built by
string concatenation of values or identifiers; select lists are explicit.
<!-- FILL: where SQL lives in code (constants named by intent, files, an ORM), or "Not applicable". -->

## 3. Files and documents

| Item | Rule | Example |
|---|---|---|
| Requirements | ids `RF-nnn` / `RNF-nnn`, never renumbered or reused; withdrawn items keep their id with "Withdrawn YYYY-MM-DD - see ..." | `RF-001` |
| ADRs | `ADR-nnn-kebab-title.md` in the `adr` folder, title starts with a verb | `ADR-001-record-architecture-decisions.md` |
| Migrations | `NNNN_PascalName.sql` in the block of its card or module ([data model](data-model.md) section 7) | `0010_Requests.sql` |
| Scripts and tools | <!-- FILL --> | |
| Other files | <!-- FILL: casing for source files, assets, resource files --> | |

## 4. Routes and API

| Area | Route pattern | Example |
|---|---|---|
| <!-- FILL: example row, replace --> Pages | `/<area>` and `/<area>/{id}` | `/requests/42` |
| <!-- FILL: example row, replace --> Admin | `/admin/<catalogue>` | `/admin/users` |
| <!-- FILL: example row, replace --> API | `/api/v1/<resource>`, kebab-case plural | `/api/v1/work-items` |

Lower-case, kebab-case, no trailing slash. Public identifiers on the API are opaque (for example GUIDs), never the
internal integer key. <!-- FILL: adapt for a game, CLI or mobile app, or mark "Not applicable". -->

## 5. Tests

- Test files mirror the subject: `RequestTests`, `RequestServiceTests`, `RequestRepositoryTests`.
- Test names: <!-- FILL: one style, e.g. `Given_<state>_When_<action>_Then_<outcome>` or
  `<Action>_<Condition>_<Result>` -->.
- Every test declares its level (Unit, Integration, E2E) so the pyramid can be counted.
  <!-- FILL: how, in this stack: trait, tag, folder. -->
- End-to-end journeys are named `Journey_<Area>_<Name>`.

## 6. Branches, commits and tags

- Branch `task/<card-id>-<slug>` in lower case, one task card per branch (`task/p1-03-request-repository`).
  Follow-up cards use their own card id. The orchestration protocol ([orchestration](orchestration/README.md))
  is the source of these names and wins over any other convention. A documentation-only change that belongs to
  no card uses `docs/<topic>`.
- Commit subject `<card-id>: <title>` (`P1-03: Request repository with concurrency check`), followed by one or
  more `Refs: RF-nnn, ADR-nnn` lines and the attribution line the session's instructions give. The merge into
  `main` (fast-forward or squash) keeps the same message; history stays linear.
- Release tags `v<major>.<minor>.<patch>` on `main` only (section 12).

## 7. Error codes and user-facing messages

Every business or technical error shown to a user carries a stable code `E-<AREA>-<nnn>` (`E-AUTH-001`,
`E-EXTA-412`) from one code catalogue, with one resource key per code (`Errors.<AREA>.<nnn>`, section 11) holding
the user text. The page shows the code, the text and the correlation id, so a user can report a problem in any
language. The catalogue's completeness (every code has a text in every enabled language, no duplicate number per
area) is unit-tested.

<!-- FILL: list the areas (short uppercase codes) and who owns each range, e.g. AUTH, DB, EXTA for External system
A, VAL for validation. -->

| Area | Meaning | Owner |
|---|---|---|
| <!-- FILL: example row, replace --> `VAL` | input validation | core |

Error handling per layer is in [architecture](architecture.md) section 11. Additional rules:

| Where | Rule |
|---|---|
| Pages | business error: message with the code and text; technical error: error state with the correlation id and a retry; unhandled: global error boundary with the correlation id, never a stack trace |
| API | problem details (RFC 7807): `type`, `title`, `status`, `detail`, `instance` = request id, `errors` for validation; no stack traces |
| Retries | a user never has to "press again" to finish an operation; a repeated action is made harmless by an idempotency key ([architecture](architecture.md) section 8.3) |

### 7.1 What the user sees when something is down

<!-- FILL: One row per dependency that can fail (external system, device, directory, database, connection to the
server). Decide the behaviour before building, together with the owner: can work continue, what is queued, what
text and status indicator the user sees, who is alerted. -->

| Situation | Behaviour |
|---|---|
| <!-- FILL: example row, replace --> External system A unreachable | the action is saved and queued; the page shows "External system A not reachable, N items waiting since HH:mm"; nothing for the user to do; an alert after the queue age threshold |
| <!-- FILL: example row, replace --> Outcome of a call unknown | item marked as waiting for confirmation; reconciliation resolves it; no "press again" |

## 8. Logging fields

Every log entry is structured and carries the fields below. An error without an event id fails the tests.

| Field | Rule |
|---|---|
| `EventId` | from the event catalogue, `<Area>.<Event>` (`Requests.Submitted`) |
| `Level` | Trace, Debug, Information, Warning, Error, Critical |
| `ErrorCode` | for errors: the `E-<AREA>-<nnn>` code of section 7 |
| `CorrelationId` | one per user action or job item, carried through services, adapters, external calls and audit rows |
| `Operation`, `Module` | what was running and which module owns it |
| `User`, `DurationMs`, `Outcome` | who, how long, Ok / BusinessError / TechnicalError |
| `Exception` | full chain for errors |
| `Data` | a redacted bag of inputs; never a credential, token, connection string or secret-bearing payload |
| <!-- FILL: example row, replace or delete --> `BuildVersion`, `Site` | build and deployment context |

## 9. Configuration keys

- Keys are `Section:Key` in PascalCase (`ExternalSystemA:Endpoint`); environment-variable form
  `Section__Key`. <!-- FILL: adapt to the stack's configuration system. -->
- A value that users or admins change at runtime is data in the database (a settings table), not configuration.
- Secrets are never values in a committed file; the key holds a reference or the value comes from the secret
  store of [environments and delivery](environments-and-delivery.md) section 4.
- Every key is listed once, with its meaning, in [architecture](architecture.md) section 15.

## 10. Permission codes

`<area>.<action>` in lower case, or `<area>.<subject>.<action>` for a sub-area: `requests.view`,
`requests.create`, `requests.approve`, `users.manage`. A page, endpoint or service action names exactly one
permission; composite needs are separate codes. Roles are data that group codes; authorization never checks a
role name. Codes flagged administrative are listed in the permission catalogue and are never granted to shared
or generic accounts. <!-- FILL: the code catalogue location and the list of areas, or "Not applicable: no
authorization beyond sign-in". -->

## 11. UI text and localisation keys

- Keys `<Area>.<Screen>.<Element>` in PascalCase: `Requests.List.Title`, `Common.Actions.Save`,
  `Validation.Required`, `Errors.VAL.001`.
- No user-visible text in code, SQL, e-mail or document templates; texts come from resource files per language,
  data-carried texts (menu labels, catalogue names) from rows per language.
- A message for an external outcome has a key per outcome, never the raw external text as key.
- Business formats (identifiers, codes, dates sent to other systems) never follow the UI culture.
- A test fails on a key missing in any enabled language.

<!-- FILL: the languages at launch, the fallback chain (user, then site default, then English), where resource
files live, or "Single language: English; keys still used so a language can be added". -->

## 12. Versioning

- Version `<major>.<minor>.<patch>` <!-- FILL: meaning of each part, e.g. major = release, minor = phase or
  feature drop, patch = build or fix -->, stamped into the build, the health page and every log entry.
- A release is a tag on `main`, a published artefact per deployable and a line in the release notes
  ([environments and delivery](environments-and-delivery.md) section 8).
- APIs are versioned in the route (`/api/v1/`); a breaking change is a new version, never an edit of the old one.
- The database schema version is the applied migration set ([data model](data-model.md) section 7).
