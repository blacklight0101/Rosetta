# ADR-028: Start the production release on time from a Container Apps job

**Date**: 2026-11-04
**Status**: Proposed
**Deciders**: BlackLigth (blacklight0101)

## Context

ADR-025 promises that production changes at 06:00 Madrid, started by a GitHub `schedule` trigger. GitHub started the
first scheduled run of each day from 2026-10-28 to 2026-11-02 between 10:17 and 12:13 UTC, 5 h 10 min to 7 h 06 min
after its 05:07 UTC slot, and none had started on 2026-11-03 by 08:07 UTC; a run started by `workflow_dispatch` starts
within seconds (Q-63). The owner decided (DEC-207) that Release starts on time from a scheduler that does not depend
on GitHub's queue, and that every check runs before that hour. This ADR chooses the scheduler. It only chooses: the
accepted decision is followed by a provisioning step that the owner runs.

## Options Considered

1. **A Container Apps job** in the existing environment (ADR-024), with one cron schedule that fires at
   04:00 and 05:00 UTC. The job goes on only when the hour in Europe/Madrid is 06 (cron is in UTC, and summer and
   winter time differ by one hour) and starts Release on `main` by `workflow_dispatch`. It uses a fine-grained token
   limited to this repository with Actions write, stored as a secret of the job. It has no other access and reads no
   other secret.
2. **A Logic App** with a recurrence trigger set to the Madrid time zone and an HTTP action that dispatches Release
   with the same token.
3. **Deploying from Azure with a managed identity**: the 06:00 job runs the restore point, migration, image switch and
   smoke test itself, and no GitHub token exists.
4. **Do nothing**: keep the GitHub schedule and correct the documents to say that production updates around midday.

## Decision

We choose option 1. The job image is small, the guard on the Madrid hour is one tested script, and the job lives in the
environment, resource group and bill that ADR-024 already has. The token is created by the owner for this repository
only, expires after 90 days, and its rotation is a dated step in the deploy runbook: an expired token makes the job
fail in its execution history and Release does not start, and the owner then runs Release by hand on `main`.

## Rationale

- Option 1 and the cron pair keep the hour right on both sides of the clock change without a time-zone feature, and a
  job execution that lasts seconds is billed per second.
- Option 2 handles the time zone itself, but adds a service of another kind to provision and a token kept in a designer
  definition instead of a tested script; it is the fallback if the owner prefers it.
- Option 3 removes the token but moves the release out of Release, and with it the `production` environment gate and
  the notification comment of RF-1304. GitHub has no managed-identity trust for calls into GitHub, so the token is the
  price of keeping Release.
- Option 4 is the default answer of Q-63 and is what the owner rejected (DEC-207).

## Consequences

**Positive**

- Release starts at 06:00 within seconds; the checks have already passed on that commit (RF-1304).

**Negative**

- One secret that can start Actions runs outside GitHub; its reach is one repository and Actions write. A leak lets
  someone start and cancel workflow runs and read their logs and artifacts, not read code or secrets; the rotation and
  the narrow scope are the limit.
- A new resource to provision and a step to remember every 90 days.
- The GitHub schedule of ADR-025 stays as a backup until two mornings have started on time.

## References

- DEC-207, DEC-175, Q-63; RF-1304.
- ADR-024 (the environment), ADR-025 (amended by this decision; see its note of 2026-11-04).
- Cards P8-62 (this ADR), P8-63 (checks workflow), P8-20 (split by DEC-214).
