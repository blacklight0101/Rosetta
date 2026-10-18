import type { ReportDownloadNames } from '../report/report-model.js';
import type { RunScope } from './run-events.js';

// RF-505: writes the zips the report links ("Download all") next to its pages, in the `report/`
// folder of the run folder.

export interface ReportDownloads {
  /**
   * Writes each zip named, whole or not at all. The run zip holds the run folder without the zips
   * of the report; the hand-off zip holds the `handoff/` folder. Rejects when a zip cannot be
   * written, including a hand-off zip for a run that has no `handoff/` folder.
   */
  write(scope: RunScope, names: ReportDownloadNames): Promise<void>;
}
