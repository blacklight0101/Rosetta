#!/usr/bin/env bash
# Creates the two database roles of the local deployment (data-model.md section 6, ADR-016,
# RF-1301). The postgres image runs this file once, on the first start of an empty pgdata volume,
# after it has made the rosetta database. The passwords come from the environment of the db
# service (the .env of the stack); nothing secret is written here, and psql quotes the values
# itself, so a password with a quote in it cannot break the statement.
#   rosetta_migrator  owns the database and its schema; used by the migration runner at start-up
#   rosetta_app       the role of the running server; the migrations grant it its table rights
set -euo pipefail

: "${ROSETTA_APP_DB_PASSWORD:?Set ROSETTA_APP_DB_PASSWORD in .env}"
: "${ROSETTA_MIGRATOR_DB_PASSWORD:?Set ROSETTA_MIGRATOR_DB_PASSWORD in .env}"

psql -v ON_ERROR_STOP=1 --username "${POSTGRES_USER:-postgres}" --dbname rosetta \
  -v app_password="$ROSETTA_APP_DB_PASSWORD" \
  -v migrator_password="$ROSETTA_MIGRATOR_DB_PASSWORD" <<'SQL'
CREATE ROLE rosetta_migrator LOGIN PASSWORD :'migrator_password';
CREATE ROLE rosetta_app LOGIN PASSWORD :'app_password';
ALTER DATABASE rosetta OWNER TO rosetta_migrator;
GRANT USAGE ON SCHEMA public TO rosetta_app;
SQL
