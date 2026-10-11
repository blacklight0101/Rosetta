import type { ErrorCode } from '../../domain/errors/codes.js';

// RF-009: the application log. Entries go to standard output and to the daily log file; every
// entry passes the secret masking before it is written.
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** JSON-safe structured data attached to an entry. */
export type LogValue = string | number | boolean | null | LogValue[] | { [key: string]: LogValue };

/** The optional fields of an entry: the `RST` code and the ids that apply. */
export interface LogContext {
  readonly code?: ErrorCode;
  readonly runId?: string;
  readonly agentTaskId?: string;
  readonly callId?: string;
  readonly userId?: string;
  readonly data?: Readonly<Record<string, LogValue>>;
}

export interface LogRecord extends LogContext {
  readonly level: LogLevel;
  /** The name of the component that writes the entry, for example `scan` or `security`. */
  readonly logger: string;
  readonly message: string;
}

export interface SecurityEventDetail extends Omit<LogContext, 'code'> {
  readonly message: string;
}

export interface Logger {
  log(record: LogRecord): Promise<void>;
  /** DEC-57: writes a `warn` entry with logger `security` and the event's code. */
  securityEvent(code: ErrorCode, detail: SecurityEventDetail): Promise<void>;
}
