# Runbook: backups and restore

Backups for RF-1306 (ADR-016, `docs/environments-and-delivery.md` section 12): a daily `pg_dump` of the database kept
7 days, and a weekly copy of the data folder (`ROSETTA_DATA_DIR`). The scripts work on any machine that can reach the
database; the hosted schedule is not set up yet (section 5).

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

Result: the drill passed. It tried the scripts against the local stack only; the hosted restore is Pending G-07 (below).

## 5. Hosted schedule (Azure Container Apps)

The host is now Azure Container Apps with Azure Database for PostgreSQL Flexible Server (ADR-024, DEC-171). Its own backups are automatic with point-in-time restore over 7 to 35 days, which meets RF-1306; the Railway wording below is kept until the follow-up backup card rewrites this section.

Pending G-07. The hosted deployment does not exist yet (P1-55 waits on G-07 and G-08), so none of this has run there:

- the daily run of `npm run backup` on Railway (a cron service or the host's scheduler), with the backup folder on a
  volume that is not the data volume, or a copy of it off the host;
- the host's own daily database backups, if the plan offers them (ADR-020 notes Railway keeps 6 days, RF-1306 asks 7);
- the snapshot before every deployment (`docs/environments-and-delivery.md` section 12);
- one restore drill on the hosted stack, recorded here with its date.
