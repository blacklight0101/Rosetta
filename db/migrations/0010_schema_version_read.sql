-- 0010_schema_version_read: the server may read schema_version (data-model.md section 6; RF-1302,
-- DEC-140, P1-158). The server no longer migrates: a one-off migrate step does, and the server, as
-- rosetta_app, checks at start-up that no migration is pending, changed or unknown. SELECT is the
-- only right rosetta_app gets on the table, granted only when that role exists. schema_version is
-- created by the migration runner itself, so it exists when this migration runs.

DO $migration$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'rosetta_app') THEN
    EXECUTE format('GRANT SELECT ON TABLE %I.schema_version TO rosetta_app', current_schema());
  END IF;
END
$migration$;
