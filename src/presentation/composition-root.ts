import { fileURLToPath } from 'node:url';
import type { Clock } from '../application/ports/clock.js';
import type { Logger, LogRecord } from '../application/ports/logger.js';
import type { ScheduledJob } from '../application/ports/scheduler.js';
import type { SessionStore } from '../application/ports/session-store.js';
import { RosettaError } from '../domain/errors/rosetta-error.js';
import { readAppVersion } from '../infrastructure/config/app-version.js';
import type { Environment } from '../infrastructure/config/environment.js';
import { readMigrationFiles } from '../infrastructure/db/migration-files.js';
import { PgDatabaseHealth } from '../infrastructure/db/pg-database-health.js';
import { PgMigrator } from '../infrastructure/db/pg-migrator.js';
import { createAppPool, createMigratorPool, type DatabasePool } from '../infrastructure/db/pool.js';
import { CSharpPack } from '../infrastructure/scan/packs/csharp/csharp-pack.js';
import { LanguagePackRegistry } from '../infrastructure/scan/packs/pack-registry.js';
import { SecretMasker } from '../infrastructure/guards/secret-masker.js';
import { FanOutLogger } from '../infrastructure/system/fan-out-logger.js';
import { IntervalScheduler } from '../infrastructure/system/interval-scheduler.js';
import { JsonlFileLogger } from '../infrastructure/system/jsonl-file-logger.js';
import { StdoutJsonLogger } from '../infrastructure/system/stdout-json-logger.js';
import { SystemClock } from '../infrastructure/system/system-clock.js';
import { ScryptPasswordHasher } from '../infrastructure/security/scrypt-password-hasher.js';
import { bootstrapAdministrator, composeAuth } from './compose-accounts.js';
import { startUp } from './start-up.js';
import { buildServer, type AuthServices } from './web/server.js';

// Architecture section 2: the only place that creates adapters and wires them together. This file
// is at the same depth in `src/` and in the built `dist/`, so `../../` is the repository root (the
// image's app folder) from both: migrations in `db/migrations/`, the front end built into
// `dist/web/` (tasks.md P1-12).
const repositoryRoot = new URL('../../', import.meta.url);
const migrationsFolder = fileURLToPath(new URL('db/migrations/', repositoryRoot));
const staticRoot = fileURLToPath(new URL('dist/web/', repositoryRoot));

export interface ApplicationOptions {
  readonly environment: Environment;
  /** `0.0.0.0:8080` in the image; tests use a loopback address and port 0. */
  readonly listen: { readonly host: string; readonly port: number };
  /** Standard output for the JSON log lines. */
  readonly output: { write(text: string): unknown };
}

export interface Application {
  /** Applies the migrations, listens and starts the scheduled jobs; returns the listening URL. */
  start(): Promise<string>;
  /** Stops the jobs, closes the server and the database pool. */
  stop(): Promise<void>;
}

interface ScheduledTask {
  readonly intervalMs: number;
  readonly job: ScheduledJob;
}

const dayMs = 86_400_000;
const hourMs = 3_600_000;

interface ScheduledParts {
  readonly file: JsonlFileLogger;
  readonly sessions: SessionStore;
  readonly clock: Clock;
}

/**
 * The periodic jobs of architecture section 7: log retention daily (RF-009) and the purge of
 * expired sessions hourly (RF-1101). The cards that add a job (restart recovery) add it here.
 */
function scheduledTasks(parts: ScheduledParts): readonly ScheduledTask[] {
  const { file, sessions, clock } = parts;
  return [
    {
      intervalMs: dayMs,
      job: async () => {
        await file.applyRetention();
      },
    },
    {
      intervalMs: hourMs,
      job: async () => {
        await sessions.purgeExpired(clock.now());
      },
    },
  ];
}

/** Writes an entry from a callback; a log that cannot be written must not crash the process. */
function logSettled(logger: Logger, record: LogRecord): void {
  void Promise.allSettled([logger.log(record)]);
}

interface Loggers {
  readonly file: JsonlFileLogger;
  readonly logger: Logger;
  readonly masker: SecretMasker;
}

// RF-009: masked JSON lines to standard output and to the daily file.
function createLoggers(options: ApplicationOptions, clock: Clock): Loggers {
  const { environment, output } = options;
  const masker = new SecretMasker();
  const file = new JsonlFileLogger({
    dataDir: environment.dataDir,
    clock,
    masker,
    retentionDays: environment.logRetentionDays,
  });
  const stdout = new StdoutJsonLogger({ output, clock, masker, minLevel: environment.logLevel });
  return { file, logger: new FanOutLogger([stdout, file]), masker };
}

// RF-1302: migrations run as `rosetta_migrator` on a pool of their own, closed afterwards.
async function migrate(environment: Environment, clock: Clock, logger: Logger): Promise<void> {
  const pool = createMigratorPool(environment, (error) => {
    logSettled(logger, { level: 'warn', logger: 'db', message: error.message });
  });
  try {
    const migrations = await readMigrationFiles(migrationsFolder);
    const applied = await new PgMigrator({ pool, migrations, clock }).migrate();
    await logger.log({
      level: 'info',
      logger: 'db',
      message: `Applied ${String(applied.length)} migration(s).`,
      data: { applied: applied.map((migration) => migration.name) },
    });
  } finally {
    await pool.end();
  }
}

function failureRecord(error: unknown): LogRecord {
  const message = error instanceof Error ? error.message : String(error);
  return {
    level: 'error',
    logger: 'start-up',
    message: `Rosetta could not start: ${message}`,
    ...(error instanceof RosettaError ? { code: error.code } : {}),
  };
}

interface ServerParts {
  readonly environment: Environment;
  readonly logger: Logger;
  readonly pool: DatabasePool;
  readonly auth: AuthServices;
}

// ADR-017, RF-1303, RF-1009: the HTTP server with the database probe, the session use cases and
// the shipped version.
async function createServer(parts: ServerParts): Promise<ReturnType<typeof buildServer>> {
  const { environment, logger, pool, auth } = parts;
  return buildServer({
    logger,
    databaseHealth: new PgDatabaseHealth(pool),
    auth,
    version: await readAppVersion(),
    publicUrl: environment.publicUrl,
    trustProxy: environment.trustProxy,
    staticRoot,
  });
}

// RF-110, ADR-004: the language packs of this release. Adding a language is one line here and a pack
// under src/infrastructure/scan/packs/; the scan itself never names a stack.
export async function composeLanguagePacks(): Promise<LanguagePackRegistry> {
  return new LanguagePackRegistry([await CSharpPack.create()]);
}

function createScheduler(logger: Logger): IntervalScheduler {
  return new IntervalScheduler((error) => {
    logSettled(logger, { level: 'error', logger: 'scheduler', message: String(error) });
  });
}

// Architecture section 2
export function composeApplication(options: ApplicationOptions): Application {
  const { environment } = options;
  const clock = new SystemClock();
  const { file, logger, masker } = createLoggers(options, clock);
  const hasher = new ScryptPasswordHasher();
  const pool = createAppPool(environment, (error) => {
    logSettled(logger, { level: 'warn', logger: 'db', message: error.message });
  });
  const scheduler = createScheduler(logger);
  const cancels: (() => void)[] = [];
  let close: () => Promise<void> = () => Promise.resolve();

  const stop = async (): Promise<void> => {
    for (const cancel of cancels.splice(0)) cancel();
    await close();
    await pool.end();
  };

  const start = async (): Promise<string> => {
    try {
      await file.applyRetention();
      const auth = await composeAuth({ pool, logger, clock, masker, hasher });
      const server = await createServer({ environment, logger, pool, auth: auth.services });
      close = () => server.close();
      let address = '';
      await startUp({
        migrate: () => migrate(environment, clock, logger),
        bootstrapAdmin: () =>
          bootstrapAdministrator({ environment, pool, logger, clock, masker, hasher }),
        listen: async () => {
          address = await server.listen(options.listen);
        },
        startScheduler: () => {
          cancels.push(
            ...scheduledTasks({ file, sessions: auth.sessions, clock }).map((task) =>
              scheduler.every(task.intervalMs, task.job),
            ),
          );
        },
      });
      return address;
    } catch (error) {
      logSettled(logger, failureRecord(error));
      await stop();
      throw error;
    }
  };

  return { start, stop };
}
