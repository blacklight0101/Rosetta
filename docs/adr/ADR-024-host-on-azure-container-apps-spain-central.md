# ADR-024: Host the hosted deployment on Azure Container Apps in Spain Central

**Date**: 2026-10-24
**Status**: Amended
**Deciders**: BlackLigth (blacklight0101)

## Context

ADR-020 (2026-10-11, Proposed) chose Railway for the hosted deployment of Q-18 and named Azure Container Apps in Spain
Central as the runner-up. On 2026-10-24 the owner moved to the runner-up (DEC-171) because Railway paused new
sign-ups: its status page has said since 2026-10-23 22:03 UTC that new signups remain temporarily paused, with no date
to reopen, so the owner cannot open the account that G-07 needs before the hand-in of 2026-10-26.

The requirements are unchanged (environments-and-delivery.md section 2): the image `ghcr.io/blacklight0101/rosetta`
by its `sha-<short>` tag (DEC-104), a persistent disk at `/data`, managed PostgreSQL 17, a secret store, HTTPS with
HTTP redirected, a health check that restarts the app, one instance, at least 1 GiB of memory for scrypt (ADR-015,
DEC-112), under 25 USD a month (RFC-001 section 5), daily backups kept 7 days (RF-1306) and an EU region.

The facts below were re-read on Microsoft's official pages on 2026-10-24 (sources A1-A15 at the end). Prices are list
prices in USD for Spain Central, before VAT, from the Azure retail prices API.

## Options Considered

1. **Azure Container Apps**, Consumption plan, with Azure Database for PostgreSQL Flexible Server B1MS, Spain Central.
2. **Railway** (ADR-020): not available, new sign-ups are paused.
3. **Render, Fly.io or a Hetzner VPS** (the other options of ADR-020): they lost on cost or on operations in ADR-020,
   and nothing in that comparison has changed.
4. Do nothing: no hosted deployment; the hand-in falls back to the GitHub Pages report (DEC-67) and loses the teacher
   account and RF-1304.

## Decision

We choose option 1, at an estimated 33 USD a month at list price (about 14 USD a month during the first 12 months of a
new Azure account), with a budget alert at 25 USD.

- **App**: one Container App, Consumption plan, 0.5 vCPU and 1 GiB, minimum and maximum replicas both 1, external
  ingress on port 8080, single revision mode, image `ghcr.io/blacklight0101/rosetta:sha-<short>` (later `X.Y.Z`). The
  GHCR package is public; Container Apps still needs the registry set with `az containerapp registry set --server
ghcr.io` [A11].
- **Disk**: a classic Azure Files share (SMB, Hot LRS) defined in the environment and mounted at `/data`, with
  `mountOptions` `uid=1000,gid=1000,dir_mode=0755,file_mode=0755` so that the non-root `node` user of the image can
  write [A9][A10]. ADR-014 and section 8.1 stay as they are: no root container.
- **Database**: Flexible Server, PostgreSQL 17 (17.11 is the current minor), Burstable B1MS, 32 GiB, TLS required,
  access limited by firewall rule, in Spain Central [A3][A5][A6].
- **Secrets**: Container Apps secrets referenced by `secretref:` environment variables, one per secret of section 4.
  The supported upgrade, which changes no variable name, is a Key Vault reference through a managed identity with the
  role Key Vault Secrets User [A8]. Plain variables: `ROSETTA_TRUST_PROXY=1`, `ROSETTA_DATA_DIR=/data`,
  `ROSETTA_PUBLIC_URL` (the https FQDN).
- **Probes**: HTTP startup, liveness and readiness probes on `/healthz`; a failing replica is restarted, so a hung
  process is recovered [A7]. This closes the RNF-016 gap that ADR-020 left open for Railway.
- **Deploy**: the release workflow logs in with `azure/login@v2` and OIDC (a federated credential on an Entra
  application or managed identity, `permissions: id-token: write`, secrets `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`,
  `AZURE_SUBSCRIPTION_ID`), then runs `az containerapp update --image ...:sha-<short>` and waits for `/healthz`
  [A12]. No long-lived Azure secret is stored in GitHub. The one-off migration step of DEC-140 runs from the same
  image before the update (the mechanism, for example a Container Apps job, is chosen by the deploy card).
- **Budget**: a Cost Management budget of 25 USD a month with alerts at 60% and 100% of actual cost and 100% of
  forecast cost, sent by e-mail to the owner [A14].

## Rationale

- It was the runner-up of ADR-020 on technical fit, and it is the only candidate the owner can open today: the Railway
  sign-up is paused with no reopening date.
- Monthly estimate (730 h, free grants deducted): the app idle at 0.5 vCPU and 1 GiB costs (1,314,000 - 180,000
  vCPU-s) x 0.000004 + (2,628,000 - 360,000 GiB-s) x 0.000004 = 4.54 + 9.07 = 13.61 USD; B1MS 14.53 USD; 32 GiB of
  database storage 4.38 USD; a 5 GB Azure Files share 0.14 USD plus metadata and operations, under 1 USD in all;
  total about 33 USD. In the first 12 months of a new account the 750 h of B1MS and 32 GB of storage are free (about
  14 USD in all), and the 200 USD credit lasts 30 days [A1][A2][A3].
- RF-1306 is met by the service: automatic backups with point-in-time restore over a retention of 7 days (the
  default) to 35 days, and backup storage up to the size of the provisioned storage at no extra cost [A5].
- Spain Central offers PostgreSQL 17 and the owner is in Spain; Container Apps bill per second, so a short evaluation
  costs little [A1][A3][A6].
- Rejected: Railway (cannot be opened), Render, Fly.io and Hetzner (reasons in ADR-020, unchanged).

## Consequences

**Positive**

- Restart on a hung process and the HTTP-to-HTTPS redirect (port 80 is redirected to 443 by default) are native
  [A7][A15]; `X-Forwarded-Proto` is set by the ingress, so the redirect in the server (RF-1304) stays a fallback.
- Rollback is `az containerapp update --image ...:<previous tag>`.

**Negative and risks**

- About 33 USD at list price is above the 25 USD target of RFC-001 once the free offer ends, and the free offer needs
  a new Azure account (phone, non-prepaid card, a 1 USD hold) [A2]. The owner accepts the cost (DEC-171).
- Idle billing needs a replica that uses under 0.01 vCPU, receives under 1,000 bytes per second and serves no request;
  a replica that is never idle is billed at the active rate, about 47.6 USD a month for the app alone [A1]. A budget
  only sends alerts and never stops a resource [A14].
- The retail prices list an environment management meter of 0.13 USD an hour since 2026-09-01. The billing page ties
  it to the Dedicated plan, private endpoints and planned maintenance, none of which is used [A1][A3]. The first
  runbook check is the cost analysis after one day.
- Burstable servers have no on-demand backups [A5], and the backups are deleted with the server (use a resource lock).
  The scheduled `npm run backup` (`pg_dump` kept 7 days) of the runbooks stays, for portability.
- SMB Azure Files is slower than a local disk; it is adequate for snapshots and run output. The mount uses the storage
  account key, or, in preview, the environment's managed identity [A9].
- More setup than Railway: resource group, environment, storage account, firewall rule, role assignments and a
  federated credential. The Railway-specific parts of the deploy runbook, the backup runbook, the release workflow and
  their tests (cards P1-55 and P2-12) must be redone for this host; they are not changed by this ADR.

## Notes

- 2026-10-24 (P1-184, verifier round 1): no registry is set for the image. The GHCR package is public and a Container
  App pulls a public image without a registry entry, while `az containerapp registry set` refuses a registry other
  than Azure Container Registry without a user name and password (azure-cli `containerapp` `set_registry`). Read "no
  registry, public GHCR package" where the Decision (App) says the registry is set with `az containerapp registry set
--server ghcr.io` [A11].
- 2026-10-24 (P1-184, verifier round 1): the database's "access limited by firewall rule" is, for release 1, the one
  rule that allows Azure services (`0.0.0.0`), which also admits other Azure tenants' resources to port 5432. TLS is
  required, the role passwords are 192-bit random and the administrator password is rotated on every provisioning and
  kept nowhere, but the risk stays open pending the owner. A private-access follow-up (a virtual network in
  `rg-rosetta`, the environment on a subnet, PostgreSQL private access with a private DNS zone, the roles created by a
  Container Apps job) is to be carded by the orchestrator. Firewall rules for the environment's outbound addresses are
  not an option, because those addresses are not stable on the Consumption plan.

## References

- Q-18; RF-1304, RF-1306, RNF-016; ADR-014, ADR-015, ADR-016, ADR-020 (superseded by this ADR); DEC-61, DEC-89,
  DEC-104, DEC-112, DEC-140, DEC-171; environments-and-delivery.md sections 2, 4, 10-12; cards P1-48, P1-55, P2-12;
  gate G-07.
- Extended by ADR-025 (2026-10-27, DEC-175): a staging app in the same environment and on the same server.
- Sources, all accessed 2026-10-24 (the page's own date in brackets where it gives one):
  - A1 https://learn.microsoft.com/en-us/azure/container-apps/billing [updated 2026-03-25]
  - A2 https://azure.microsoft.com/en-us/pricing/purchase-options/azure-account
  - A3 Azure retail prices API, https://prices.azure.com/api/retail/prices, region `spaincentral`: Container Apps
    (vCPU active 0.000034 and idle 0.000004 per second, memory active and idle 0.000004 per GiB-second, requests
    0.40 per million, `Environment Management Hour` 0.13 from 2026-09-01), PostgreSQL Flexible Server B1MS 0.0199 per
    hour, storage 0.1369 per GB-month, Files v2 Hot LRS 0.0271 per GB-month
  - A4 https://azure.microsoft.com/en-us/pricing/details/container-apps/ (free grants of 180,000 vCPU-seconds,
    360,000 GiB-seconds and 2 million requests; the page shows no prices, they come from A3)
  - A5 https://learn.microsoft.com/en-us/azure/postgresql/backup-restore/concepts-backup-restore [2026-07-05]
  - A6 https://learn.microsoft.com/en-us/azure/postgresql/flexible-server/concepts-supported-versions [2026-08-26]
  - A7 https://learn.microsoft.com/en-us/azure/container-apps/health-probes [2025-11-06]
  - A8 https://learn.microsoft.com/en-us/azure/container-apps/manage-secrets [2026-09-04]
  - A9 https://learn.microsoft.com/en-us/azure/container-apps/storage-mounts [2026-10-13]
  - A10 https://learn.microsoft.com/en-us/troubleshoot/azure/azure-kubernetes/storage/mountoptions-settings-azure-files
    [2026-07-24]
  - A11 https://learn.microsoft.com/en-us/azure/container-apps/github-actions [2025-05-14]
  - A12 https://learn.microsoft.com/en-us/azure/developer/github/connect-from-azure-openid-connect [2024-07-01]
  - A14 https://learn.microsoft.com/en-us/azure/cost-management-billing/costs/tutorial-acm-create-budgets [2025-06-26]
  - A15 https://learn.microsoft.com/en-us/azure/container-apps/ingress-overview [2026-10-09]
  - The `az containerapp update --image` command was read for ADR-020 (S22) and not re-read on 2026-10-24.
