import {
  auditRetentionJob,
  type AuditRetentionDeps,
} from '../application/audit/audit-retention-job.js';
import { folderSweepJob, type FolderSweepDeps } from '../application/projects/folder-sweep.js';
import type { Clock } from '../application/ports/clock.js';
import type { Logger } from '../application/ports/logger.js';
import type { ScheduledJob, Scheduler } from '../application/ports/scheduler.js';
import type { SessionStore } from '../application/ports/session-store.js';
import type { RunQueue } from '../application/runs/run-queue.js';
import { PgAuditRetention } from '../infrastructure/db/pg-audit-retention.js';
import { PgProjectRepository } from '../infrastructure/db/pg-project-repository.js';
import { PgRunIndex } from '../infrastructure/db/pg-run-index.js';
import { NodeWorkspaceFolders } from '../infrastructure/files/node-workspace-folders.js';
import { PgCostLedger } from '../infrastructure/db/pg-cost-ledger.js';
import type { DatabasePool } from '../infrastructure/db/pool.js';
import type { JsonlFileLogger } from '../infrastructure/system/jsonl-file-logger.js';

export interface ScheduledTask {
  readonly intervalMs: number;
  readonly job: ScheduledJob;
  readonly runAtStart?: boolean;
}

const dayMs = 86_400_000;
const hourMs = 3_600_000;
const minuteMs = 60_000;

export interface ScheduledParts {
  readonly file: JsonlFileLogger;
  readonly auth: {
    readonly sessions: SessionStore;
    readonly services: { readonly refusals: { flushEnded(): Promise<void> } };
  };
  readonly pool: DatabasePool;
  readonly environment: { readonly dataDir: string };
  readonly clock: Clock;
  readonly runs: RunQueue;
  readonly logger: Logger;
}

/**
 * The periodic jobs of architecture section 7: log retention daily (RF-009), the purge of expired
 * sessions and cost reservations hourly (RF-1101, data-model.md section 9) and the run queue sweep
 * every minute (RF-1108): runs left `Running` without a process end as `Interrupted` and a free
 * slot gets its next queued run; audit retention daily and at start-up (RF-1109, DEC-132); the
 * count rows of refused requests every minute (RF-1109, DEC-141); the sweep of folders without rows
 * daily and at start-up (P1-152).
 */
export function scheduledTasks(parts: ScheduledParts): readonly ScheduledTask[] {
  const { file, auth, pool, environment, clock, runs, logger } = parts;
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
    auditRetentionTask({ retention: new PgAuditRetention(pool), clock, logger }),
    refusalCountTask(auth.services.refusals),
    folderSweepTask({
      projects: new PgProjectRepository(pool),
      runs: new PgRunIndex(pool),
      folders: new NodeWorkspaceFolders(environment.dataDir),
      clock,
      logger,
    }),
  ];
}

/**
 * RF-1109, DEC-141: once a minute the count rows of ended minutes are written, so a flood that
 * stops is still counted without waiting for the next refused request.
 */
export function refusalCountTask(refusals: { flushEnded(): Promise<void> }): ScheduledTask {
  return { intervalMs: minuteMs, job: () => refusals.flushEnded() };
}

/** RF-1109, DEC-132: audit rows older than 365 days are deleted at start-up and every 24 hours. */
export function auditRetentionTask(deps: AuditRetentionDeps): ScheduledTask {
  return { intervalMs: dayMs, runAtStart: true, job: auditRetentionJob(deps) };
}

/**
 * P1-152, RF-1012: the project and run folders that no row owns are removed at start-up and every
 * 24 hours.
 */
export function folderSweepTask(deps: FolderSweepDeps): ScheduledTask {
  return { intervalMs: dayMs, runAtStart: true, job: folderSweepJob(deps) };
}

/**
 * Registers every task on its interval and runs the ones marked `runAtStart` once now, without
 * waiting for them; a failing start-up run is dropped (the job reports its own failures) and
 * never stops the other tasks. Returns the functions that cancel the tasks.
 */
export function startScheduledTasks(
  scheduler: Scheduler,
  tasks: readonly ScheduledTask[],
): (() => void)[] {
  return tasks.map((task) => {
    const cancel = scheduler.every(task.intervalMs, task.job);
    if (task.runAtStart === true) void Promise.allSettled([task.job()]);
    return cancel;
  });
}
