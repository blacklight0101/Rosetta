import type { Logger } from '../../src/application/ports/logger.js';
import type {
  ReadRefusal,
  RepositoryReader,
} from '../../src/application/ports/repository-reader.js';
import type { Result } from '../../src/domain/errors/result.js';
import type { MemoryLogger } from './memory-logger.js';

/** A snapshot to read: repository-relative paths and their text. */
export interface ReaderFixture {
  readonly files: Readonly<Record<string, string>>;
  readonly ignoreRules?: string;
  readonly allowDenied?: readonly string[];
  readonly subpath?: string;
}

export type RepositoryReaderFactory = (
  fixture: ReaderFixture,
  logger: Logger,
) => Promise<RepositoryReader>;

interface ReaderHarness {
  readonly reader: RepositoryReader;
  readonly logger: MemoryLogger;
}

export type NewReader = (fixture: ReaderFixture) => Promise<ReaderHarness>;

/** The refusal of a failed result, or undefined when the call succeeded. */
export function refusalOf<T>(result: Result<T, ReadRefusal>): ReadRefusal | undefined {
  return result.ok ? undefined : result.error;
}

/** The codes of the security events the logger received, in order. */
export function securityCodes(logger: MemoryLogger): readonly string[] {
  return logger.entries
    .filter((entry) => entry.logger === 'security')
    .map((entry) => entry.code ?? '');
}
