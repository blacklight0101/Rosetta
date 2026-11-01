# Runbook: hosted deployment

How Rosetta runs for the teachers: one container image from GHCR on Azure Container Apps (Consumption plan) in Spain
Central, with Azure Database for PostgreSQL Flexible Server 17, an Azure Files share at `/data` and every secret as a
Container Apps secret ([ADR-024](../adr/ADR-024-host-on-azure-container-apps-spain-central.md), RF-1304, DEC-104,
DEC-171). The procedure follows `docs/environments-and-delivery.md` sections 10 to 12; the backup scripts are in
[backup.md](backup.md); the local stack is in [local.md](local.md).

> History: the first host choice, Railway (ADR-020), was dropped on 2026-10-24 because its sign-ups were paused (DEC-171).

**State on 2026-10-24: provisioned and deployed.** Gates G-07 and G-08 are open; Azure provision and Release ran on
`main`, the smoke test passed and the teacher account signs in, which opened G-06 (first row of Deployment record).
Running either workflow again changes billed resources; the owner says when in chat. The workflows, the smoke script,
the HTTPS redirect of the app, the ZAP baseline in CI and the RNF-017 script are in the repository and tested:

| Piece                      | Where                                                        | Checked by                                                                            |
| -------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Provisioning workflow      | `.github/workflows/azure-provision.yml`                      | `tests/integration/tooling/azure-provision-workflow.test.ts`                          |
| Release and deploy         | `.github/workflows/release.yml`                              | `tests/integration/tooling/release-workflow.test.ts`, `release-staging-check.test.ts` |
| Staging deploy             | `.github/workflows/staging.yml`                              | `tests/integration/tooling/staging-workflow.test.ts`                                  |
| Release at 06:07 Madrid    | `.github/workflows/scheduled-release.yml`                    | `tests/integration/tooling/scheduled-release-workflow.test.ts`                        |
| Smoke script               | `scripts/smoke.mjs`                                          | `tests/integration/scripts/smoke.test.ts`; the `compose-smoke` job of CI              |
| HTTP to HTTPS redirect     | `src/presentation/web/https-redirect.ts`                     | `tests/integration/presentation/web/https-redirect.test.ts`                           |
| OWASP ZAP baseline         | job `zap-baseline` of `.github/workflows/ci.yml`             | runs on every pull request and push to `main`; summary in the job summary             |
| RNF-017 measurement        | `scripts/measure-rnf017.mjs`                                 | `tests/integration/scripts/measure-rnf017.test.ts`                                    |
| Backup and restore scripts | `npm run backup`, `npm run restore` ([backup.md](backup.md)) | the local restore drill of backup.md section 4                                        |

Names used below: resource group `rg-rosetta`, environment `cae-rosetta`, app `ca-rosetta`, migrate job
`caj-rosetta-migrate`, Log Analytics workspace `log-rosetta`, share `rosetta-data`. The storage account
(`strosetta<suffix>`) and the server (`psql-rosetta-<suffix>`) carry a suffix made from
the subscription, because their names are global; the summary of the provisioning run prints them. Staging
(DEC-175, ADR-025) uses the same group, environment, workspace, storage account and server, with the app
`ca-rosetta-staging`, the migrate job `caj-rosetta-stg-migrate`, the database `rosetta_staging` and the share
`rosetta-data-staging` (section Staging).

## Owner steps done on 2026-10-24

Done by the owner in the Azure portal and GitHub; nothing here holds a value.

1. An Azure subscription (pay-as-you-go, free offer).
2. A Cost Management budget of 25 USD a month with alerts at 60% and 100% of actual cost and 100% of forecast cost,
   sent by e-mail to the owner (ADR-024). A budget only alerts; it never stops a resource.
3. The resource group `rg-rosetta` in Spain Central (`spaincentral`).
4. The deploy identity: an Entra application with a federated credential for the subject
   `repo:blacklight0101/Rosetta:environment:production` and the role Contributor on `rg-rosetta` only. GitHub logs in
   with OIDC (`azure/login`); no long-lived Azure secret is stored in GitHub. The repository uses immutable OIDC
   subjects (`use_immutable_subject`), so the credential that matches is a second one, `github-production-immutable`,
   for `repo:blacklight0101@<owner id>/Rosetta@<repository id>:environment:production`; without it the login fails
   with AADSTS700213 (first provisioning run, 2026-10-24).
5. In GitHub, Settings, Environments, `production`, the variables `AZURE_CLIENT_ID`, `AZURE_TENANT_ID` and
   `AZURE_SUBSCRIPTION_ID` of that identity.

## Owner steps before the first run

In order, by the owner; each needs rights or settings that the deploy identity and the workflows do not have.

1. Register the resource providers `Microsoft.App`, `Microsoft.OperationalInsights`, `Microsoft.DBforPostgreSQL` and
   `Microsoft.Storage` on the subscription (`az provider register --namespace <name>`); a Contributor on one resource
   group cannot register them.
2. Check that the GHCR package `ghcr.io/blacklight0101/rosetta` is public (GitHub, Packages, Package settings): the
   Container App pulls it anonymously and no registry is set (azure-cli refuses to add a registry other
   than Azure Container Registry without a user name and password).
3. Run Release by hand on `main` and read the `sha-<short>` tag in the summary of the image job.
4. Add the `production` secrets of the next section.
5. The `production` environment's deployment branch policy: done on 2026-10-24, set to only the branch `main` (no
   tags). The federated credential names only the environment, so this is what keeps every other ref away from Azure
   and from the secrets. A Release run started by a pushed `v*` tag still builds and pushes the image, but its deploy
   job is refused by the environment; deploys therefore run Release by hand on `main` (section Deploy).
6. Run Azure provision (section Provisioning). Afterwards, put the `CanNotDelete` lock on the server, which the
   Contributor identity cannot do; the server name is in the summary of the run:
   `az lock create --name rosetta-db-no-delete --lock-type CanNotDelete --resource-group rg-rosetta --resource <server> --resource-type Microsoft.DBforPostgreSQL/flexibleServers`.
7. Set the `production` variables `ROSETTA_PUBLIC_URL` (from the summary) and `ROSETTA_SMOKE_USER`, and the secret
   `ROSETTA_SMOKE_PASSWORD`, once the teacher account exists (section Teacher account); then, last, the repository
   variable `ROSETTA_DEPLOY_ENABLED` = `true`.
8. One day later, the cost check (section Cost check after day one).

## Environment secrets the owner adds

In GitHub, Settings, Environments, production, before the first provisioning. The values come from the password
manager and go nowhere else: not into the repository, an issue, a chat or a log. A missing required secret stops the
job with its name and no value.

| Name                          | Kind     | Required           | Used by                     | Meaning                                                                                      |
| ----------------------------- | -------- | ------------------ | --------------------------- | -------------------------------------------------------------------------------------------- |
| `ROSETTA_SECRET_KEY`          | secret   | yes                | provisioning                | 32 random bytes, base64 (`openssl rand -base64 32`); keep a copy in the password manager     |
| `ROSETTA_ADMIN_USER`          | secret   | yes                | provisioning                | the bootstrap administrator (RF-1102)                                                        |
| `ROSETTA_ADMIN_PASSWORD`      | secret   | yes                | provisioning                | its first password, changed at the first sign-in                                             |
| `ROSETTA_SECRET_KEY_PREVIOUS` | secret   | no                 | provisioning                | only during a key rotation                                                                   |
| `OPENAI_API_KEY`              | secret   | no                 | provisioning                | server key (DEC-64)                                                                          |
| `ANTHROPIC_API_KEY`           | secret   | no                 | provisioning                | server key (DEC-64)                                                                          |
| `ROSETTA_GITHUB_TOKEN`        | secret   | no                 | provisioning                | becomes the app's `GITHUB_TOKEN` (GitHub does not allow a secret name that starts `GITHUB_`) |
| `ROSETTA_SMOKE_PASSWORD`      | secret   | yes, for deploys   | deploy job of `release.yml` | the teacher password                                                                         |
| `ROSETTA_SMOKE_USER`          | variable | yes, for deploys   | deploy job of `release.yml` | `teacher`                                                                                    |
| `ROSETTA_PUBLIC_URL`          | variable | yes, for deploys   | deploy job of `release.yml` | the https URL printed by the provisioning run                                                |
| `ROSETTA_DEPLOY_ENABLED`      | variable | repository, `true` | `release.yml`               | switches the deploy job on; set it last                                                      |

The job makes the rest itself: the database passwords (`openssl rand`), `DATABASE_URL` and `DATABASE_MIGRATOR_URL`,
which exist only as Container Apps secrets.

## Provisioning

Starts or changes billed resources; the owner says when in chat. Actions, Azure provision, Run workflow, branch
`main`, input `target` = `production` (the default), input `image-tag` = the `sha-<short>` tag from the summary of a
Release run on `main`. The workflow `azure-provision.yml` runs only by hand (`workflow_dispatch`); with target
`production` only from `main`, in the `production` environment, and never at the same time as a deploy (target
`staging`: section Staging). Running it again converges the same resources and keeps the database passwords the
app already holds; the input `rotate-passwords` makes new ones (section Database roles). The input `db-server` is only
for a restore (section Restore). Secret values reach `az` only as `@file` arguments from a mode-700 folder of the
runner, never on a command line.

It creates, in `rg-rosetta`:

1. the Log Analytics workspace `log-rosetta` (30 days) and the Consumption-only Container Apps environment
   `cae-rosetta` (no workload profiles, so no Dedicated plan);
2. a storage account (Standard LRS, Hot, TLS 1.2, no public blobs) with the Azure Files share `rosetta-data` of 5 GiB,
   registered in the environment and mounted at `/data` with `mountOptions`
   `uid=1000,gid=1000,dir_mode=0755,file_mode=0755`, so the non-root `node` user writes (ADR-024);
3. the Flexible Server: PostgreSQL 17, Burstable B1MS, 32 GiB, backups kept 7 days, `require_secure_transport` on,
   one firewall rule for Azure services only (`0.0.0.0`), the database `rosetta`;
4. a `CanNotDelete` lock on the server. Creating a lock needs Owner or User Access Administrator, which the deploy
   identity (Contributor) does not have; the job then warns, and the owner runs the `az lock create` of Owner steps
   before the first run, step 6;
5. the roles `rosetta_migrator` and `rosetta_app` (section Database roles);
6. the migrate job `caj-rosetta-migrate` (manual trigger, no retry), which runs once with the image and must succeed;
7. the Container App `ca-rosetta`: 0.5 vCPU, 1 GiB, one replica, external ingress on 8080 (HTTP redirected to HTTPS),
   startup, liveness and readiness probes on `/healthz`, the share at `/data`, every secret as a `secretref:` variable,
   plain `ROSETTA_TRUST_PROXY=1`, `ROSETTA_DATA_DIR=/data`, `ROSETTA_PUBLIC_URL` (the https FQDN),
   `ROSETTA_UPLOAD_MAX_MB=100` (DEC-149) and `ROSETTA_LOG_LEVEL=info`. The GHCR package is public, so no registry is
   set (ADR-024 note of 2026-10-24).

It waits until the new revision is ready and `/healthz` answers over HTTPS, then prints the URL, the image and the
resource names in the job summary. Afterwards, copy the URL into the `production` variable `ROSETTA_PUBLIC_URL`.

## Staging

Every push to `develop` deploys to the staging app and runs the smoke test there (`staging.yml`, job
`deploy (staging)`, DEC-175, ADR-025); Release refuses to deploy a `main` whose tree did not pass it. Staging shares
the environment `cae-rosetta`, the workspace, the storage account and the PostgreSQL server with production, with its
own app, migrate job, database and share. It scales to zero (one replica at most) and holds no server provider keys,
so it spends nothing on AI. It holds the production database roles (one server, one set of roles; threat model
section 6), and the provisioning never creates or changes a role password for it: it reads them from the production
app and migrate job (`rotate-passwords` is refused for staging).

Owner steps, once, in order (none holds a value; the values come from the password manager):

1. GitHub, Settings, Environments, New environment `staging`; deployment branch policy: only the branch `develop`.
2. In `staging`, the variables `AZURE_CLIENT_ID`, `AZURE_TENANT_ID` and `AZURE_SUBSCRIPTION_ID` (the same deploy
   identity as production, so staging runs carry its Azure rights over production too: threat model section 6) and the secrets `ROSETTA_SECRET_KEY` (a new value, `openssl rand -base64 32`, never the
   production key), `ROSETTA_ADMIN_USER`, `ROSETTA_ADMIN_PASSWORD` and, optionally, `ROSETTA_GITHUB_TOKEN`. No
   `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`: the staging app never gets them.
3. Two federated credentials on the same Entra application, for the subject
   `repo:blacklight0101/Rosetta:environment:staging` and, because the repository uses immutable subjects (section
   Owner steps done on 2026-10-24, step 4), for `repo:blacklight0101@<owner id>/Rosetta@<repository id>:environment:staging`.
   Write each as a file, for example `staging.json` with
   `{"name": "github-staging", "issuer": "https://token.actions.githubusercontent.com", "subject": "repo:blacklight0101/Rosetta:environment:staging", "audiences": ["api://AzureADTokenExchange"]}`
   (and `github-staging-immutable` with the immutable subject), then
   `az ad app federated-credential create --id <application (client) id> --parameters @staging.json`.
4. Once `develop` exists: Actions, Azure provision, Run workflow, branch `develop`, input target `staging`, input
   `image-tag` = a `sha-<short>` tag already in GHCR (the last one in Deployment record). Production must be
   provisioned first: the run reads the database passwords of `ca-rosetta` and `caj-rosetta-migrate` and stops when
   they are missing. It creates the database `rosetta_staging`, the share, the migrate job and the app, and prints
   the staging URL in its summary.
5. Sign in on the staging URL as the administrator (change the first password), and create a smoke account as in
   section Teacher account (role user, no forced password change). In `staging`, store the variables
   `ROSETTA_PUBLIC_URL` (the staging URL) and `ROSETTA_SMOKE_USER`, and the secret `ROSETTA_SMOKE_PASSWORD`.
6. Last, the repository variable `ROSETTA_STAGING_ENABLED` = `true`; then run Staging by hand on `develop` (or push to
   it) and check that `deploy (staging)` is green.

## Release and image

`release.yml` runs on a pushed `v*` tag, by hand (Actions, Release, Run workflow, branch `main`) or when
`scheduled-release.yml` starts it at 06:07 Madrid, backups until 07:59 (section Release to production); never on a pull request or a push
to `main`.

- **image**: checks that a tag is `v` plus the version of `package.json` and that the commit is on `main`, builds the
  runtime image, scans it with Trivy (a fixable High or Critical finding stops the release), and pushes
  `ghcr.io/blacklight0101/rosetta:sha-<short>` and, for a tag, `:X.Y.Z`. Never `latest` (RF-1300).
- **sbom** (tags only): writes the CycloneDX SBOM of the runtime dependencies and attaches it to the GitHub release of
  the tag (DEC-57), creating the release if the owner has not yet.
- **deploy** (only with `ROSETTA_DEPLOY_ENABLED`): see Deploy. Its condition still names `main` or a `v*` tag, but
  the deployment branch policy allows only `main`: a tag run's deploy job is refused by the `production` environment
  (the image and the SBOM of the tag are still published). Deploys come from `main` only: run Release by hand
  (`workflow_dispatch`) on `main`.

Before v0.1.0 the deployment runs the `sha-<short>` image of `main` (DEC-104): run the workflow by hand on `main` and
read the tag in the summary of the image job.

## Release to production

DEC-175, ADR-025. Teachers may sign in at any time, so nothing reaches production on a merge.

1. Cards merge into `develop`; each push deploys to staging (section Staging).
2. When the owner says a batch is ready, the orchestrator opens one pull request `develop` -> `main` that lists the
   cards in it, labelled `needs-owner`.
3. The owner checks the batch on the staging URL and merges the pull request with **Create a merge commit**, never
   squash or rebase: the deploy needs the merge commit, whose second parent is the `develop` commit staging deployed.
   For a version, the owner then tags that merge commit `vX.Y.Z` (section Release and image).
4. At 06:07 Europe/Madrid the next morning (backups until 07:59), `scheduled-release.yml` starts Release on `main` (once per head commit
   of `main`; only while `ROSETTA_DEPLOY_ENABLED` is `true`). A slot GitHub starts after 07:59 still starts Release when the
   head commit of `main` was merged before 06:00 that day (P7-28, ADR-025); its step summary names the slot and its delay. Release rebuilds the image from `main` and deploys it
   (section Deploy) only when the ZAP baseline passed on the commit, its tree equals the tree of its `develop`
   parent, and `deploy (staging)` passed on that parent. While the repository variable `ROSETTA_STAGING_ENABLED` is not `true` (no staging app yet), the check is skipped with a warning in the job summary (`staging is not enabled; the staging check is skipped (DEC-175)`), so a squash commit on `main` deploys too; once it is `true` the check is enforced and only `skip-staging-check` overrides it.
5. To deploy at once instead of at 06:07, once CI on `main` has passed the `zap-baseline` check:
   Actions, Release, Run workflow, branch `main`. The 06:07 run then sees a successful run of that commit and does
   nothing.
6. Emergency only: the same with the input `skip-staging-check` ticked, which deploys without the staging check and
   writes a warning in the job summary. A fix still goes through `develop` and a release pull request afterwards, so
   `main` and `develop` hold the same tree again; a commit made only on `main` fails the check of every later release.
7. Rollback is unchanged (section Rollback).

## Deploy

`scheduled-release.yml` starts it at 06:07 Madrid, backups until 07:59 (section Release to production); to deploy at once, start it from
Actions, Release, Run workflow, branch `main` (deploys come from `main` only; a tag run is refused by the
environment). The order of `docs/environments-and-delivery.md` section 10 step 4, as the deploy job of
`release.yml` runs it, one deploy at a time and never cancelled half-way:

1. The `zap-baseline` check of `ci.yml` passed on the commit (the job refuses otherwise; threat model section 5).
   Then the tree passed staging: the commit has a second parent, both trees are equal and `deploy (staging)` passed
   on that parent (skipped with a warning while `ROSETTA_STAGING_ENABLED` is not `true`, otherwise only with
   `skip-staging-check`; DEC-175).
2. The settings of the previous sections are stored (the job names any that is missing, never a value).
3. Log in to Azure with `azure/login` over OIDC (`client-id`, `tenant-id`, `subscription-id` from the `production`
   variables; `id-token: write` on this job only).
4. Record the restore point (the UTC time) in the job summary: the point-in-time restore of the server is the backup
   before the deploy, because Burstable servers have no on-demand backup.
5. Set the new image on the migrate job and start it:
   `az containerapp job update --image ghcr.io/blacklight0101/rosetta:sha-<short>`, then `az containerapp job start`.
   The job runs `node dist/presentation/migrate.js` with `DATABASE_MIGRATOR_URL` as its only secret (DEC-140,
   RF-1302). The deploy waits for the execution; any end state but `Succeeded` stops it, and the previous image keeps
   running on the previous schema.
6. `az containerapp update --image ghcr.io/blacklight0101/rosetta:sha-<short>`; wait until the new revision is the
   latest ready one and `/healthz` answers 200 over HTTPS.
7. Run the smoke test (next section).
8. Log out of Azure; record the tag and the date in Deployment record and in `handoff.md`.

## Smoke test

```
ROSETTA_SMOKE_USER=teacher ROSETTA_SMOKE_PASSWORD=<from the password manager> node scripts/smoke.mjs https://<app>.<region>.azurecontainerapps.io
```

(PowerShell: set `$env:ROSETTA_SMOKE_USER` and `$env:ROSETTA_SMOKE_PASSWORD` first; the password is never an argument
and never printed.) It checks, and prints one `ok` or `FAIL` line each:

- `health`: `/healthz` answers 200 with `status: ok` and the version;
- `redirect` (https URLs only): `http://<host>/healthz` answers 301 to the same path on https (RF-1304);
- `landing`: the landing page answers;
- `sign-in`: the account signs in and does not have to change its password (RF-1107);
- `scan`: a cheap scan (no provider) of `ROSETTA_SMOKE_REPO`, by default `dotnet-architecture/eShopModernizing`,
  completes; the project it created is deleted again, so the teacher's workspace stays empty.

Exit 0 means every check passed. The verifier's own check of the redirect:

```
curl -sI http://<app>.<region>.azurecontainerapps.io/healthz     # 301 with Location: https://<app>.<region>.azurecontainerapps.io/healthz
curl -s https://<app>.<region>.azurecontainerapps.io/healthz     # {"status":"ok","version":"..."}
```

The ingress redirects port 80 to 443 itself (insecure connections off) and sets `X-Forwarded-Proto`; the redirect in
the app (`ROSETTA_TRUST_PROXY=1` and an https `ROSETTA_PUBLIC_URL`) stays as the fallback.

## Rollback

Set the previous tag (the one in Deployment record) and wait for `/healthz`, then run the smoke test:

```
az containerapp update --name ca-rosetta --resource-group rg-rosetta --image ghcr.io/blacklight0101/rosetta:<previous tag>
```

Migrations are additive within release 1, so the previous image runs on the newer schema; a migration that is not
additive is announced in the release notes with its restore point, the time recorded in Deploy step 4
(environments-and-delivery.md section 11). Every pushed tag stays in GHCR, so the previous one is always available.

## Backup

RF-1306. The plan of [backup.md](backup.md), on this host:

- the server keeps automatic backups with point-in-time restore for 7 days (the provisioning sets
  `--backup-retention 7`), at no extra cost up to the provisioned storage;
- the backups are deleted with the server, so the server carries the `CanNotDelete` lock of Provisioning step 4; check
  it with `az lock list --resource-group rg-rosetta`;
- the scheduled `npm run backup` (a `pg_dump` kept 7 days and a weekly copy of the data folder) stays, for
  portability; its hosted schedule is set up with [backup.md](backup.md) section 5. It connects as an administrative
  role: reset the server administrator's password first with `az postgres flexible-server update --admin-password`
  (the provisioning keeps none). The server accepts only Azure services, so a run from the owner's machine needs a
  firewall rule for that machine's IP. The lock also blocks deleting a firewall rule, so the rule is removed with the
  lock lifted for a moment, in this order:
  `az postgres flexible-server firewall-rule create --resource-group rg-rosetta --server-name <server> --name owner-backup --start-ip-address <ip> --end-ip-address <ip>`;
  `npm run backup`;
  `az lock delete --name rosetta-db-no-delete --resource-group rg-rosetta --resource <server> --resource-type Microsoft.DBforPostgreSQL/flexibleServers`;
  `az postgres flexible-server firewall-rule delete --resource-group rg-rosetta --server-name <server> --name owner-backup --yes`;
  and the `az lock create` of Owner steps before the first run, step 6, to put the lock back;
- `ROSETTA_SECRET_KEY` is kept by the owner in the password manager; without it the stored provider keys cannot be
  decrypted.

## Restore

Point-in-time restore creates a new server from the backups of the last 7 days:

```
az postgres flexible-server restore --resource-group rg-rosetta --name <new server> --source-server <server> --restore-time <UTC time>
```

The restored server keeps the roles and their passwords of the restore time, and the Container Apps secrets hold the
same passwords. Run Azure provision with the input `db-server` = `<new server>` and `rotate-passwords` left off: the job
reads the passwords back from the secrets, points `DATABASE_URL` and `DATABASE_MIGRATOR_URL` at the new server, sets a
new administrator password, re-applies the firewall rule and the roles, runs the migrate job and makes a new revision.
**Warning:** every later run of Azure provision needs the same `db-server` input, or `DATABASE_URL` points back at the old server; record the new server name in Deployment record (or keep it as a `production` variable for reference). Put the lock on the new server (Owner steps before
the first run, step 6), check `/healthz` and run the smoke test. The old server stays, locked, until the owner lifts its
lock and deletes it. A dump is restored with `npm run restore` into
an empty database ([backup.md](backup.md) section 3); the data folder is restored into the share. The restore drill of
2026-10-18 on the local Compose stack is in backup.md section 4; one restore drill on the hosted stack is recorded in
Deployment record with its date.

## Database roles

The provisioning job creates the two roles of `docs/data-model.md` section 6, not by hand. On the first provisioning
(no app yet) or with the input `rotate-passwords`, the step "Database passwords" of `azure-provision.yml` makes the
passwords with `openssl rand -hex 24`; on any other run it reads back the passwords the app and the migrate job already
hold, so a rerun does not break the running app. A rotation sets the new passwords on the roles before the new revision
starts, so the app cannot open new database connections for about a minute; run it when nobody is using the app. The
step "Database roles" masks the passwords, connects as the server
administrator with TLS through the Azure services rule, and runs the statements of the local `db/init/roles.sh` made
idempotent: create `rosetta_migrator` and `rosetta_app` when missing, set their passwords, make `rosetta_migrator` the
owner of the database `rosetta`, and grant `rosetta_app` the use of schema `public`. psql reads the passwords from its
environment, so none is a command-line argument. The migrations grant `rosetta_app` its table rights (DEC-112).
`DATABASE_URL` of the app uses `rosetta_app`; `DATABASE_MIGRATOR_URL` of the migrate job uses `rosetta_migrator`; both
exist only as Container Apps secrets.

## Teacher account

RF-1107, DEC-106. After the first provisioning:

1. Sign in on the hosted URL as the bootstrap administrator (`ROSETTA_ADMIN_USER`) and choose a new password. The app
   ignores `ROSETTA_ADMIN_PASSWORD` once an account exists (RF-1102), so the stale first password left in the secret
   store does nothing.
2. Administration, Default models: set the default models of each role (`defaultRoles`, DEC-106), so the teacher can
   run the demo with the server keys under the caps.
3. Administration, Users, create the account `teacher` with role `user` and a password from the password manager, and
   clear "Must choose a new password at first sign-in" (`mustChangePassword: false`). The password goes only into the
   hand-in form (RF-803) and the `production` secret `ROSETTA_SMOKE_PASSWORD`, never into the repository, an issue or a
   chat.
4. Sign out, sign in as `teacher`: the workspace is empty (Q-21). Run the smoke test with the teacher account; it leaves
   the workspace empty.
5. Owner check: as `teacher`, run the demo scan and understand on one area with the server keys, under the caps.

## Cost check after day one

Owner step, due 2026-10-25 (the first provisioning ran on 2026-10-24). One day after the first provisioning, open Cost Management, Cost analysis for `rg-rosetta`, grouped by
meter. Expected: Container Apps idle vCPU and memory, the B1MS compute and storage (free in the first 12 months), and
under 1 USD of Azure Files. ADR-024 risk: the retail prices list an `Environment Management Hour` meter of 0.13 USD an
hour since 2026-09-01; if it appears on the Consumption-only environment (about 95 USD a month), stop the app
(`az containerapp update --min-replicas 0`) and raise it with the orchestrator before the budget alert does. Also
check that the app is billed at the idle rate, not the active one.

## RNF-017 measurement

Owner step, before the hand-in (it needs two accounts with a run each). Once, on the hosted URL (RNF-017: with two runs in progress, pages answer in under
1 second and the live view receives events within 2 seconds of their creation):

1. Synchronise this machine's clock (Windows: `w32tm /resync`), because the event delay compares the server's clock
   with this one.
2. Start two runs at the same time, so that two runs are in progress: the demo understand on one area as the
   administrator and as `teacher` (one user has at most one running run). Note the run id of one of them.
3. While both run, with that run's account in `ROSETTA_SMOKE_USER` and `ROSETTA_SMOKE_PASSWORD`:

```
node scripts/measure-rnf017.mjs https://<app>.<region>.azurecontainerapps.io --run <runId> --samples 20 --watch-ms 120000
```

It prints P50 and P95 of each page (`/`, `/healthz`, `/api/session`, `/api/projects`, `/projects`; each passes under
1 second at P95) and the delay of every live event of the run (passes when none takes more than 2 seconds), then
`RNF-017 pass` or `RNF-017 FAIL`. Paste the output with the date and the image tag into Deployment record.

## Deployment record

| Date       | Image tag     | By                       | Smoke test | Notes                                                                                                   |
| ---------- | ------------- | ------------------------ | ---------- | ------------------------------------------------------------------------------------------------------- |
| 2026-10-24 | `sha-6baab02` | orchestrator, owner's OK | passed     | first provisioning (Azure provision, four runs: OIDC subject, public access, schema owner, a CLI crash) |

Checks of 2026-10-24 on `https://ca-rosetta.nicewater-1ef3fc33.spaincentral.azurecontainerapps.io`:

- smoke test passed (Release run 40127134540, deploy job): health, redirect, landing, sign-in as the teacher account,
  a scan that completed, sign-out.
- `curl` over HTTPS: `/healthz` answers 200 with `{"status":"ok","version":"0.1.0"}`; over HTTP it answers 301 to the
  same path on HTTPS; the responses carry `Strict-Transport-Security`, the content security policy,
  `X-Frame-Options: DENY` and `X-Content-Type-Options: nosniff`.
- ZAP baseline of the deployed commit (`6baab028`, CI run 40124952823, job `zap-baseline`): High: 0, Medium: 0, Low: 0,
  Informational: 1 (Modern Web Application, 10109); 60 rules passed.
- Teacher account: the owner created it without a forced password change, signed in on the hosted URL and saw an empty
  workspace; the demo scan, an understand on 11 areas and a plan ran as that account with the server keys under the
  caps (understand 0.091862 USD, plan 0.022443 USD).
- `CanNotDelete` lock `rosetta-db-no-delete` on the server, set by the owner.

Reported by the owner on 2026-10-26: the RNF-017 measurement (section RNF-017 measurement) was run on the hosted URL
on 2026-10-24, and the hosted restore drill (section Restore, RF-1306) was done. The script output and the drill's
restore time were not pasted here.

Still to record here when it runs: the cost check of day one (section Cost check after day one).
