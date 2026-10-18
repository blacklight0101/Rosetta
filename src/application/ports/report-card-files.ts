import type { CardFile } from '../report/card-evidence.js';
import type { RunScope } from './run-events.js';

// RF-502, data-model.md section 3.7: the card files of a run read for the pages of the report.

export interface ReportCardFiles {
  /**
   * The cards of the card files at `paths` (relative to the run folder, as `cards/index.json` lists
   * them), in the order of `paths`. A file that is missing or does not read is left out: its card
   * has a row in the report but no page.
   */
  read(scope: RunScope, paths: readonly string[]): Promise<readonly CardFile[]>;
}
