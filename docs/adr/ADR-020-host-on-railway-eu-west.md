# ADR-020: Host the hosted deployment on Railway in EU West (Amsterdam)

**Date**: 2026-10-11
**Status**: Proposed
**Deciders**: BlackLigth (blacklight0101)

## Context

ADR-014 ships Rosetta as one container image and leaves the host open (Q-18); the teachers' URL must be live by
2026-10-20 (DEC-89, card P1-55). Environments-and-delivery.md section 2 sets the requirements: run the image
`ghcr.io/blacklight0101/rosetta` from GHCR by its `sha-<short>` tag (DEC-104) and later `X.Y.Z`; a persistent disk at
`/data`; managed PostgreSQL 17 (or a PostgreSQL container with a volume); a secret store; HTTPS with HTTP redirected;
a health check on `/healthz` and restart on failure; one instance; at least 1 GiB of memory, because scrypt runs with
`maxmem` 256 MiB and two hashes at a time (ADR-015, DEC-112); under 25 USD a month (RFC-001 section 5). The owner is
in Spain, so an EU region is wanted, and the app must not sleep while the teachers evaluate it. Sections 10-12 add
deploy by tag, rollback by the previous tag, a database backup before each deploy and daily backups kept 7 days
(RF-1306).

All facts below were read on the providers' official pages on 2026-10-11 (sources S1-S33 at the end); prices are
list prices in USD unless marked EUR, before VAT.

## Options Considered

1. **Render**: web service plus Render Postgres, Frankfurt.
2. **Railway**: Hobby plan, image service plus the Railway PostgreSQL service, EU West (Amsterdam).
3. **Fly.io**: one Machine plus Fly Managed Postgres, Frankfurt or Amsterdam.
4. **Azure Container Apps**: Consumption plan plus Azure Database for PostgreSQL Flexible Server B1MS, Spain Central.
5. **Small VPS with Docker**: Hetzner Cloud, Compose with PostgreSQL in a container and Caddy for HTTPS, Nuremberg.
6. Do nothing: no hosted deployment; the hand-in falls back to the GitHub Pages report (DEC-67). This loses the
   teacher account and RF-1304.

### Comparison

| Requirement | Render (1) | Railway (2) | Fly.io (3) | Azure Container Apps (4) | Hetzner VPS (5) |
|---|---|---|---|---|---|
| Image from public GHCR | yes, no credentials for public images [S1] | yes, Docker image source; public needs no credentials [S9] | yes, `fly deploy --image` [S17] | yes, any registry image (`az containerapp update --image`) [S22] | yes, `docker compose pull` |
| Instance with at least 1 GiB, always on | cheapest is `1c-2g`, 2 GB, 25 USD; the 7 USD instance has 512 MB [S2] | billed by use, about 10 USD per GB-month RAM and 20 USD per vCPU-month; up to 48 GB per service on Hobby [S8][S10] | `shared-cpu-1x` 1 GB: 7.73 USD in `fra`, 6.95 USD in `ams` (derived from the regional markup) [S15] | 0.5 vCPU / 1 GiB, min replicas 1; idle replicas billed at the reduced idle rate [S21][S23] | CPX12 (1 vCPU, 2 GB) [S28]; CX23 (4 GB, 5.49 EUR) is currently not orderable [S29][S30] |
| Persistent disk at `/data` | 0.25 USD/GB-month; one instance; a few seconds of downtime per deploy; daily snapshot kept 7 days [S2][S3] | volume 0.15 USD/GB-month, 5 GB maximum on Hobby, one per service, brief downtime per deploy; non-root images need `RAILWAY_RUN_UID=0` [S8][S11] | volume 0.15 USD/GB-month; snapshots 0.08 USD/GB, first 10 GB free [S15][S16] | Azure Files share (SMB) mounted as a volume; Hot LRS 0.0271 USD/GB-month plus metadata and operations [S24][S25] | local NVMe of the server (40 GB) |
| PostgreSQL 17 | managed; 13-18 offered, 17 selectable; `0.1c-256mb` 6 USD, `0.5c-1g` 19 USD; 1 GB included, 0.30 USD/GB [S2][S5] | official Railway `postgres-ssl:17` image, pinned to a major; in-place `pg_upgrade` from 14-17 to newer majors [S12][S13] | Managed Postgres Basic 38 USD (1 GB), storage 0.28 USD/GB; EU regions not listed; unmanaged Fly Postgres is "Unsupported" [S15][S18] | managed Flexible Server, PostgreSQL 17.11 offered; B1MS 0.0199 USD/h (14.53 USD/month), storage 0.1369 USD/GB-month [S25][S26] | not offered; official `postgres:17` container with the server's disk (allowed by section 2) |
| Database backups | point-in-time recovery 3 days on Hobby, logical exports kept 7 days [S2][S6] | volume backups daily (kept 6 days), weekly (kept 27 days), monthly [S14]; whether Hobby has scheduled backups is unclear in the docs | included in every Managed Postgres plan [S18] | automatic, retention 7-35 days [S26] | server backups daily, 7 slots [S31]; plus a `pg_dump` job |
| Secret store | environment variables, environment groups, secret files [S7] | variables; sealed variables hidden from dashboard and API [S19] | `fly secrets set`, encrypted per-app vault, injected at boot [S20] | Container Apps secrets, Key Vault references [S24] | a `.env` file on the server; nothing built in |
| HTTPS and HTTP redirect | automatic certificates; HTTP redirected on custom domains; 2 custom domains on Hobby [S4] | automatic certificates for `*.railway.app` and custom domains [S19]; redirect not stated in the docs | `force_https` [S16] | TLS at ingress; port 80 redirected to 443 by default [S23] | Caddy issues and renews certificates and redirects HTTP; needs a domain pointing at the server [S32] |
| Health check and restart | HTTP check on a path; restarts after 60 s of failures [S3] | health check at deploy time only; restart policy Always or On Failure, no limit on paid plans [S11][S13] | `http_service.checks`; `[[restart]]` always / on-failure [S16] | liveness, readiness and startup HTTP probes; failing replicas are restarted [S27] | Docker `HEALTHCHECK` and `restart: unless-stopped` (restarts on exit, not on an unhealthy check) |
| EU region | Frankfurt only [S4] | EU West Metal, Amsterdam [S12] | `ams`, `arn`, `cdg`, `fra`, `lhr`; no Madrid [S17] | Spain Central and West Europe (both priced in the retail API) [S25] | Falkenstein, Nuremberg, Helsinki [S28] |
| Free tier | spins down after 15 min, free Postgres expires after 30 days, no disks [S5] | Free: 0.5 GB RAM per service; trial: one-time 5 USD for 30 days; sleeping is opt-in [S8][S10] | none; trial 2 machine-hours or 7 days [S15] | always free: 180,000 vCPU-s, 360,000 GiB-s, 2 M requests a month; new accounts: 200 USD for 30 days and 12 months of B1MS 750 h + 32 GB [S21][S26] | none |
| Account | Hobby workspace 0 USD + compute; 5 GB bandwidth then 0.15 USD/GB [S2] | Hobby 5 USD/month including 5 USD of usage; post-paid card required; hard usage limit available (minimum 10 USD) [S8][S10][S33] | card needed after the trial [S15] | phone, non-prepaid card, Microsoft or GitHub account; 1 USD authorisation [S26] | ID document or card prepayment may be asked for [S31] |
| **Monthly estimate** | 25 + 6 + 1.25 (5 GB disk) = **32.25 USD** | 5 USD fee covers the first 5 USD of use; app about 0.5-1 GB RAM plus PostgreSQL about 0.25 GB, CPU and 6 GB of volumes: **10-15 USD** | 7.73 + 0.75 (5 GB) + 38 + 0.28 = **46.76 USD** | app idle about 13.40 + B1MS 14.53 + 32 GB 4.38 + Files under 1 = **about 33 USD**; **about 14 USD** in the first 12 months of a new account | CPX12 about 11.49 EUR [S28] + backups + 21% Spanish VAT + domain: **about 17-19 EUR**, self-managed |
| Deploy of `sha-<short>` from CI | deploy hook with `imgURL=...:sha-<short>` [S1] | `railway service source connect --image ...:sha-<short>` then `railway redeploy`, or the public API, with a project token [S9] | `flyctl deploy --image ...:sha-<short>` with a deploy token [S17] | `az containerapp update --image ...:sha-<short>` with `azure/login` OIDC [S22] | SSH, set the tag, `docker compose pull && docker compose up -d` |

## Decision

We choose option 2: Railway, Hobby plan, region EU West (Amsterdam), at an estimated 10-15 USD a month with a
Railway hard usage limit of 25 USD. One service `app` runs `ghcr.io/blacklight0101/rosetta:sha-<short>` (later
`X.Y.Z`) with a volume at `/data`, restart policy Always, a deploy health check on `/healthz` and
`ROSETTA_TRUST_PROXY=1`; one Railway PostgreSQL service pinned to major 17 in the same project and region; every
secret of environments-and-delivery.md section 4 is a sealed Railway variable. The runner-up is option 4, Azure
Container Apps in Spain Central.

## Rationale

- Railway is the only candidate that stays inside 25 USD a month without a time-limited offer while the host still
  runs the database, TLS and secrets: it bills used memory, not the 1 GiB ceiling, and the hard limit caps the bill
  [S8][S33]. Its gaps (deploy-time health check, volume ownership, Hobby backups) have workarounds listed below.
- RNF-017 has headroom: Hobby allows up to 48 vCPU and 48 GB per service, billed by use [S10], so two parallel runs are
  a cost risk, not a capacity limit.
- PostgreSQL 17 runs as a Railway-maintained service in the same project, with backups and one-click major upgrades
  [S12][S13]; section 2 accepts a PostgreSQL container with a volume.
- Render lost on cost: the smallest instance with at least 1 GiB costs 25 USD alone [S2]. Fly.io lost on cost: Managed
  Postgres starts at 38 USD and its EU regions are not documented [S15][S18].
- Azure Container Apps fits best technically (managed PostgreSQL 17, runtime liveness probes, Spain Central) but costs
  about 33 USD a month once the 12-month free PostgreSQL offer ends, needs a new Azure account to get that offer, and
  takes more setup (resource group, environment, storage account, database firewall); it is the runner-up.
- The Hetzner VPS is cheap but leaves PostgreSQL, TLS, secrets, backups and OS patching to the owner, its secret store
  is a file on disk, and the cheapest 4 GB plan cannot be ordered today [S29].

## Consequences

**Positive**
- One dashboard holds the app, the database, the volume and the secrets; rollback is redeploying the previous tag.
- The bill is capped by the hard limit (the 15 USD alert of the appendix is the early warning), and the free
  `*.railway.app` domain with HTTPS needs no domain purchase.

**Negative**
- Railway checks `/healthz` only at deploy time [S11]: a hung process that does not exit is not restarted, so
  RNF-016 ("a health check the host restarts on") is met only for crashes (restart policy Always). Closing the gap
  needs either a watchdog outside the main event loop (a blocked loop never fires its own timer): a `worker_thread`
  or a small supervisor process that probes `/healthz` over HTTP and exits the container with a non-zero code after
  N consecutive failures, so that Railway restarts it; or the runner-up host, whose liveness probe restarts replicas
  [S27]. The owner decides when merging this ADR.
- Railway does not document an HTTP-to-HTTPS redirect; P1-55 verifies it with `curl` and, if it is missing, the
  server redirects on `X-Forwarded-Proto` (RF-1304).
- The image runs as a non-root user and Railway volumes then need `RAILWAY_RUN_UID=0` [S11]; running as root breaks
  ADR-014 and section 8.1. The image must instead fix `/data` ownership at start and drop to the non-root user
  (Dockerfile owned by P1-45; open question for the orchestrator). The container then starts as root, so accepting
  this ADR needs follow-up edits (not made here): environments-and-delivery.md section 8.1 (the "Running as root"
  row), threat-model.md TB7 ("non-root user"), and P1-45's hadolint rule on the final `USER`.
- Hobby volumes stop at 5 GB [S8]; snapshots must be pruned or the plan raised to Pro (20 USD) when it fills.
- Railway keeps daily volume backups only 6 days [S14], while RF-1306 and section 12 ask for 7: the weekly backups
  (kept 27 days) plus a daily `pg_dump` to `/data`, kept 7 days, cover the retention whether or not scheduled
  backups are offered on Hobby.
- The Railway compute hard limit takes every workload offline when it is reached [S33]; the teachers then lose the
  URL until the owner raises the limit, so the 15 USD alert must be acted on.
- Environments-and-delivery.md section 9 says "a managed PostgreSQL" hosted, while this ADR uses Railway's PostgreSQL
  service on a volume, which section 2 allows; section 9's wording is a follow-up edit on acceptance.
- Each deploy has a short downtime because the volume blocks overlapping instances [S8].

## References

- Q-18; RF-1304, RF-1306, RNF-016; ADR-014, ADR-015, ADR-016; DEC-61, DEC-89, DEC-104, DEC-112;
  environments-and-delivery.md sections 2, 3, 4, 8, 10-12 and 14; cards P1-48, P1-55; gate G-07.
- Sources, all accessed 2026-10-11:
  - S1 https://render.com/docs/deploying-an-image
  - S2 https://render.com/pricing.md
  - S3 https://render.com/docs/disks and https://render.com/docs/health-checks
  - S4 https://render.com/docs/regions and https://render.com/docs/custom-domains
  - S5 https://render.com/docs/free and https://render.com/docs/postgresql-upgrading
  - S6 https://render.com/docs/postgresql-backups
  - S7 https://render.com/docs/configure-environment-variables
  - S8 https://railway.com/pricing and https://docs.railway.com/reference/volumes
  - S9 https://docs.railway.com/guides/services and https://docs.railway.com/cli/deploying
  - S10 https://docs.railway.com/pricing/plans and https://docs.railway.com/reference/app-sleeping
  - S11 https://docs.railway.com/reference/healthchecks and https://docs.railway.com/reference/volumes
  - S12 https://docs.railway.com/reference/deployment-regions and https://docs.railway.com/databases
  - S13 https://docs.railway.com/databases/postgresql and https://docs.railway.com/deployments/restart-policy
  - S14 https://docs.railway.com/reference/backups
  - S15 https://docs.fly.io/about/pricing
  - S16 https://docs.fly.io/reference/configuration
  - S17 https://docs.fly.io/flyctl/integrating and https://docs.fly.io/reference/regions
  - S18 https://docs.fly.io/mpg
  - S19 https://docs.railway.com/variables and https://docs.railway.com/networking/public-networking
  - S20 https://docs.fly.io/apps/secrets
  - S21 https://learn.microsoft.com/en-us/azure/container-apps/billing
  - S22 https://learn.microsoft.com/en-us/cli/azure/containerapp
  - S23 https://learn.microsoft.com/en-us/azure/container-apps/ingress-overview
  - S24 https://learn.microsoft.com/en-us/azure/container-apps/storage-mounts
  - S25 Azure retail prices API, https://prices.azure.com/api/retail/prices (regions `westeurope`, `spaincentral`)
  - S26 https://learn.microsoft.com/en-us/azure/postgresql/flexible-server/concepts-supported-versions,
    https://learn.microsoft.com/en-us/azure/postgresql/configure-maintain/quickstart-create-server and
    https://azure.microsoft.com/en-us/pricing/purchase-options/azure-account
  - S27 https://learn.microsoft.com/en-us/azure/container-apps/health-probes
  - S28 https://www.hetzner.com/cloud/regular-performance/ (specifications; the price is not rendered there, the
    11.49 EUR figure is from the comparison at https://kimmo.suominen.com/stuff/cpc-2026-08.txt and must be checked
    in the Hetzner console)
  - S29 https://www.hetzner.com/cloud/cost-optimized/
  - S30 https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/
  - S31 https://docs.hetzner.com/cloud/servers/backups-snapshots/overview/ and
    https://docs.hetzner.com/general/security-and-identify/fraud-prevention-faq/
  - S32 https://caddyserver.com/docs/automatic-https
  - S33 https://docs.railway.com/reference/usage-limits

## Appendix: owner setup steps (for G-07 and the runbook of P1-55)

1. Create a Railway account (GitHub sign-in) and subscribe to Hobby with a card; set a compute hard limit of 25 USD and
   an e-mail alert at 15 USD on the Workspace Usage page [S33].
2. Create project `rosetta`, environment `production`, region EU West (Amsterdam); check that the region is offered on
   Hobby.
3. Add the PostgreSQL service, pinned to major 17; enable its backups (daily) if the Backups tab is offered.
4. Connect with `railway connect` and create the roles `rosetta_app` and `rosetta_migrator` of data-model.md section 6,
   or record in the runbook that one role is used.
5. Add service `app` from the Docker image `ghcr.io/blacklight0101/rosetta:sha-<short>` (the tag P1-55 names), attach a
   volume at `/data`, set restart policy Always and health check path `/healthz`, and generate the `*.railway.app`
   domain.
6. Store as sealed variables of `app`: `DATABASE_URL`, `DATABASE_MIGRATOR_URL` (optional), `ROSETTA_SECRET_KEY`,
   `ROSETTA_ADMIN_USER`, `ROSETTA_ADMIN_PASSWORD`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GITHUB_TOKEN` (optional).
   As plain variables: `ROSETTA_PUBLIC_URL` (the https domain), `ROSETTA_DATA_DIR=/data`, `ROSETTA_TRUST_PROXY=1`,
   `ROSETTA_LOG_LEVEL=info`, `ROSETTA_LOG_RETENTION_DAYS=14`, `ROSETTA_CONTACT_EMAIL` (optional). Never set
   `ROSETTA_OLLAMA_URL`, `ROSETTA_TEST`, `ROSETTA_GALLERY` or the local-only database passwords.
7. Keep a copy of `ROSETTA_SECRET_KEY` outside Railway (section 12).
8. Create a Railway project token for `production` and store it as the GitHub Actions secret `RAILWAY_TOKEN` for the
   P1-55 deploy job.
9. Domain: the `*.railway.app` domain is enough for the hand-in; a custom domain needs a CNAME and a TXT record [S19].
10. Tell the orchestrator that G-07 is open.

## Notes

- 2026-10-16 (DEC-140, P1-158): the server refuses `DATABASE_MIGRATOR_URL`, so step 6 of the appendix stores only
  `DATABASE_URL` (the `rosetta_app` URL) on `app`. The migrations run in a one-off migrate step from the same image
  (`node dist/presentation/migrate.js`) that holds `DATABASE_MIGRATOR_URL` (the `rosetta_migrator` URL, or the one
  role's URL when one role is used) as its only sealed variable and runs before each new `app` image is deployed; the
  exact Railway mechanism (a separate service with restart policy Never, or a job of the deploy workflow) is chosen by
  P1-55 and written in `docs/runbooks/deploy.md`.

