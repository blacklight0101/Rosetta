import { z } from 'zod';
import type { Clock } from '../../application/ports/clock.js';
import type { AppliedMigration, Migrator } from '../../application/ports/migrator.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { MigrationFile } from './migration-files.js';
import { pendingMigrations, type RecordedMigration } from './migration-plan.js';
import type { DatabasePool } from './pool.js';

export interface PgMigratorOptions {
  /** A pool connected as `rosetta_migrator` (see `createMigratorPool`). */
  readonly pool: DatabasePool;
  readonly migrations: readonly MigrationFile[];
  readonly clock: Clock;
}

// data-model.md section 4: the migrator's own bookkeeping table, created before anything else.
const CREATE_SCHEMA_VERSION = `CREATE TABLE IF NOT EXISTS schema_version (
  version int PRIMARY KEY,
  name text NOT NULL,
  checksum text NOT NULL,
  applied_at timestamptz NOT NULL
)`;
const SELECT_RECORDED = 'SELECT version, checksum FROM schema_version ORDER BY version';
const INSERT_RECORDED =
  'INSERT INTO schema_version (version, name, checksum, applied_at) VALUES ($1, $2, $3, $4)';

const recordedRows = z.array(z.object({ version: z.number().int(), checksum: z.string() }));

/** Applies `db/migrations/NNNN_*.sql` files in order, each in one transaction (ADR-016). */
// RF-1302
export class PgMigrator implements Migrator {
  private readonly pool: DatabasePool;
  private readonly migrations: readonly MigrationFile[];
  private readonly clock: Clock;

  constructor(options: PgMigratorOptions) {
    this.pool = options.pool;
    this.migrations = options.migrations;
    this.clock = options.clock;
  }

  async migrate(): Promise<readonly AppliedMigration[]> {
    await this.pool.query(CREATE_SCHEMA_VERSION);
    const pending = pendingMigrations(await this.recorded(), this.migrations);
    for (const migration of pending) {
      await this.apply(migration);
    }
    return pending.map(({ version, name }) => ({ version, name }));
  }

  private async recorded(): Promise<RecordedMigration[]> {
    const result = await this.pool.query(SELECT_RECORDED);
    return recordedRows.parse(result.rows);
  }

  private async apply(migration: MigrationFile): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(migration.sql);
      await client.query(INSERT_RECORDED, [
        migration.version,
        migration.name,
        migration.checksum,
        this.clock.now(),
      ]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw new RosettaError(
        ERROR_CODES.migrationFailed,
        `Migration ${migration.name} failed and was rolled back; the previous schema is kept.`,
        { cause: error },
      );
    } finally {
      client.release();
    }
  }
}
