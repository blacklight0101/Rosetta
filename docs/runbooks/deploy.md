# Runbook: hosted deployment

> **Host changed 2026-10-24 (DEC-171, [ADR-024](../adr/ADR-024-host-on-azure-container-apps-spain-central.md)).** The hosted deployment moves from Railway to Azure Container Apps in Spain Central, because Railway paused new sign-ups; ADR-020 is superseded. The Railway steps below (account, sealed variables, `RAILWAY_TOKEN`, `*.railway.app`, `railway connect`) are kept until the follow-up deploy card rewrites this runbook for Azure (resource group, environment, Azure Files at `/data`, Flexible Server PostgreSQL 17, Container Apps secrets, `azure/login` OIDC, a budget alert of 25 USD). Do not run them.

How Rosetta runs for the teachers: one container image from GHCR on Railway, Hobby plan, region EU West (Amsterdam),
with a Railway PostgreSQL 17 service, a volume at `/data` and every secret as a sealed Railway variable
([ADR-020](../adr/ADR-020-host-on-railway-eu-west.md), RF-1304, DEC-104). The procedure follows
`docs/environments-and-delivery.md` sections 10 to 12; backups and restores are in [backup.md](backup.md); the local
stack is in [local.md](local.md).

**State on 2026-10-18: the host does not exist yet.** The owner buys the Railway account only when everything else is
ready (gates G-07 and G-08 are closed). Every step that needs the host is marked **Pending G-07**; the parts that do not
need it (the release workflow, the smoke script, the HTTPS redirect of the app, the ZAP baseline in CI and the RNF-017
script) are in the repository and tested.

## Before the host exists

What already works without the host:

| Piece                      | Where                                                        | Checked by                                                                |
| -------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------- |
| Release workflow           | `.github/workflows/release.yml`                              | `tests/integration/tooling/release-workflow.test.ts`                      |
| Smoke script               | `scripts/smoke.mjs`                                          | `tests/integration/scripts/smoke.test.ts`; the `compose-smoke` job of CI  |
| HTTP to HTTPS redirect     | `src/presentation/web/https-redirect.ts`                     | `tests/integration/presentation/web/https-redirect.test.ts`               |
| OWASP ZAP baseline         | job `zap-baseline` of `.github/workflows/ci.yml`             | runs on every pull request and push to `main`; summary in the job summary |
| RNF-017 measurement        | `scripts/measure-rnf017.mjs`                                 | `tests/integration/scripts/measure-rnf017.test.ts`                        |
| Backup and restore scripts | `npm run backup`, `npm run restore` ([backup.md](backup.md)) | the local restore drill of backup.md section 4                            |

The deploy job of `release.yml` is present but skipped: it runs only when the repository variable
`ROSETTA_DEPLOY_ENABLED` is `true`, in the GitHub environment `production`. Its host step (backup, migrate, set the
image) is written in P1-55 part 2 and until then fails on purpose, so switching the job on too early stops it before
anything pretends to deploy.

## Owner checklist for the day the host is bought

From the appendix of ADR-020, in order. Do it in one sitting; nothing here goes into the repository, an issue or a chat.

1. Set a compute hard limit of 25 USD with an e-mail alert at 15 USD: create a Railway account (GitHub sign-in),
   subscribe to Hobby with a card, and set the limit and the alert on the Workspace Usage page.
2. Create the project `rosetta`, environment `production`, region EU West (Amsterdam); check that the region is offered
   on Hobby.
3. Add the PostgreSQL service pinned to major 17; enable its daily backups if the Backups tab is offered.
4. Create the roles `rosetta_app` and `rosetta_migrator` (section Roles in the host console), or record in that section
   that one role is used.
5. Make the GHCR package `ghcr.io/blacklight0101/rosetta` public (GitHub, Packages, Package settings), so Railway pulls
   it without credentials; add the service `app` from the Docker image `ghcr.io/blacklight0101/rosetta:sha-<short>`
   (the tag in the run of `release.yml`), attach a volume at `/data`, set restart policy Always and health check path
   `/healthz`, and generate the `*.railway.app` domain.
6. Store as sealed variables of `app`: `DATABASE_URL` (the `rosetta_app` URL), `ROSETTA_SECRET_KEY`,
   `ROSETTA_ADMIN_USER`, `ROSETTA_ADMIN_PASSWORD`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GITHUB_TOKEN` (optional); as
   plain variables `ROSETTA_PUBLIC_URL` (the https domain), `ROSETTA_DATA_DIR=/data`, `ROSETTA_TRUST_PROXY=1`,
   `ROSETTA_LOG_LEVEL=info`, `ROSETTA_LOG_RETENTION_DAYS=14`, `ROSETTA_CONTACT_EMAIL` (optional). `DATABASE_MIGRATOR_URL`
   goes only on the migrate step (DEC-140); never set `ROSETTA_OLLAMA_URL`, `ROSETTA_TEST` or `ROSETTA_GALLERY`.
7. Keep a copy of `ROSETTA_SECRET_KEY` outside Railway (in the password manager).
8. Store a Railway project token as the GitHub secret `RAILWAY_TOKEN`: create the token for `production` in Railway;
   in GitHub, Settings, Environments, create `production` with the secrets `RAILWAY_TOKEN` and
   `ROSETTA_SMOKE_PASSWORD` (the teacher password) and the variables `ROSETTA_PUBLIC_URL` and `ROSETTA_SMOKE_USER`
   (`teacher`); add yourself as a required reviewer if you want to approve each deploy.
   Defence in depth, because `release.yml` runs on any pushed `v*` tag and by hand:
   - add a tag ruleset for `v*` so only you can create, move or delete release tags;
   - in the `production` environment, limit Deployment branches and tags to `main` and `v*`, so no other ref can
     reach its secrets even if the workflow changes.
9. Domain: the `*.railway.app` domain is enough for the hand-in; a custom domain needs a CNAME and a TXT record.
10. Tell the orchestrator that G-07 is open; P1-55 part 2 then writes the host step of the deploy job, and only after it
    merges do you set the repository variable `ROSETTA_DEPLOY_ENABLED` to `true`.

## Release and image

`release.yml` runs on a pushed `v*` tag or by hand (Actions, Release, Run workflow, branch `main`); never on a pull
request or a push to `main`.

- **image**: checks that a tag is `v` plus the version of `package.json` and that the commit is on `main`, builds the
  runtime image, scans it with Trivy (a fixable High or Critical finding stops the release), and pushes
  `ghcr.io/blacklight0101/rosetta:sha-<short>` and, for a tag, `:X.Y.Z`. Never `latest` (RF-1300).
- **sbom** (tags only): writes the CycloneDX SBOM of the runtime dependencies and attaches it to the GitHub release of
  the tag (DEC-57), creating the release if the owner has not yet.
- **deploy** (only with `ROSETTA_DEPLOY_ENABLED`): see Deploy.

Before v0.1.0 the deployment runs the `sha-<short>` image of `main` (DEC-104): run the workflow by hand on `main` and
read the tag in the summary of the image job.

## Deploy

**Pending G-07.** The order of `docs/environments-and-delivery.md` section 10 step 4, as the deploy job will run it:

1. The `zap-baseline` check of `ci.yml` passed on the commit (the job refuses otherwise; threat model section 5).
2. The secrets and variables of checklist step 8 are set (the job names any that is missing).
3. Back up the database (a snapshot of the PostgreSQL volume, or `npm run backup` as in [backup.md](backup.md)).
4. Run the one-off migrate step of the new image, `node dist/presentation/migrate.js`, with `DATABASE_MIGRATOR_URL` as
   its only secret (DEC-140, RF-1302). If it fails, stop: the previous image keeps running on the previous schema.
5. Set the image of `app` to `ghcr.io/blacklight0101/rosetta:sha-<short>` (or `:X.Y.Z`) and redeploy; wait until
   `/healthz` answers 200. The volume blocks overlapping instances, so there is a short downtime.
6. Run the smoke test (next section).
7. Record the tag and the date in Deployment record and in `handoff.md`.

The Railway mechanism of steps 3 to 5 (a migrate service with restart policy Never, or the Railway API from the job) is
chosen and written here by P1-55 part 2.

## Smoke test

```
ROSETTA_SMOKE_USER=teacher ROSETTA_SMOKE_PASSWORD=<from the password manager> node scripts/smoke.mjs https://<app>.railway.app
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
curl -sI http://<app>.railway.app/healthz     # 301 with Location: https://<app>.railway.app/healthz
curl -s https://<app>.railway.app/healthz     # {"status":"ok","version":"..."}
```

The redirect is done by the app (`ROSETTA_TRUST_PROXY=1` and an https `ROSETTA_PUBLIC_URL`) when the proxy marks the
request `X-Forwarded-Proto: http`; Railway does not document a redirect of its own (ADR-020).

## Rollback

**Pending G-07.** Set the image of `app` back to the previous tag (the one in Deployment record) and redeploy; wait for
`/healthz` and run the smoke test. Migrations are additive within release 1, so the previous image runs on the newer
schema; a migration that is not additive is announced in the release notes with its restore point, the backup taken in
Deploy step 3 (environments-and-delivery.md section 11). Every pushed tag stays in GHCR, so the previous one is always
available.

## Backup

**Pending G-07** on the host; the scripts are ready. The plan is in [backup.md](backup.md) (RF-1306):

- a daily `pg_dump` of the database kept 7 days (`npm run backup`, scheduled on Railway), plus Railway's own volume
  backups where Hobby offers them (Railway keeps daily backups 6 days, so the dumps cover the seventh);
- a weekly copy of the data folder `/data`;
- a backup before every deployment (Deploy step 3);
- `ROSETTA_SECRET_KEY` kept by the owner outside Railway; without it the stored provider keys cannot be decrypted.

## Restore

**Pending G-07** on the host. The procedure and the restore drill of 2026-10-18 on the local Compose stack are in
[backup.md](backup.md) sections 3 and 4. On the host: stop `app`, restore the dump into an empty database with
`npm run restore`, restore the data folder into the volume, start `app`, check `/healthz` and run the smoke test. One
restore drill on the hosted stack is recorded in Deployment record with its date.

## Roles in the host console

**Pending G-07.** Connect to the Railway PostgreSQL service as its administrative user (`railway connect` from the
owner's machine, or the service's query tab) and create the two roles of `docs/data-model.md` section 6, with passwords
made by `openssl rand -hex 24` and stored only in Railway:

```sql
CREATE ROLE rosetta_migrator LOGIN PASSWORD '<new password>';
CREATE ROLE rosetta_app LOGIN PASSWORD '<another new password>';
ALTER DATABASE <database> OWNER TO rosetta_migrator;   -- Railway names it railway by default
GRANT USAGE ON SCHEMA public TO rosetta_app;
```

The same statements as the local `db/init/roles.sh`; the migrations grant `rosetta_app` its table rights (DEC-112).
If one role
is used instead, write it here with the reason. `DATABASE_URL` of `app` uses `rosetta_app`; `DATABASE_MIGRATOR_URL` of
the migrate step uses `rosetta_migrator`.

## Teacher account

RF-1107, DEC-106. After the first deploy:

1. Sign in on the hosted URL as the bootstrap administrator (`ROSETTA_ADMIN_USER`) and choose a new password; then
   remove `ROSETTA_ADMIN_PASSWORD` from Railway (RF-1102).
2. Administration, Default models: set the default models of each role (`defaultRoles`, DEC-106), so the teacher can
   run the demo with the server keys under the caps.
3. Administration, Users, create the account `teacher` with role `user` and a password from the password manager, and
   clear "Must choose a new password at first sign-in" (`mustChangePassword: false`). The password goes only into the
   hand-in form (RF-803), never into the repository, an issue or a chat.
4. Sign out, sign in as `teacher`: the workspace is empty (Q-21). Run the smoke test with the teacher account; it leaves
   the workspace empty.
5. Owner check: as `teacher`, run the demo scan and understand on one area with the server keys, under the caps.

## RNF-017 measurement

**Pending G-07.** Once, on the hosted URL, before the hand-in (RNF-017: with two runs in progress, pages answer in under
1 second and the live view receives events within 2 seconds of their creation):

1. Synchronise this machine's clock (Windows: `w32tm /resync`), because the event delay compares the server's clock
   with this one.
2. Start two runs at the same time, so that two runs are in progress: the demo understand on one area as the
   administrator and as `teacher` (one user has at most one running run). Note the run id of one of them.
3. While both run, with that run's account in `ROSETTA_SMOKE_USER` and `ROSETTA_SMOKE_PASSWORD`:

```
node scripts/measure-rnf017.mjs https://<app>.railway.app --run <runId> --samples 20 --watch-ms 120000
```

It prints P50 and P95 of each page (`/`, `/healthz`, `/api/session`, `/api/projects`, `/projects`; each passes under
1 second at P95) and the delay of every live event of the run (passes when none takes more than 2 seconds), then
`RNF-017 pass` or `RNF-017 FAIL`. Paste the output with the date and the image tag into Deployment record.

## Deployment record

| Date    | Image tag              | By    | Smoke test | Notes                      |
| ------- | ---------------------- | ----- | ---------- | -------------------------- |
| pending | pending (Pending G-07) | owner | pending    | host not bought yet (G-07) |

The RNF-017 result, the hosted restore drill and the ZAP baseline summary of the deployed commit are recorded here
when they run.
