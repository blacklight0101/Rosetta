import type {
  LogContext,
  LogLevel,
  LogRecord,
  LogValue,
  SecurityEventDetail,
} from '../../application/ports/logger.js';
import { ERROR_CODES, type ErrorCode } from '../../domain/errors/codes.js';
import type { TextMasker } from '../guards/secret-masker.js';

/** One line of the application log (data-model.md section 3.14). */
export interface LogEntry extends LogRecord {
  readonly schemaVersion: 1;
  readonly at: string;
}

const levelRank: Readonly<Record<LogLevel, number>> = { debug: 0, info: 1, warn: 2, error: 3 };

const withheldMessage = 'Log entry withheld because secret masking failed.';

// RF-009: `ROSETTA_LOG_LEVEL` and above reach standard output.
export function isAtLeast(level: LogLevel, minimum: LogLevel): boolean {
  return levelRank[level] >= levelRank[minimum];
}

// RF-009, DEC-57: a security event is a `warn` entry with logger `security` and the event code.
export function securityRecord(code: ErrorCode, detail: SecurityEventDetail): LogRecord {
  return { ...detail, level: 'warn', logger: 'security', code };
}

function maskValue(value: LogValue, masker: TextMasker): LogValue {
  if (typeof value === 'string') return masker.mask(value).text;
  if (Array.isArray(value)) return value.map((item) => maskValue(item, masker));
  if (value !== null && typeof value === 'object') return maskData(value, masker);
  return value;
}

function maskData(
  data: Readonly<Record<string, LogValue>>,
  masker: TextMasker,
): Record<string, LogValue> {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, maskValue(value, masker)]),
  );
}

/** The ids that apply, in their fixed order, leaving out the absent ones. */
function idFields(context: LogContext): LogContext {
  return {
    ...(context.runId === undefined ? {} : { runId: context.runId }),
    ...(context.agentTaskId === undefined ? {} : { agentTaskId: context.agentTaskId }),
    ...(context.callId === undefined ? {} : { callId: context.callId }),
    ...(context.userId === undefined ? {} : { userId: context.userId }),
  };
}

/** The optional fields in their fixed order, leaving out the absent ones. */
function contextFields(context: LogContext): LogContext {
  return {
    ...(context.code === undefined ? {} : { code: context.code }),
    ...idFields(context),
    ...(context.data === undefined ? {} : { data: context.data }),
  };
}

function entry(record: LogRecord, at: Date): LogEntry {
  const { level, logger, message } = record;
  return {
    schemaVersion: 1,
    at: at.toISOString(),
    level,
    logger,
    message,
    ...contextFields(record),
  };
}

/** RF-141, DEC-57: fail closed; only the ids survive, never the content that could not be masked. */
function withheldEntry(record: LogRecord, at: Date): LogEntry {
  return entry(
    {
      ...idFields(record),
      level: 'warn',
      logger: 'security',
      message: withheldMessage,
      code: ERROR_CODES.secretMaskingFailed,
    },
    at,
  );
}

// RF-009, RNF-003: every entry passes the secret masking before any logger writes it.
export function formatLogEntry(record: LogRecord, at: Date, masker: TextMasker): LogEntry {
  try {
    const message = masker.mask(record.message).text;
    const data = record.data === undefined ? undefined : maskData(record.data, masker);
    return entry({ ...record, message, ...(data === undefined ? {} : { data }) }, at);
  } catch {
    return withheldEntry(record, at);
  }
}

// RF-009: one entry is one JSON line; line breaks inside values are escaped by JSON.
export function toJsonLine(logEntry: LogEntry): string {
  return `${JSON.stringify(logEntry)}\n`;
}
