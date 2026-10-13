import type { Actor } from '../../domain/accounts/actor.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { entryBelongsToRun } from '../../domain/observability/log-scope.js';
import type { RunQueueState } from '../../domain/runs/run-states.js';
import type { ApplicationLogReader, StoredLogEntry } from '../ports/application-log-reader.js';
import type { Clock } from '../ports/clock.js';
import type { LogLevel } from '../ports/logger.js';
import type { RunIndex } from '../ports/run-index.js';

// RF-1011, RF-009, RF-1105: List run logs gives the "Logs" panel the application log entries of the
// user's own run, and the number of security events among them. Another user's run id and an
// unknown id give the same answer, and an entry that cannot be told to be this run's is never
// listed.

export interface ListRunLogsDependencies {
  readonly runs: RunIndex;
  readonly logs: ApplicationLogReader;
  readonly clock: Clock;
}

/** A log line written just after the run ended (a failure to record its end) still belongs to it. */
const AFTER_END_MS = 60_000;

/** The most entries one answer lists, the newest; the counts always cover all of them. */
export const MAX_LISTED_LOG_ENTRIES = 500;

export interface RunLogsView {
  /** The run's folder name. */
  readonly runKey: string;
  readonly runState: RunQueueState;
  readonly total: number;
  readonly entries: readonly StoredLogEntry[];
  readonly counts: Readonly<Record<LogLevel, number>>;
  /** Entries of logger `security` (DEC-57). */
  readonly securityEvents: number;
}

export class ListRunLogs {
  private readonly deps: ListRunLogsDependencies;

  constructor(deps: ListRunLogsDependencies) {
    this.deps = deps;
  }

  // RF-1011, RF-1105
  async execute(request: {
    readonly actor: Actor;
    readonly runId: string;
  }): Promise<Result<RunLogsView, 'not-found'>> {
    const { runs, logs, clock } = this.deps;
    const run = await runs.find(request.actor.userId, request.runId);
    if (run === undefined) return err('not-found');
    const keyShared = await runs.keyUsedByOthers(run.userId, run.runKey);
    const stored = await logs.read({
      fromMs: run.queuedAt,
      toMs: (run.endedAt ?? clock.now().getTime()) + AFTER_END_MS,
      mentioning: [run.id, run.runKey],
    });
    const own = stored.filter(
      (entry) => Date.parse(entry.at) >= run.queuedAt && entryBelongsToRun(entry, run, keyShared),
    );
    return ok({
      runKey: run.runKey,
      runState: run.queueState,
      total: own.length,
      entries: own.slice(-MAX_LISTED_LOG_ENTRIES),
      counts: countsOf(own),
      securityEvents: own.filter((entry) => entry.logger === 'security').length,
    });
  }
}

function countsOf(entries: readonly StoredLogEntry[]): Record<LogLevel, number> {
  const counts: Record<LogLevel, number> = { debug: 0, info: 0, warn: 0, error: 0 };
  for (const entry of entries) counts[entry.level] += 1;
  return counts;
}
