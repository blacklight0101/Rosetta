import type { Result } from '../../domain/errors/result.js';
import type { RunScope } from './run-events.js';

// Architecture section 7 (`RunFileReader`), RF-504, RF-506, RF-1105, RF-005: opens one file of a
// run folder for reading. The scope names the owner, so one user's scope never reaches another
// user's folder; the path comes from a request and is untrusted.

export interface RunFileContent {
  /** The size in bytes. */
  readonly size: number;
  readonly body: AsyncIterable<Uint8Array>;
}

/** Anything that is not a plain file of the run folder: missing, a folder, a link, a bad path. */
export type RunFileRefusal = 'not-found';

export interface RunFileReader {
  /**
   * The file at `path` (relative to the run folder, forward slashes) as a byte stream. A path that
   * is absolute, has an empty, `.` or `..` segment or a name that is not plain, a link anywhere on
   * the way (the run folder included), a file with several hard links and anything that is not a
   * plain file are refused with the same answer as a file that does not exist.
   */
  open(scope: RunScope, path: string): Promise<Result<RunFileContent, RunFileRefusal>>;
}
