import type { ReadRefusal, ReadRefusalReason } from '../../application/ports/repository-reader.js';
import { ERROR_CODES, type ErrorCode } from '../../domain/errors/codes.js';
import { grepLimits } from './grep-limits.js';

// RF-140, RF-146, RF-147: the reason an agent sees when a read or a search is refused.

interface RefusalText {
  readonly code: ErrorCode;
  readonly message: string;
  /** Whether the refusal is logged as a security event (DEC-57). */
  readonly security: boolean;
}

const refusals: Readonly<Record<ReadRefusalReason, RefusalText>> = {
  'outside-root': {
    code: ERROR_CODES.pathOutsideRoot,
    message: 'The path is outside the analysed repository folder, so it was not read.',
    security: true,
  },
  'invalid-path': {
    code: ERROR_CODES.pathInvalid,
    message: 'The path is not a plain relative path with forward slashes, so it was not read.',
    security: true,
  },
  ignored: {
    code: ERROR_CODES.pathIgnored,
    message: "The path matches the project's ignore rules, so it is never read or sent.",
    security: true,
  },
  denied: {
    code: ERROR_CODES.pathDenied,
    message:
      'The path matches the built-in deny list of secret files, so it is never read or sent.',
    security: true,
  },
  'not-found': {
    code: ERROR_CODES.fileNotFound,
    message: 'There is no such file in the analysed repository; check the path and its case.',
    security: false,
  },
  'invalid-range': {
    code: ERROR_CODES.lineRangeInvalid,
    message:
      'Lines are 1-based whole numbers; the start must not be after the end or past the last line.',
    security: false,
  },
  'invalid-limit': {
    code: ERROR_CODES.byteLimitInvalid,
    message: 'The size limit must be a whole number of bytes, zero or more.',
    security: false,
  },
  'pattern-too-long': {
    code: ERROR_CODES.grepPatternTooLong,
    message: `The pattern is longer than ${String(grepLimits.maxPatternLength)} characters, so it was not run.`,
    security: true,
  },
  'invalid-pattern': {
    code: ERROR_CODES.grepPatternInvalid,
    message: 'The pattern is not a valid JavaScript regular expression.',
    security: false,
  },
  'too-large': {
    code: ERROR_CODES.fileTooLarge,
    message:
      "The file is larger than the project's scan.maxFileBytes, so it was not read; read a smaller file.",
    security: false,
  },
  timeout: {
    code: ERROR_CODES.grepTimedOut,
    message: 'The search took longer than its time limit and was stopped; use a simpler pattern.',
    security: true,
  },
};

export function refusal(reason: ReadRefusalReason): ReadRefusal {
  const { code, message } = refusals[reason];
  return { code, reason, message };
}

export function isSecurityRefusal(reason: ReadRefusalReason): boolean {
  return refusals[reason].security;
}

export function tooLargeNotice(files: number): string {
  return `${String(files)} file(s) larger than the project's scan.maxFileBytes were not searched.`;
}

export const matchCapNotice = `The search stopped at ${String(grepLimits.maxMatches)} matches; narrow the pattern or the pathGlob.`;

export const cutNotice = `Lines longer than ${String(grepLimits.maxLineLength)} characters were cut to that length before the search.`;
