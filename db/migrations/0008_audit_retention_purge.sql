-- 0008_audit_retention_purge: the one way to delete audit rows (data-model.md sections 4 and 6;
-- RF-1109, DEC-132). Audit rows are kept for 365 days. rosetta_app still has no UPDATE or DELETE
-- on audit_events; it may only call this function, which belongs to the role that runs the
-- migrations (the table owner) and runs with that role's rights (SECURITY DEFINER).
--   * search_path is fixed to pg_catalog, pg_temp and the table is schema-qualified, so a caller
--     cannot make the function resolve a name to an object of its own;
--   * the 365-day floor is measured with clock_timestamp() on the database clock, never from a
--     value the caller supplies, so a caller with a wrong clock cannot lower it;
--   * a cut-off younger than the floor, or NULL, is refused with SQLSTATE 22023 and deletes nothing;
--   * EXECUTE is revoked from PUBLIC and granted to rosetta_app only when that role exists.
-- The statements are built with format() so that the function names the schema the migration
-- runs in (public in the deployment, a schema of its own in the database tests).

DO $migration$
BEGIN
  EXECUTE format($create$
    CREATE FUNCTION %1$I.purge_audit_events_before(cut_off timestamptz)
    RETURNS bigint
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = pg_catalog, pg_temp
    AS $body$
    DECLARE
      removed bigint;
    BEGIN
      IF cut_off IS NULL OR cut_off > clock_timestamp() - interval '365 days' THEN
        RAISE EXCEPTION 'audit rows are kept for 365 days: the cut-off must be older than that'
          USING ERRCODE = '22023';
      END IF;
      DELETE FROM %1$I.audit_events WHERE at < cut_off;
      GET DIAGNOSTICS removed = ROW_COUNT;
      RETURN removed;
    END
    $body$
  $create$, current_schema());

  EXECUTE format(
    'REVOKE ALL ON FUNCTION %I.purge_audit_events_before(timestamptz) FROM PUBLIC',
    current_schema());

  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'rosetta_app') THEN
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION %I.purge_audit_events_before(timestamptz) TO rosetta_app',
      current_schema());
  END IF;
END
$migration$;
