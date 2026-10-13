import type { RunScope } from './run-events.js';

// RF-504: small text files of a run folder, read for the report.

export interface RunTextFiles {
  /** The text of a file of the run's folder, `path` relative to it; undefined when there is none. */
  read(scope: RunScope, path: string): Promise<string | undefined>;
}
