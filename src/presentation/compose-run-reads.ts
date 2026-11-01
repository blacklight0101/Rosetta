import { ReadOverview } from '../application/use-cases/read-overview.js';
import { ReadPackageChecks } from '../application/use-cases/read-package-checks.js';
import { ReadRunCoverage } from '../application/use-cases/read-run-coverage.js';
import type { RunIndex } from '../application/ports/run-index.js';
import { FileRunTextFiles } from '../infrastructure/files/file-run-text-files.js';
import type { NodeOutputWriter } from '../infrastructure/files/node-output-writer.js';
import type { OverviewServices } from './web/overview-routes.js';

// RF-264, RF-230, RF-1105: the use cases that read a file the run wrote for its own page: the
// overview and the files read per area.

// RF-264, RF-230
export function composeRunReads(runs: RunIndex, writer: NodeOutputWriter): OverviewServices {
  const files = new FileRunTextFiles(writer);
  return {
    readOverview: new ReadOverview({ runs, files }),
    readCoverage: new ReadRunCoverage({ runs, files }),
    readChecks: new ReadPackageChecks({ runs, files }),
  };
}
