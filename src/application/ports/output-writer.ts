import type { ErrorCode } from '../../domain/errors/codes.js';
import type { Result } from '../../domain/errors/result.js';

// RF-005: every file Rosetta writes lands inside the signed-in user's workspace
// `<data>/users/<userId>/`; the snapshot cache is never written through this port.

/** A file in one user's workspace; `path` is relative to the workspace, with forward slashes. */
export interface WorkspaceFile {
  readonly userId: string;
  readonly path: string;
}

export type WriteRefusalReason =
  'invalid-path' | 'outside-workspace' | 'snapshot-cache' | 'not-found';

export interface WriteRefusal {
  readonly code: ErrorCode;
  readonly reason: WriteRefusalReason;
  readonly message: string;
}

export interface OutputWriter {
  /** Writes the whole file atomically: a temporary name in the same folder, then a rename. */
  writeText(file: WorkspaceFile, content: string): Promise<Result<void, WriteRefusal>>;
  /** Appends one complete line (a JSON Lines record); `line` holds no line break. */
  appendLine(file: WorkspaceFile, line: string): Promise<Result<void, WriteRefusal>>;
  readText(file: WorkspaceFile): Promise<Result<string, WriteRefusal>>;
  /** Removes a file of the workspace; a file that does not exist is not an error (RNF-002). */
  remove(file: WorkspaceFile): Promise<Result<void, WriteRefusal>>;
}

/** RF-1006: reads a large text file line by line instead of as one string. */
export interface TextLineReader {
  /**
   * The complete lines of the file (each ended by a line break, without it), one at a time; a
   * last fragment without a line break (a torn write) is not yielded. A file that does not exist
   * is refused with reason `not-found`.
   */
  readLines(file: WorkspaceFile): Promise<Result<AsyncIterable<string>, WriteRefusal>>;
}
