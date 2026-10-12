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

// RF-009, RNF-003: a data key that names a secret hides its whole value, whatever its type, so a
// secret the text masker cannot recognise (plain words, a number) never reaches a log. The first
// matching name gives the marker.
const secretKeyNames: readonly { readonly name: RegExp; readonly marker: string }[] = [
  { name: /api[_-]?key/i, marker: '[MASKED:api-key]' },
  { name: /token/i, marker: '[MASKED:bearer-token]' },
  { name: /password|passwd|pwd|secret/i, marker: '[MASKED:password]' },
];

function secretMarkerOf(key: string): string | undefined {
  return secretKeyNames.find(({ name }) => name.test(key))?.marker;
}

function maskData(
  data: Readonly<Record<string, LogValue>>,
  masker: TextMasker,
): Record<string, LogValue> {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [
      masker.mask(key).text,
      secretMarkerOf(key) ?? maskValue(value, masker),
    ]),
  );
}

/** Every string of the record masked: logger, message, ids, data keys and data values. */
function maskRecord(record: LogRecord, masker: TextMasker): LogRecord {
  const mask = (text: string): string => masker.mask(text).text;
  const { runId, agentTaskId, callId, userId, data } = record;
  return {
    ...record,
    logger: mask(record.logger),
    message: mask(record.message),
    ...(runId === undefined ? {} : { runId: mask(runId) }),
    ...(agentTaskId === undefined ? {} : { agentTaskId: mask(agentTaskId) }),
    ...(callId === undefined ? {} : { callId: mask(callId) }),
    ...(userId === undefined ? {} : { userId: mask(userId) }),
    ...(data === undefined ? {} : { data: maskData(data, masker) }),
  };
}

/** The optional fields in their fixed order, leaving out the absent ones. */
function contextFields(context: LogContext): LogContext {
  return {
    ...(context.code === undefined ? {} : { code: context.code }),
    ...(context.runId === undefined ? {} : { runId: context.runId }),
    ...(context.agentTaskId === undefined ? {} : { agentTaskId: context.agentTaskId }),
    ...(context.callId === undefined ? {} : { callId: context.callId }),
    ...(context.userId === undefined ? {} : { userId: context.userId }),
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

// RF-009, RNF-003: every entry passes the secret masking before any logger writes it. RF-141,
// DEC-57: when masking fails the entry is withheld; nothing of the original record is kept.
export function formatLogEntry(record: LogRecord, at: Date, masker: TextMasker): LogEntry {
  try {
    return entry(maskRecord(record, masker), at);
  } catch {
    return entry(
      {
        level: 'warn',
        logger: 'security',
        message: withheldMessage,
        code: ERROR_CODES.secretMaskingFailed,
      },
      at,
    );
  }
}

// RF-009: one entry is one JSON line; line breaks inside values are escaped by JSON.
export function toJsonLine(logEntry: LogEntry): string {
  return `${JSON.stringify(logEntry)}\n`;
}
