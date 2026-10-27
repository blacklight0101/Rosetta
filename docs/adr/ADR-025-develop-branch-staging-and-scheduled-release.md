# ADR-025: Integrate on develop, deploy it to staging, release main at 06:00 Madrid

**Date**: 2026-10-27
**Status**: Accepted
**Deciders**: BlackLigth (blacklight0101)

## Context

Teachers can sign in to the hosted app (ADR-024) at any time, and every merged card went into `main`, which is what
Release deploys. A change could reach them unannounced and untried outside CI. The owner decided (DEC-175) that
changes must be tried on a hosted copy first and reach production only in a batch he approves, at a fixed early
hour. The hosting budget of ADR-024 (25 USD a month) leaves no room for a second environment, server or database.

## Options Considered

1. `develop` as integration and default branch, every push deployed to a staging app that shares the Container Apps
   environment, storage account and PostgreSQL server of production; a release pull request `develop` -> `main`
   merged by the owner with a merge commit; production deployed by a scheduled workflow at 06:00 Europe/Madrid.
2. Keep `main` only, and deploy by hand on the owner's word after each batch.
3. A fully separate staging (own environment, server and roles).
4. Do nothing: every merge into `main` may be deployed at any time.

## Decision

We choose option 1. Task cards merge into `develop` (squash, linear); `staging.yml` deploys each push of `develop` to
`ca-rosetta-staging` with its own database `rosetta_staging` and share; the owner merges the release pull request
into `main` with a merge commit; `scheduled-release.yml` starts Release on `main` at 06:00 Madrid; the deploy refuses a
`main` whose tree differs from its develop parent or whose develop parent did not pass `deploy (staging)`. While the repository variable `ROSETTA_STAGING_ENABLED` is not `true` (no staging app yet), the check is skipped with a warning in the job summary (the owner's word of 2026-10-27: the first release goes out before the staging app exists); once it is `true` the check is enforced and the input `skip-staging-check` is the only override.

## Rationale

- Teachers see changes only at 06:00 after the owner's merge, and only code that ran on a hosted copy (DEC-175).
- Sharing the environment, storage account and server adds an app that scales to zero, a share and a database: close
  to no cost against the ADR-024 budget, where option 3 adds a second PostgreSQL server billed every hour.
- A merge commit keeps `develop` an ancestor of `main`, so "the same tree" is a plain `git` comparison.
- Option 2 depends on someone remembering; option 4 is what the owner rejected.

## Consequences

**Positive**

- One hosted copy to try a batch on; production changes at a known hour; an emergency path stays (`skip-staging-check`).

**Negative**

- `main` gets merge commits; linear history is kept on `develop` only.
- The staging app holds the production roles (`rosetta_app`, `rosetta_migrator`; one server, so one set of roles), so
  staging code could reach the production database. Accepted for cost; listed in the threat model. Staging never
  sets a role password and gets no server provider keys.
- Production rebuilds the image from the `main` merge commit instead of promoting the staging digest; the tree check
  guarantees the same source, not the same bytes (base image updates between the two builds are possible).
- A hotfix goes through `develop` too; a commit made only on `main` fails the tree check.
- Scheduled runs can be delayed; a run that misses the 06 hour waits for the next morning.

## References

- DEC-175 (this decision), DEC-96 (orchestrator merges), DEC-104 (deploy from `main`), DEC-171.
- ADR-024 (hosting; extended here with the staging app), ADR-014 (one image), ADR-016 (roles).
- RF-1302, RF-1304, RNF-003; `docs/environments-and-delivery.md` sections 5, 8, 10; `docs/runbooks/deploy.md`.
