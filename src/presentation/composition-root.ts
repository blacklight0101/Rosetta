import { fileURLToPath } from 'node:url';
import type { Clock } from '../application/ports/clock.js';
import type { Logger, LogRecord } from '../application/ports/logger.js';
import type { ScheduledJob } from '../application/ports/scheduler.js';
import type { RunQueue } from '../application/runs/run-queue.js';
import type { SessionStore } from '../application/ports/session-store.js';
import { RosettaError } from '../domain/errors/rosetta-error.js';
import { readAppVersion } from '../infrastructure/config/app-version.js';
import type { Environment } from '../infrastructure/config/environment.js';
import { readMigrationFiles } from '../infrastructure/db/migration-files.js';
import { PgCostLedger } from '../infrastructure/db/pg-cost-ledger.js';
import { PgDatabaseHealth } from '../infrastructure/db/pg-database-health.js';
import { PgMigrator } from '../infrastructure/db/pg-migrator.js';
import { createAppPool, createMigratorPool, type DatabasePool } from '../infrastructure/db/pool.js';
import { CSharpPack } from '../infrastructure/scan/packs/csharp/csharp-pack.js';
import { LanguagePackRegistry } from '../infrastructure/scan/packs/pack-registry.js';
import { SecretMasker, type TextMasker } from '../infrastructure/guards/secret-masker.js';
import { FanOutLogger } from '../infrastructure/system/fan-out-logger.js';
import { IntervalScheduler } from '../infrastructure/system/interval-scheduler.js';
import { JsonlFileLogger } from '../infrastructure/system/jsonl-file-logger.js';
import { StdoutJsonLogger } from '../infrastructure/system/stdout-json-logger.js';
import { SystemClock } from '../infrastructure/system/system-clock.js';
import { AesGcmSecretBox } from '../infrastructure/security/aes-gcm-secret-box.js';
import { ScryptPasswordHasher } from '../infrastructure/security/scrypt-password-hasher.js';
import { bootstrapAdministrator, composeAuth, reEncryptProviderKeys } from './compose-accounts.js';
import type { Auth } from './compose-accounts.js';
import { composeProjects } from './compose-projects.js';
import { composeRuns, type RunComposition } from './compose-runs.js';
import { closePool } from './bounded-close.js';
import { startUp } from './start-up.js';
import { TestDoubles } from './test-doubles.js';
import { buildServer } from './web/server.js';

// Architecture section 2: the only place that creates adapters and wires them together. This file
// is at the same depth in `src/` and in the built `dist/`, so `../../` is the repository root (the
// image's app folder) from both: migrations in `db/migrations/`, the front end in `dist/web/` (P1-12).
const repositoryRoot = new URL('../../', import.meta.url);
const migrationsFolder = fileURLToPath(new URL('db/migrations/', repositoryRoot));
const staticRoot = fileURLToPath(new URL('dist/web/', repositoryRoot));
const templatesFolder = fileURLToPath(new URL('templates/', repositoryRoot));

export interface ApplicationOptions {
  readonly environment: Environment;
  /** `0.0.0.0:8080` in the image; tests use a loopback address and port 0. */
  readonly listen: { readonly host: string; readonly port: number };
  /** Standard output for the JSON log lines. */
  readonly output: { write(text: string): unknown };
  /** The fake GitHub and fake provider of the end-to-end tests; refused without ROSETTA_TEST=1. */
  readonly doubles?: TestDoubles;
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
const minuteMs = 60_000;

interface ScheduledParts {
  readonly file: JsonlFileLogger;
  readonly auth: { readonly sessions: SessionStore };
  readonly pool: DatabasePool;
  readonly clock: Clock;
  readonly runs: RunQueue;
}

/**
 * The periodic jobs of architecture section 7: log retention daily (RF-009), the purge of expired
 * sessions and cost reservations hourly (RF-1101, data-model.md section 9) and the run queue sweep
 * every minute (RF-1108): runs left `Running` without a process end as `Interrupted` and a free
 * slot gets its next queued run.
 */
function scheduledTasks(parts: ScheduledParts): readonly ScheduledTask[] {
  const { file, auth, pool, clock, runs } = parts;
  const reservations = new PgCostLedger(pool);
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
        await auth.sessions.purgeExpired(clock.now());
      },
    },
    {
      intervalMs: hourMs,
      job: async () => {
        await reservations.purgeExpired(clock.now());
      },
    },
    { intervalMs: minuteMs, job: () => runs.recover() },
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

interface CreatedServer {
  readonly server: ReturnType<typeof buildServer>;
  readonly runs: RunComposition;
}

interface ServerParts {
  readonly environment: Environment;
  readonly logger: Logger;
  readonly pool: DatabasePool;
  readonly auth: Auth;
  readonly clock: Clock;
  readonly masker: TextMasker;
  readonly doubles: TestDoubles | undefined;
}

// ADR-017, RF-1303, RF-1009: the HTTP server with the database probe, the session use cases and
// the shipped version.
async function createServer(parts: ServerParts): Promise<CreatedServer> {
  const { environment, logger, pool, auth, clock, masker, doubles } = parts;
  const version = await readAppVersion();
  const runs = composeRuns({
    ...{ pool, logger, clock, masker, version },
    dataDir: environment.dataDir,
    ...{ githubToken: environment.githubToken, ollamaUrl: environment.ollamaUrl },
    ...(doubles?.fetch === undefined ? {} : { fetch: doubles.fetch }),
    providers: auth.providers,
    priceTable: auth.priceTable,
    packs: await composeLanguagePacks(),
  });
  const projects = await composeProjects({ pool, logger, clock, masker, templatesFolder });
  const server = buildServer({
    logger,
    databaseHealth: new PgDatabaseHealth(pool),
    auth: auth.services,
    projects,
    runs: runs.services,
    ...{ version, publicUrl: environment.publicUrl, trustProxy: environment.trustProxy },
    contactEmail: environment.contactEmail,
    staticRoot,
  });
  return { server, runs };
}

// RF-1108, RNF-002: the runs stop first (they end as Interrupted and their streams end), then the
// server closes.
function closer(created: CreatedServer): () => Promise<void> {
  return async () => {
    await created.runs.queue.shutDown();
    await created.server.close();
  };
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

/** Starts every task on its interval; returns the functions that cancel them. */
function scheduleAll(logger: Logger, tasks: readonly ScheduledTask[]): (() => void)[] {
  const scheduler = createScheduler(logger);
  return tasks.map((task) => scheduler.every(task.intervalMs, task.job));
}

function openPool(environment: Environment, logger: Logger): DatabasePool {
  return createAppPool(environment, (error) => {
    logSettled(logger, { level: 'warn', logger: 'db', message: error.message });
  });
}

// ADR-015, DEC-112: the one password hasher and the box that seals provider keys under
// ROSETTA_SECRET_KEY (and opens values under ROSETTA_SECRET_KEY_PREVIOUS during a rotation).
function createSecrets(environment: Environment) {
  return {
    hasher: new ScryptPasswordHasher(),
    secretBox: new AesGcmSecretBox({
      current: environment.secretKey,
      previous: environment.secretKeyPrevious,
    }),
  };
}

// Architecture section 2
export function composeApplication(options: ApplicationOptions): Application {
  const { environment, doubles } = options;
  if (doubles !== undefined) TestDoubles.requireTestMode(environment);
  const clock = new SystemClock();
  const { file, logger, masker } = createLoggers(options, clock);
  const { hasher, secretBox } = createSecrets(environment);
  const pool = openPool(environment, logger);
  const cancels: (() => void)[] = [];
  let close: () => Promise<void> = () => Promise.resolve();

  const stop = async (): Promise<void> => {
    for (const cancel of cancels.splice(0)) cancel();
    await close();
    await closePool(pool, logger);
  };

  const start = async (): Promise<string> => {
    try {
      await file.applyRetention();
      const auth = await composeAuth(options, { pool, logger, clock, masker, hasher, secretBox });
      const { server, runs } = await createServer({
        ...{ environment, logger, pool, clock, masker, doubles },
        auth,
      });
      close = closer({ server, runs });
      const tasks = scheduledTasks({ file, auth, pool, clock, runs: runs.queue });
      let address = '';
      await startUp({
        migrate: () => migrate(environment, clock, logger),
        reEncryptKeys: () => reEncryptProviderKeys({ pool, logger, secretBox }),
        bootstrapAdmin: () =>
          bootstrapAdministrator({ environment, pool, logger, clock, masker, hasher }),
        recoverRuns: () => runs.recover(),
        listen: async () => {
          address = await server.listen(options.listen);
        },
        startScheduler: () => {
          cancels.push(...scheduleAll(logger, tasks));
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
