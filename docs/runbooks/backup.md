# Runbook: backups and restore

Backups for RF-1306 (ADR-016, `docs/environments-and-delivery.md` section 12): a daily `pg_dump` of the database kept
7 days, and a weekly copy of the data folder (`ROSETTA_DATA_DIR`). The scripts work on any machine that can reach the
database; the hosted part is in section 5.

## 1. What is backed up

| What        | How                                                            | Name                         | Kept                     |
| ----------- | -------------------------------------------------------------- | ---------------------------- | ------------------------ |
| Database    | `pg_dump --format=custom` (owners and grants included)         | `rosetta-db-YYYY-MM-DD.dump` | dumps of the last 7 days |
| Data folder | copy of `ROSETTA_DATA_DIR`, when the newest copy is 7 days old | `rosetta-data-YYYY-MM-DD`    | the newest 4 copies      |

Not backed up: `ROSETTA_SECRET_KEY` (keep it outside the host; without it the stored provider keys cannot be
decrypted) and the code (GitHub). Names hold only the kind and the UTC day. Other files in the backup folder are never
touched by the pruning.

## 2. Run a backup

Settings come from the environment, never from arguments:

| Variable                      | Meaning                                                                                                          |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `ROSETTA_BACKUP_DATABASE_URL` | URL of an administrative role (for example `postgres`); `rosetta_app` cannot read every table                    |
| `ROSETTA_BACKUP_DIR`          | the folder that receives the backups; it must not be inside the data folder, nor the data folder inside it       |
| `ROSETTA_DATA_DIR`            | the data folder to copy                                                                                          |
| `ROSETTA_BACKUP_DB_CONTAINER` | optional: run `pg_dump`, `pg_restore` and `psql` inside this container with `docker exec` (no PostgreSQL client) |

```
npm run backup
```

The dump is written under a `.partial` name and renamed when complete; a failed dump leaves no file and prunes nothing.
The password reaches the tools only through the environment of the child process; it is in no argument, file name or log
line, and tool errors are redacted before they are printed. Exit code 1 means the run failed.

## 3. Restore

Restore the database into an empty database (a new stack before the app has started), then the data folder, from the
same day, because a database that knows projects whose folders are missing, or the reverse, makes the clean-up of
orphan folders refuse to run (`RST-1115`).

```
npm run restore -- [--dump <file>] [--data-target <empty folder> [--data-copy <name>]] [--force]
```

Without `--dump` the newest dump of `ROSETTA_BACKUP_DIR` is used; with `--data-target` the newest data copy (or
`--data-copy`) is copied there. The script refuses, before it changes anything, a database that already has tables and a
data folder that is not empty. `--force` replaces the database content (`pg_restore --clean --if-exists`) and merges into
the folder.

For the local Compose stack (the order matters, because the `migrate` service creates the tables):

1. `docker compose down -v` (this deletes the data; only on a stack you mean to rebuild), then
   `docker compose up -d --wait db`.
2. Set the variables of section 2 for the new database (`ROSETTA_BACKUP_DB_CONTAINER` is the `db` container) and run
   `npm run restore -- --data-target <empty folder>`.
3. `docker compose up -d --wait`: `migrate` finds every migration applied and the app starts.
4. Copy the folder into the volume: `docker cp <empty folder>/. <app container>:/data`.
5. Check `/healthz`, sign in, and compare the row counts of the tables with the source.

## 4. Restore drill (RF-1306)

**2026-10-18, local Compose, project `rosetta-p212`, image `rosetta:local` (31be669c0a1b), PostgreSQL 17.**

1. Started a throwaway stack with its own passwords: app on `127.0.0.1:57612`, database on `127.0.0.1:57622`
   (57613 was held by another container, left alone). The first administrator was created by the app; a marker file was
   written to `/data/users/drill/notes/marker.txt`. The database had 10 tables (1 user, 1 audit event, 3 server
   settings, 10 schema versions).
2. `npm run backup` wrote `rosetta-db-2026-10-18.dump` (28,108 bytes) and `rosetta-data-2026-10-18`.
3. Refusal check: `npm run restore` against the live database answered "The database already has 10 tables" and exited
   with 1, changing nothing.
4. `docker compose down -v`, then `up -d --wait db` only (empty database, roles created by `db/init/roles.sh`).
5. `npm run restore -- --data-target <folder>` restored the dump and the data folder; `up -d --wait` then started
   `migrate` (nothing to apply) and the app, which became healthy; `/healthz` answered `ok`.
6. The row counts of every table were identical to step 1; the marker file read back unchanged after `docker cp`.
7. `npm run restore -- --force` over the running database also finished, with identical counts.
8. `docker compose -p rosetta-p212 down -v` removed the drill stack.

Result: the drill passed. It tried the scripts against the local stack only; the hosted restore drill is in section 5.

## 5. Hosted schedule (Azure Container Apps)

The host is Azure Container Apps with Azure Database for PostgreSQL Flexible Server (ADR-024, DEC-171), provisioned on
2026-10-24 ([deploy.md](deploy.md), Deployment record). State of each part of RF-1306 on the hosted stack:

| Part                                     | How on Azure                                                                                                                                        | State on 2026-10-24                                     |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Daily database backup kept 7 days        | the server's automatic backups with point-in-time restore, `--backup-retention 7` in `azure-provision.yml`; the `CanNotDelete` lock keeps them safe | in place since the first provisioning                   |
| Restore point before every deployment    | point-in-time restore to the time the deploy job started (Deploy step 4 of deploy.md)                                                               | in place: any minute of the last 7 days can be restored |
| Weekly copy of the data folder           | the Azure Files share `rosetta-data`; `npm run backup` with the share mounted, or a share snapshot                                                  | not scheduled yet; a follow-up card                     |
| Portable `pg_dump` with `npm run backup` | from the owner's machine with a firewall rule for its IP, as in deploy.md section Backup                                                            | by hand when wanted                                     |
| One restore drill on the hosted stack    | point-in-time restore into a new server, checked, then removed (below)                                                                              | owner step, before the hand-in                          |

### Hosted restore drill (owner, Cloud Shell)

It creates a second B1MS server for a few minutes (billed by the hour) and removes it; the running app is not touched.

1. `az postgres flexible-server restore --resource-group rg-rosetta --name psql-rosetta-drill --source-server <server> --restore-time <UTC time a few minutes ago>`
   (about 10 minutes).
2. `az postgres flexible-server show --resource-group rg-rosetta --name psql-rosetta-drill --query state` answers
   `"Ready"`, and `az postgres flexible-server db list --resource-group rg-rosetta --server-name psql-rosetta-drill --query "[].name"`
   lists `rosetta`.
3. `az postgres flexible-server delete --resource-group rg-rosetta --name psql-rosetta-drill --yes` (the drill server
   has no lock).
4. Write the date, the restore time and the result in deploy.md, Deployment record.
