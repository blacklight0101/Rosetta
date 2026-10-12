import type { Clock } from '../application/ports/clock.js';
import type { ScheduledJob } from '../application/ports/scheduler.js';
import type { SessionStore } from '../application/ports/session-store.js';
import type { RunQueue } from '../application/runs/run-queue.js';
import { PgCostLedger } from '../infrastructure/db/pg-cost-ledger.js';
import type { DatabasePool } from '../infrastructure/db/pool.js';
import type { JsonlFileLogger } from '../infrastructure/system/jsonl-file-logger.js';

export interface ScheduledTask {
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
export function scheduledTasks(parts: ScheduledParts): readonly ScheduledTask[] {
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
