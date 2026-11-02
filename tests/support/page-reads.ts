import type { RunIndex } from '../../src/application/ports/run-index.js';
import type { RunTextFiles } from '../../src/application/ports/run-text-files.js';
import type { RunManifestStore } from '../../src/application/ports/run-manifest-store.js';
import { GetRun, type QueuePositions } from '../../src/application/use-cases/get-run.js';
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

/** P8-11: Get run over the harness, reading the cloud consent and source run of the manifests. */
export function getRunOf(
  runs: {
    readonly runs: RunIndex;
    readonly queue: QueuePositions;
    readonly manifests: RunManifestStore;
  },
  files: RunTextFiles,
): GetRun {
  return new GetRun({ runs: runs.runs, queue: runs.queue, files, manifests: runs.manifests });
}
