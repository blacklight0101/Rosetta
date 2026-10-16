import { z } from 'zod';
import type { RecordedMigration } from './migration-plan.js';
import type { DatabasePool } from './pool.js';

// RF-1302, DEC-140: what the server, with its own credential (`DATABASE_URL`), reads about the
// schema at start-up. It never changes the schema; the one-off migrate step does that.

// Absent (an empty database) or not readable (before migration 0010 granted SELECT to rosetta_app).
const READABLE = `SELECT to_regclass('schema_version') IS NOT NULL
  AND has_table_privilege(to_regclass('schema_version'), 'SELECT') AS readable`;
const SELECT_RECORDED = 'SELECT version, checksum FROM schema_version ORDER BY version';
// The role that owns audit_events can update and delete audit and ledger rows (P1-49 F-02).
// pg_has_role is true for the owner, a member of the owning role and a superuser.
const OWNS_SCHEMA = `SELECT coalesce(bool_or(pg_has_role(current_user, c.relowner, 'USAGE')), false) AS owner
  FROM pg_class c WHERE c.oid = to_regclass('audit_events')`;

const readableRows = z.array(z.object({ readable: z.boolean() }));
const recordedRows = z.array(z.object({ version: z.number().int(), checksum: z.string() }));
const ownerRows = z.array(z.object({ owner: z.boolean() }));

// RF-1302
export class PgSchemaVersion {
  private readonly pool: DatabasePool;

  constructor(pool: DatabasePool) {
    this.pool = pool;
  }

  /** The applied migrations, or `undefined` when `schema_version` is absent or not readable. */
  async recorded(): Promise<readonly RecordedMigration[] | undefined> {
    const readable = readableRows.parse((await this.pool.query(READABLE)).rows)[0]?.readable;
    if (readable !== true) return undefined;
    return recordedRows.parse((await this.pool.query(SELECT_RECORDED)).rows);
  }

  /** True when the connection's role owns the schema (it could change audit and ledger rows). */
  async connectsAsOwner(): Promise<boolean> {
    return ownerRows.parse((await this.pool.query(OWNS_SCHEMA)).rows)[0]?.owner === true;
  }
}
