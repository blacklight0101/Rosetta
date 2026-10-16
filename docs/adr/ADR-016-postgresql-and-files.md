# ADR-016: PostgreSQL for accounts and indexes, files on a persistent disk for snapshots and runs

**Date**: 2026-10-11
**Status**: Amended
**Deciders**: BlackLigth (blacklight0101)

## Context

Accounts, sessions, encrypted keys, per-user projects, the run index, the cost ledger (server-wide caps need sums
across users) and the security audit now need concurrent, transactional storage (DEC-65). DEC-37 said that any
database is PostgreSQL behind an infrastructure adapter. Snapshots and run folders are large trees of files that
the data model already defines (data-model.md).

## Options Considered

1. PostgreSQL for relational data, accessed with the `pg` driver and plain parameterised SQL in repository adapters,
   with numbered SQL migrations run by a small runner at start-up; snapshots and run folders stay files on a
   persistent disk.
2. PostgreSQL with an ORM (Prisma, Drizzle, TypeORM).
3. Files only (JSON documents for users and sessions on the disk).

## Decision

We choose option 1.

- **Driver**: `pg` with a connection pool; only parameterised queries (`$1, $2`), never string-built SQL; SQL lives
  in the repository adapters under `src/infrastructure/db/`.
- **Migrations**: `db/migrations/NNNN_name.sql`, applied in order inside a transaction each, recorded in
  `schema_version` with a SHA-256 checksum; an applied migration is never edited; the server refuses to start when
  the database has a migration it does not know (RF-1302).
- **Accounts**: two database roles - `rosetta_migrator` (owns the schema, used only by the migration runner) and
  `rosetta_app` (data rights only, no DDL) (data-model.md section 6).
- **Files**: `ROSETTA_DATA_DIR` (a named volume locally, a persistent disk when hosted) holds the shared snapshot
  cache and one workspace per user with its run folders; the database indexes them by id and never stores file
  contents.
- **Tests**: integration tests run against a disposable PostgreSQL started for the test run (a container), with
  every migration applied (data-model.md section 8).

## Rationale

- Plain SQL with `pg` keeps the dependency small and every query visible for review, which suits a handful of
  tables; an ORM (option 2) adds a large dependency and generated code for little gain.
- Files only (option 3) cannot give transactions for sign-in lockout, session expiry and server-wide cost caps
  without building a database by hand.

## Consequences

**Positive**
- Transactions for caps and lockouts; SQL injection is ruled out by construction (parameterised queries only, a
  lint rule bans template literals passed to `query`).

**Negative**
- A database to run, migrate and back up, locally (Compose) and hosted (managed PostgreSQL).

## References

- DEC-37, DEC-65; RF-1302; data-model.md sections 4..9.

## Notes

- 2026-10-16 (DEC-140, P1-158, from the P1-49 review F-02 and F-19): the migrations no longer run inside the serving
  process. A one-off **migrate step** (the same image, `node dist/presentation/migrate.js`; the `migrate` service of
  `compose.yaml` locally, its own one-off job hosted) applies them with `DATABASE_MIGRATOR_URL` only, under the
  advisory lock, and exits; running it again applies nothing. The server starts only after it has succeeded, holds
  `DATABASE_URL` only and never migrates: it refuses to start (RST-1000) when `DATABASE_MIGRATOR_URL` is set and names
  the variable to remove. So that a new image still never serves an old schema, `rosetta_app` may `SELECT` (and do
  nothing else on) `schema_version` (migration `0010`), and the server refuses to start when a migration is pending
  (RST-2405), changed (RST-2401) or unknown (RST-2402). When `DATABASE_URL` connects as the owner of the schema (a
  host that offers one role), the server starts and logs a warning, because that role can change audit and ledger
  rows. The decision bullets above still hold, with "a small runner at start-up" read as "a one-off step before the
  server starts" and "the server refuses to start when the database has a migration it does not know" kept as is.
