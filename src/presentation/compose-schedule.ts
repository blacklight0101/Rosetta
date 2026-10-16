import {
  auditRetentionJob,
  type AuditRetentionDeps,
} from '../application/audit/audit-retention-job.js';
import type { Clock } from '../application/ports/clock.js';
import type { Logger } from '../application/ports/logger.js';
import type { ScheduledJob, Scheduler } from '../application/ports/scheduler.js';
import type { SessionStore } from '../application/ports/session-store.js';
import type { RunQueue } from '../application/runs/run-queue.js';
import { PgAuditRetention } from '../infrastructure/db/pg-audit-retention.js';
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

interface ScheduledParts {
  readonly file: JsonlFileLogger;
  readonly auth: { readonly sessions: SessionStore };
  readonly pool: DatabasePool;
  readonly clock: Clock;
  readonly runs: RunQueue;
  readonly logger: Logger;
}

/**
 * The periodic jobs of architecture section 7: log retention daily (RF-009), the purge of expired
 * sessions and cost reservations hourly (RF-1101, data-model.md section 9) and the run queue sweep
 * every minute (RF-1108): runs left `Running` without a process end as `Interrupted` and a free
 * slot gets its next queued run; audit retention daily and at start-up (RF-1109, DEC-132).
 */
export function scheduledTasks(parts: ScheduledParts): readonly ScheduledTask[] {
  const { file, auth, pool, clock, runs, logger } = parts;
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
  ];
}

/** P1-157 test stub. */
export function refusalCountTask(refusals: { flushAll(): Promise<void> }): ScheduledTask {
  return { intervalMs: dayMs, job: () => refusals.flushAll() };
}

/** RF-1109, DEC-132: audit rows older than 365 days are deleted at start-up and every 24 hours. */
export function auditRetentionTask(deps: AuditRetentionDeps): ScheduledTask {
  return { intervalMs: dayMs, runAtStart: true, job: auditRetentionJob(deps) };
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
