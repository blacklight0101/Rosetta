# Runbook: local deployment with Docker Compose

Runs the whole system on your machine, the same image that runs hosted (RF-1301, ADR-014): PostgreSQL 17 and the
Rosetta app, with named volumes for the database (`pgdata`) and the data folder (`rosetta-data`). The app is
published on `http://127.0.0.1:8080` only; nothing else on your network can reach it (RNF-014). The files are
`compose.yaml` and `.env.example`; the database roles are created by `db/init/roles.sh`.

You need Docker with Compose v2 or later (Docker Desktop on Windows or macOS, Docker Engine on Linux) and a copy of
this repository. Node.js is not needed to run the stack.

## 1. Prepare .env

Copy the example and fill in the secrets. `.env` is git-ignored; never commit it and never paste its values into an
issue or a chat.

```
cp .env.example .env
```

Set these values in `.env` (the rest of the file is optional):

| Variable | What to put | How to make one |
|---|---|---|
| `ROSETTA_DB_ADMIN_PASSWORD` | the password of the PostgreSQL bootstrap superuser | `openssl rand -hex 24` |
| `ROSETTA_APP_DB_PASSWORD` | the password of the `rosetta_app` role the server uses | `openssl rand -hex 24` |
| `ROSETTA_MIGRATOR_DB_PASSWORD` | the password of the `rosetta_migrator` role that applies the migrations | `openssl rand -hex 24` |
| `ROSETTA_SECRET_KEY` | 32 random bytes, base64: encrypts the provider keys stored in the database | `openssl rand -base64 32` |
| `ROSETTA_ADMIN_USER` | the name of the first administrator | for example `admin` |
| `ROSETTA_ADMIN_PASSWORD` | the temporary password of the first administrator (at least 12 characters, not a common one) | `openssl rand -hex 16` |

The [README quick start](../../README.md#quick-start) generates and writes all of these for you, in PowerShell or bash.
To make a value by hand on Windows, where OpenSSL is usually missing, PowerShell makes the same values:

```powershell
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
$bytes = New-Object byte[] 24
$rng.GetBytes($bytes)
($bytes | ForEach-Object { $_.ToString('x2') }) -join ''   # 48 hex characters: a password
$key = New-Object byte[] 32
$rng.GetBytes($key)
[Convert]::ToBase64String($key)                            # 32 random bytes in base64: ROSETTA_SECRET_KEY
```

The three database passwords end up inside database URLs, so use URL-safe characters (hex is). Keep a copy of
`ROSETTA_SECRET_KEY` somewhere safe: without it the stored provider keys cannot be decrypted. The server refuses to start
with a key of 32 equal bytes, such as the all-zero placeholder of `.env.example` (error `RST-1008`).

If an existing install used the all-zero placeholder, preserve that exact old value in
`ROSETTA_SECRET_KEY_PREVIOUS` before replacing `ROSETTA_SECRET_KEY` with a new key generated above.
Keep both variables set and recreate the app with `docker compose up -d`. Start-up
re-encrypts stored provider keys under the new secret. Check `docker compose logs app` for
`Re-encrypted ... provider key(s) under the current secret; 0 could not be read.` before you
remove `ROSETTA_SECRET_KEY_PREVIOUS` and recreate the app again. If any key could not be read, keep
the previous key and resolve that warning first. An install with no stored keys has nothing to
re-encrypt and prints no re-encryption summary. Do not delete the database volume to rotate a key.

The role passwords are applied when the database volume is first created. Changing them in `.env` later does not
change the roles; reset the stack (section 5) or rotate the passwords in place (section 6).

Optional values: `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` (server keys, used under the caps you set in the app),
`GITHUB_TOKEN` (raises the GitHub rate limit for snapshot downloads), `ROSETTA_OLLAMA_URL` (section 4),
`ROSETTA_CONTACT_EMAIL` (the address behind the landing page's Request access button) and `ROSETTA_LOG_LEVEL`.
`DATABASE_URL` and the other keys of `.env.example` that Compose sets itself are ignored by the stack.

## 2. Start the stack

```
docker compose up -d --build --wait
```

The first run builds the image (a few minutes), starts the database, creates the roles, runs the one-off `migrate`
service, which applies the migrations as `rosetta_migrator` and ends, and then starts the app, which holds only the
`rosetta_app` credential (DEC-140). `--wait` (Compose v2.1 or later) returns only when the services are healthy. Check the
result:

```
docker compose ps
curl http://127.0.0.1:8080/healthz
```

`ps` shows `db` and `app` `healthy` (`docker compose ps -a` also lists `migrate` as `Exited (0)`), and `/healthz`
answers `{"status":"ok","version":"..."}`. If the app is not healthy, read `docker compose logs app`: a start-up
failure prints one line with an `RST-xxxx` code and its next step (a missing `ROSETTA_SECRET_KEY`, for example). If
the app was never started, read `docker compose logs migrate`: a migration that failed prints its `RST-24xx` code,
and Compose does not start the app after a failed migrate step.

## 3. First sign-in

1. Open `http://127.0.0.1:8080` and choose Sign in.
2. Sign in as `ROSETTA_ADMIN_USER` with `ROSETTA_ADMIN_PASSWORD`.
3. The page asks you to choose a new password (at least 12 characters, not on the common-password list, not
   containing your user name). Nothing else opens until you have.
4. Open Settings to store a provider key of your own, then create a project from a public GitHub URL on the
   Projects page. The administrator creates the other accounts.

`ROSETTA_ADMIN_USER` and `ROSETTA_ADMIN_PASSWORD` are used on the first start only, when no account exists. After the
first sign-in you can remove the password from `.env`.

## 4. Ollama on the host

The app container reaches the Ollama running on your machine at `http://host.docker.internal:11434`. Compose adds
the `host-gateway` entry for that name, so it also resolves on Linux. This is the default; set `ROSETTA_OLLAMA_URL`
in `.env` to use another address.

1. Install Ollama on the host and pull the models your project settings use (`docs/providers.md`).
2. Make Ollama listen on an address the container can reach. By default Ollama listens on `127.0.0.1` only, which
   the container cannot reach on Linux. Set `OLLAMA_HOST=0.0.0.0:11434` for the Ollama service, and keep that port
   closed on your firewall to other machines. On Docker Desktop (Windows, macOS) the default works.
3. Check from the container:

   ```
   docker compose exec app node -e "fetch('http://host.docker.internal:11434/api/tags').then(r => console.log(r.status))"
   ```

   It prints `200`. In the app, Settings has a Test button for each provider that makes one tiny call.

**Owner check (RF-1301).** The Ollama-on-host scenario depends on your machine and is not exercised by CI: with
Ollama running on the host, a role set to Ollama in a project reaches it at `ROSETTA_OLLAMA_URL`. The owner runs the
steps above once and records the result; the Compose smoke test in CI uses the fake provider.

## 5. Stop, restart and reset

| Goal | Command | What happens to the data |
|---|---|---|
| Stop | `docker compose down` | containers removed; accounts, projects, runs and snapshots stay in the volumes |
| Start again | `docker compose up -d` | the app finds the same data (RF-1301) |
| Update after a `git pull` | `docker compose up -d --build` | rebuilds the image; the `migrate` service applies pending migrations before the app starts (RF-1302) |
| Apply the migrations by hand | `docker compose run --rm migrate` | applies pending migrations and ends; run again it applies nothing |
| Logs | `docker compose logs -f app` | none |
| Reset everything | `docker compose down -v` | deletes `pgdata` and `rosetta-data`: every account, project, run and snapshot is lost |

### Upgrading a stack whose app applied the migrations itself

Before DEC-140 the app applied the migrations at start-up and kept `DATABASE_MIGRATOR_URL` in its environment for its
whole life. Your `.env` needs no change: `compose.yaml` builds both database URLs from the passwords, so
`docker compose up -d --build` creates the `migrate` service, runs it and starts the app with `DATABASE_URL` only.
`docker compose exec app env` then shows no migrator URL or password.

If you start the server outside Compose (from source, or with your own environment), the variables change:

- The server refuses to start (`RST-1000`) when `DATABASE_MIGRATOR_URL` is set, and the message names it. Remove
  `DATABASE_MIGRATOR_URL` from the server's environment and give it only to the migrate step:
  `node dist/presentation/migrate.js` with `DATABASE_MIGRATOR_URL` set, before the server.
- The server refuses to start with `RST-2405` when a migration has not been applied: run the migrate step
  (`docker compose run --rm migrate`, or the command above), then start the server again.
- The migrate step needs `DATABASE_MIGRATOR_URL`; it no longer falls back to `DATABASE_URL`.
- When `DATABASE_URL` connects as the role that owns the schema (one role for everything), the server starts but logs
  a warning, because that role can change or delete audit and cost-ledger rows. Point `DATABASE_URL` at `rosetta_app`.

### After a reset

After a reset the next `up` starts from an empty database: the roles are created again from the current `.env`
passwords and the first administrator is created from `ROSETTA_ADMIN_USER` and `ROSETTA_ADMIN_PASSWORD`.

Back up before you reset anything you want to keep: `docker compose exec db pg_dump -U postgres rosetta > rosetta.sql`
for the database, and a copy of the `rosetta-data` volume for the files.

## 6. Rotate the database role passwords

Rotate `ROSETTA_APP_DB_PASSWORD` and `ROSETTA_MIGRATOR_DB_PASSWORD` (and, if you want, the superuser's
`ROSETTA_DB_ADMIN_PASSWORD`) without losing data. The roles keep their rights; only the passwords change. Expect the
app to fail its database calls for the short time between steps 2 and 3.

1. Generate the new values: `openssl rand -hex 24` for each (hex is URL-safe, section 1).
2. Change the roles in the running database. `\password` hashes the value in `psql`, so it appears in no statement,
   log or shell history. Type the new value when it asks:

   ```
   docker compose exec db psql -U postgres -d rosetta
   \password rosetta_app
   \password rosetta_migrator
   \password postgres
   \q
   ```

   Run `\password postgres` only when you rotate `ROSETTA_DB_ADMIN_PASSWORD`.
3. Put the same values in `.env` (`ROSETTA_APP_DB_PASSWORD`, `ROSETTA_MIGRATOR_DB_PASSWORD`,
   `ROSETTA_DB_ADMIN_PASSWORD`) and run `docker compose up -d`. Compose recreates the containers whose environment
   changed; the volumes, and so the data, stay.
4. Check `curl http://127.0.0.1:8080/healthz` and sign in. If the app logs `password authentication failed`, a value
   in `.env` differs from the one typed in step 2: repeat step 2 with the `.env` value.

On a hosted deployment the same steps apply with the host's `psql` as the administrative role, and the new values go
into the host's secret store in step 3. Rotate after anyone who knew the old values leaves, and at least once a year.
The previous values stop working at step 2, so nothing else needs revoking.

## Troubleshooting
| Symptom | Likely cause and fix |
|---|---|
| `docker compose` stops with `Set ... in .env` | a required value is empty; set it in `.env` (section 1) |
| `password authentication failed for user "rosetta_app"` | the volume was created with other passwords; rotate the passwords (section 6) or reset (section 5) |
| The app is never started and `docker compose logs migrate` shows an error | the migrate step failed (for example `password authentication failed for user "rosetta_migrator"`, or an `RST-24xx` migration code); fix the cause and run `docker compose up -d` again |
| The app stops with `RST-1000` naming `DATABASE_MIGRATOR_URL` | the server was given the migrator URL; remove it from the server's environment (section 5, upgrading) |
| The app stops with `RST-2405` | the migrate step has not applied every migration; run `docker compose run --rm migrate`, then `docker compose up -d` |
| Port 8080 or 5432 already in use | stop the other program; the ports are fixed to `127.0.0.1:8080` and `127.0.0.1:5432` |
| The app cannot reach Ollama | section 4: Ollama must listen on an address the container reaches |
| You forgot the administrator password | another administrator resets it in the app; with none left, reset the stack (section 5) |

## CI smoke test

The `compose-smoke` job of CI runs this stack with `compose.ci.yaml`, which swaps the app for the image's `test`
stage with the fake provider and a fake GitHub. It waits for `/healthz`, runs the Playwright smoke (landing page,
first sign-in, creating a project, a scan), restarts the stack with `down` and `up`, checks that the account, the
project and the run are still there, then runs `down -v`. To run it by hand, use a throwaway `.env` and
`docker compose -p rosetta-smoke -f compose.yaml -f compose.ci.yaml up -d --build --wait`, then
`npx playwright test --config=playwright.compose.config.ts smoke` with the `.env` values exported, and finish with
`docker compose -p rosetta-smoke -f compose.yaml -f compose.ci.yaml down -v`.
