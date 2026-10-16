import { fileURLToPath } from 'node:url';
import type { Logger, LogRecord } from '../application/ports/logger.js';
import type { AppliedMigration } from '../application/ports/migrator.js';
import { RosettaError } from '../domain/errors/rosetta-error.js';
import type { MigrationEnvironment } from '../infrastructure/config/environment.js';
import { readMigrationFiles } from '../infrastructure/db/migration-files.js';
import { requireCurrentSchema } from '../infrastructure/db/migration-plan.js';
import { PgMigrator } from '../infrastructure/db/pg-migrator.js';
import { PgSchemaVersion } from '../infrastructure/db/pg-schema-version.js';
import { createMigratorPool, type DatabasePool } from '../infrastructure/db/pool.js';
import { SecretMasker } from '../infrastructure/guards/secret-masker.js';
import { StdoutJsonLogger } from '../infrastructure/system/stdout-json-logger.js';
import { SystemClock } from '../infrastructure/system/system-clock.js';

// RF-1302, ADR-016 (DEC-140, P1-158): the migrations run in a one-off migrate step with
// DATABASE_MIGRATOR_URL, which ends before the server starts; the server, with DATABASE_URL only,
// checks the schema and never changes it. This file is at the same depth in `src/` and `dist/`, so
// `../../` is the repository root (the image's app folder) from both.
const migrationsFolder = fileURLToPath(new URL('../../db/migrations/', import.meta.url));

export interface MigrateOptions {
  readonly environment: MigrationEnvironment;
  /** Standard output for the JSON log lines. */
  readonly output: { write(text: string): unknown };
}

function failureRecord(error: unknown): LogRecord {
  const message = error instanceof Error ? error.message : String(error);
  return {
    level: 'error',
    logger: 'migrate',
    message: `The migrate step failed: ${message}`,
    ...(error instanceof RosettaError ? { code: error.code } : {}),
  };
}

/**
 * The migrate step: applies the pending migrations as `rosetta_migrator` under the advisory lock
 * and returns them; run again it applies nothing. A failure is logged with its code and rethrown.
 */
// RF-1302
export async function migrateDatabase(
  options: MigrateOptions,
): Promise<readonly AppliedMigration[]> {
  const { environment, output } = options;
  const clock = new SystemClock();
  const logger = new StdoutJsonLogger({
    ...{ output, clock, masker: new SecretMasker() },
    minLevel: environment.logLevel,
  });
  const pool = createMigratorPool(environment, (error) => {
    void Promise.allSettled([logger.log({ level: 'warn', logger: 'db', message: error.message })]);
  });
  try {
    const migrations = await readMigrationFiles(migrationsFolder);
    const applied = await new PgMigrator({ pool, migrations, clock }).migrate();
    await logger.log({
      level: 'info',
      logger: 'migrate',
      message: `Applied ${String(applied.length)} migration(s).`,
      data: { applied: applied.map((migration) => migration.name) },
    });
    return applied;
  } catch (error) {
    await logger.log(failureRecord(error));
    throw error;
  } finally {
    await pool.end();
  }
}

const OWNER_WARNING =
  'DATABASE_URL connects as the role that owns the schema, so the server could change or delete audit and cost-ledger rows; give the server the rosetta_app role (data-model.md section 6) and keep the owner for the migrate step.';

/**
 * The server's start-up check (DEC-140): refuses a schema with a pending (RST-2405), changed
 * (RST-2401) or unknown (RST-2402) migration, and warns when DATABASE_URL is the schema owner.
 */
// RF-1302
export async function checkSchema(pool: DatabasePool, logger: Logger): Promise<void> {
  const schema = new PgSchemaVersion(pool);
  requireCurrentSchema(await schema.recorded(), await readMigrationFiles(migrationsFolder));
  if (await schema.connectsAsOwner()) {
    await logger.log({ level: 'warn', logger: 'db', message: OWNER_WARNING });
  }
}
