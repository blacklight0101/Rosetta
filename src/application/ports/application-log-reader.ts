import type { EpochMs } from '../../domain/accounts/user.js';
import type { LogLevel } from './logger.js';

// RF-1011, RF-009, data-model.md section 3.14: the entries of the application log the "Logs" panel
// shows. The log is one stream for the whole server, so the reader returns what mentions the run
// and the use case keeps the entries that are the user's own.

export interface StoredLogEntry {
  readonly at: string;
  readonly level: LogLevel;
  readonly logger: string;
  readonly message: string;
  readonly code?: string;
  readonly runId?: string;
  readonly userId?: string;
  readonly agentTaskId?: string;
  readonly callId?: string;
}

export interface LogQuery {
  /** The UTC days from the day of `fromMs` to the day of `toMs` are read. */
  readonly fromMs: EpochMs;
  readonly toMs: EpochMs;
  /** A line is parsed only when it holds one of these texts (the run's UUID or key). */
  readonly mentioning: readonly string[];
}

export interface ApplicationLogReader {
  /** The masked entries, oldest first; a line that does not parse is left out. */
  read(query: LogQuery): Promise<readonly StoredLogEntry[]>;
}
