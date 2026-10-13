import type { Actor } from '../../domain/accounts/actor.js';
import { err, type Result } from '../../domain/errors/result.js';
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

/** The most entries one answer lists, the newest; the counts always cover all of them. */
export const MAX_LISTED_LOG_ENTRIES = 500;

export interface RunLogsView {
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
  execute(request: {
    readonly actor: Actor;
    readonly runId: string;
  }): Promise<Result<RunLogsView, 'not-found'>> {
    void this.deps;
    void request;
    return Promise.resolve(err('not-found'));
  }
}
