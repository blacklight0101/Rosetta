import type { RunIndex } from '../../src/application/ports/run-index.js';
import type { RunTextFiles } from '../../src/application/ports/run-text-files.js';
import { ReadOverview } from '../../src/application/use-cases/read-overview.js';
import { ReadPackageChecks } from '../../src/application/use-cases/read-package-checks.js';
import { ReadRunCoverage } from '../../src/application/use-cases/read-run-coverage.js';

/** The use cases that read a file the run wrote for its own page (RF-264, RF-230). */
export function pageReads(
  runs: RunIndex,
  files: RunTextFiles,
): {
  readOverview: ReadOverview;
  readCoverage: ReadRunCoverage;
  readChecks: ReadPackageChecks;
} {
  return {
    readOverview: new ReadOverview({ runs, files }),
    readCoverage: new ReadRunCoverage({ runs, files }),
    readChecks: new ReadPackageChecks({ runs, files }),
  };
}
