import type {
  ApplicationLogReader,
  LogQuery,
  StoredLogEntry,
} from '../../src/application/ports/application-log-reader.js';
import type { MemoryLogger } from './memory-logger.js';

const dayMs = 86_400_000;

function startOfUtcDay(ms: number): number {
  return Math.floor(ms / dayMs) * dayMs;
}

/**
 * RF-1011: the application log reader over the entries a MemoryLogger holds, with the contract of the
 * file reader: the UTC days of the query, the entries that mention one of its texts, oldest first.
 */
export class MemoryLogReader implements ApplicationLogReader {
  private readonly logger: MemoryLogger;

  constructor(logger: MemoryLogger) {
    this.logger = logger;
  }

  read(query: LogQuery): Promise<readonly StoredLogEntry[]> {
    const from = startOfUtcDay(query.fromMs);
    const to = startOfUtcDay(query.toMs) + dayMs;
    const entries = this.logger.entries.filter((entry) => {
      const at = Date.parse(entry.at);
      const text = JSON.stringify(entry);
      return at >= from && at < to && query.mentioning.some((needle) => text.includes(needle));
    });
    return Promise.resolve(
      entries.map(({ at, level, logger, message, code, runId, userId, agentTaskId, callId }) => ({
        at,
        level,
        logger,
        message,
        ...(code === undefined ? {} : { code }),
        ...(runId === undefined ? {} : { runId }),
        ...(userId === undefined ? {} : { userId }),
        ...(agentTaskId === undefined ? {} : { agentTaskId }),
        ...(callId === undefined ? {} : { callId }),
      })),
    );
  }
}
