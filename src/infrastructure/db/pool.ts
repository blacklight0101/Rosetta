import { Pool, type PoolClient } from 'pg';
import type { Environment, MigrationEnvironment } from '../config/environment.js';

// ADR-016: the only place that creates `pg` pools. Every query has a statement timeout, every
// connection attempt a connection timeout, and an idle client that fails is reported instead of
// crashing the process.

export type DatabasePool = Pool;
export type DatabaseClient = PoolClient;

export interface PoolOptions {
  readonly connectionString: string;
  /** Server-side limit per statement; default 30 seconds. */
  readonly statementTimeoutMs?: number;
  /** Called when an idle client loses its connection. */
  readonly onIdleError: (error: Error) => void;
}

const DEFAULT_STATEMENT_TIMEOUT_MS = 30_000;
const CONNECTION_TIMEOUT_MS = 10_000;
const MIGRATION_STATEMENT_TIMEOUT_MS = 300_000;

// ADR-016
export function createPool(options: PoolOptions): DatabasePool {
  const pool = new Pool({
    connectionString: options.connectionString,
    statement_timeout: options.statementTimeoutMs ?? DEFAULT_STATEMENT_TIMEOUT_MS,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
  });
  pool.on('error', options.onIdleError);
  return pool;
}

/** The server's pool, as `rosetta_app` (`DATABASE_URL`). */
// RF-1302
export function createAppPool(
  environment: Pick<Environment, 'databaseUrl'>,
  onIdleError: (error: Error) => void,
): DatabasePool {
  return createPool({ connectionString: environment.databaseUrl, onIdleError });
}

/**
 * The pool of the one-off migrate step, as `rosetta_migrator` (`DATABASE_MIGRATOR_URL`, DEC-140);
 * the server never creates one. Migrations may run longer than a request.
 */
// RF-1302
export function createMigratorPool(
  environment: Pick<MigrationEnvironment, 'databaseMigratorUrl'>,
  onIdleError: (error: Error) => void,
): DatabasePool {
  return createPool({
    connectionString: environment.databaseMigratorUrl,
    statementTimeoutMs: MIGRATION_STATEMENT_TIMEOUT_MS,
    onIdleError,
  });
}
