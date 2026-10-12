import type { CostReport } from '../budget/cost-report.js';
import type { RunScope } from './run-events.js';

// RF-426, data-model.md section 3.12: writes `cost.json` and `cost.md` into the run folder when the
// run ends. A file that cannot be written rejects with the writer's code.

export interface CostReportWriter {
  write(scope: RunScope, report: CostReport): Promise<void>;
}
