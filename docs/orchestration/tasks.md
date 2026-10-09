# Task cards - Rosetta

Protocol: [README.md](README.md). Plan written 2026-10-09. Every finished card is checked by the verifier before it is
merged. The orchestrator edits only the **Status** line of a card and appends follow-up cards; it never rewrites a
card. Card ids are never renumbered or reused.

## Totals (canonical)

This table is the only canonical place for card counts. `handoff.md` and `README.md` link here; any number they repeat
is re-checked against this table whenever a card is added, withdrawn or re-tiered (README section 11).

| Phase | Cards | sonnet | opus | fable | S | M | L | Follow-ups | Withdrawn |
|---|---|---|---|---|---|---|---|---|---|
| P1 Foundation | 3 | 1 | 1 | 1 | 0 | 2 | 1 | 0 | 0 |
| **Total** | **3** | **1** | **1** | **1** | **0** | **2** | **1** | **0** | **0** |

<!-- FILL: one row per phase of docs/roadmap.md that has cards (P0 is the documentation phase and has none). Recount
after every change: "Cards" counts every card heading in the phase including withdrawn ones; the tier and size
columns count the same cards; "Follow-ups" and "Withdrawn" say how many of them are follow-up cards and withdrawn
cards. The numbers above describe the three example cards below. -->

## Conventions for every card

- **Card format**: heading `### P<phase>-nn - Title`, then the fields Builder, Size, Depends on, Gate, Status, Reads,
  Do, Delivers, Done when, Refs, one per line, in that order.
- **Builder**: `sonnet` | `opus` | `fable` (agents `builder-sonnet`, `builder-opus`, `builder-fable`; tier criteria in
  README section 2).
- **Size**: S (at most half a day for a builder), M (about a day), L (two to three days). Nothing larger; split it.
- **Status**: `Todo` | `In progress` | `In review` | `Done` | `Blocked (<reason>)`, where the reason is a gate
  (`G-nn`), an open question (`Q-nn`), `escalated YYYY-MM-DD - see handoff.md` or `withdrawn YYYY-MM-DD - see <id>`.
  A part of a card can wait while the rest runs: `Todo; <part> Blocked (Q-nn)`.
- **Common Reads** for every card, not repeated on the cards: `CLAUDE.md`, `docs/architecture.md`, the requirement ids
  in *Refs* inside `docs/spec/requirements.md`, the ADRs in *Refs*, and `docs/legacy-sources.md` when a `DEF-nn` is
  cited. <!-- FILL: add the template repository the builders copy patterns from, if any, with its path. -->
- **Test mix**: every card is built test-first (README section 1). Unless a card says otherwise, domain and
  application work delivers unit tests; persistence, HTTP boundaries, adapters and jobs deliver integration tests (one
  real boundary) plus unit tests for their pure parts; pages deliver service tests; the E2E cards cover the browser
  journeys. The release pyramid is enforced by the verification-matrix card.
  <!-- FILL: name the E2E cards (one per phase that delivers user journeys) and the verification-matrix card. -->
- **Ownership**: every shared component, table, migration number block and module is built by exactly one card; a card
  that needs something another card owns depends on that card, directly or through its chain.
  <!-- FILL: list the owners here when there are more than a handful (e.g. "P1-04 owns the UI shell and the general
  components; P2-03 owns the data grid"). -->
- **Follow-up cards**: a verifier MINOR finding or a defect found after merge becomes a card with the next free
  `P<phase>-nn` of the phase that owns the affected work, appended at the end of that phase's section, its title
  starting with `Follow-up:` and its Refs naming the originating card (README section 9). When the defect needs a
  test, the card's first step is a failing test that reproduces it.
- **Gates and open questions**: gate G-01 gates P1-01, and every other card reaches P1-01 through its dependencies. A
  card uses the stated default of an open question whose Status is "Default applies"; only when no safe default exists
  is the dependent part marked `Blocked (Q-nn)`.

---

## Phase 1 - Foundation

<!-- FILL: replace the three example cards with the real Phase 1 cards derived from docs/roadmap.md, following
references/build-plan.md in the project-blueprint skill. Keep the field order. Reads names exact sections; Done when
lists only checks the verifier can run. -->

### P1-01 - Scaffold the solution
- **Builder**: sonnet
- **Size**: M
- **Depends on**: none
- **Gate**: G-01
- **Status**: Blocked (G-01)
- **Reads**: `docs/architecture.md` section on layers and solution layout; `docs/conventions.md` naming section; `docs/environments-and-delivery.md` package baseline.
- **Do**: create the solution and projects exactly as the architecture's layout, with project references that follow the dependency rule; shared build properties (nullable on, warnings as errors in source projects); pinned SDK or toolchain version; editor configuration; the test project with the level markers of README section 1 and one placeholder test per level that can run; a test filter per level works.
- **Delivers**: the solution tree; build configuration files; the test project; the build and test commands of README section 1 run green.
- **Done when**: the verifier runs the build and test commands; the innermost layer has zero project references (verifier reads the project files); the created tree matches the layout section of `docs/architecture.md`; running the tests filtered by level `Unit` runs only unit tests.
- **Refs**: ADR-nnn, RNF-001. <!-- FILL: the real ids (e.g. the stack ADR and the maintainability RNF). -->

### P1-02 - Database bootstrap and migrations runner
- **Builder**: opus
- **Size**: M
- **Depends on**: P1-01
- **Gate**: none
- **Status**: Todo
- **Reads**: `docs/data-model.md` sections on conventions, the foundation tables, grants and migration numbering; `docs/environments-and-delivery.md` section on secrets.
- **Do**: a runner that applies numbered, idempotent migration scripts in order and records each applied script in a schema-version table; the database name is a parameter; the first migrations create the foundation tables of the data model with the names, constraints and grants it states; passwords and connection strings come from a secure prompt or secret store, never from the repository; a test-database helper creates a fresh database per test run.
- **Delivers**: the runner and its usage notes; the foundation migrations with the numbers `docs/data-model.md` assigns to this card; a schema test comparing the created objects and grants with the data model; integration tests for the runner.
- **Done when**: the verifier runs the runner twice on an empty local database and the second run changes nothing; the schema test passes; a grep for `Password=` in committed files finds nothing; the created objects match the data model's tables for these migration numbers.
- **Refs**: ADR-nnn, RNF-nnn. <!-- FILL: the data-model ADR, the security and data RNFs. -->

### P1-03 - Authentication and authorization
- **Builder**: fable
- **Size**: L
- **Depends on**: P1-02
- **Gate**: none
- **Status**: Todo
- **Reads**: `docs/architecture.md` section on authentication and authorization; `docs/spec/requirements.md` sign-in and permission requirements; the authentication ADR.
- **Do**: the sign-in path of the chosen identity provider; claims built from the stored user and permissions; one authorization policy per permission code, registered from the permission catalogue, with a start-up check that every policy name used by a page or endpoint exists; no anonymous route except the health check; a test authentication scheme for integration and E2E tests; a development-only impersonation switch that is off outside development.
- **Delivers**: the host's authentication and authorization setup; the permission catalogue; the test authentication handler; integration tests: unknown identity is refused, a user with the permission gets the page, a user without it is refused, an unknown policy name fails start-up.
- **Done when**: the verifier runs the tests; a grep shows no anonymous attribute outside the health check; claims never use role names for authorization decisions; the security checks of README section 5 step 10 pass; every RF-001 scenario has a passing test.
- **Refs**: ADR-nnn, RF-001, RNF-nnn. <!-- FILL: the real sign-in and permission requirement ids and the authentication ADR. -->

