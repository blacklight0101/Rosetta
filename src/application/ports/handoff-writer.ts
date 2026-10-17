import type { HandoffPackage } from '../plan/handoff-package.js';
import type { RunScope } from './run-events.js';

// Architecture section 7 (`HandoffWriter`), RF-601, RF-603, data-model.md section 3.17: writes the
// hand-off package of a plan run into the `handoff/` folder of its run folder.

export interface HandoffWriter {
  /**
   * Writes every file of the package; returns the paths written, relative to the run folder, in a
   * stable order. Rejects with RST-1804 when a file cannot be written.
   */
  write(scope: RunScope, handoff: HandoffPackage): Promise<readonly string[]>;
}
