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
}
