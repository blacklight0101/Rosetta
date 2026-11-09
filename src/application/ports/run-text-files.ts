import type { RunScope } from './run-events.js';

// RF-504: small text files of a run folder, read for the report.

export interface RunTextFiles {
  /**
   * The text of a file of the run's folder, `path` relative to it; undefined when there is none, and
   * (P8-130) when it is larger than `maxBytes`, so a list never reads a huge file whole.
   */
  read(scope: RunScope, path: string, maxBytes?: number): Promise<string | undefined>;
}
