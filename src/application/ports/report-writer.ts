import type { ReportModel } from '../report/report-model.js';
import type { RunScope } from './run-events.js';

// Architecture section 7 (`ReportWriter`), RF-504, RF-506, RF-1013, data-model.md section 3.17: writes
// a run's report files into the `report/` folder of its run folder.

export interface ReportWriter {
  /**
   * Writes `report.md`, `report.html`, `replay.html` and the page assets; returns the paths written,
   * relative to the run folder, in a stable order. Rejects when a file cannot be written.
   */
  write(scope: RunScope, model: ReportModel): Promise<readonly string[]>;
}
