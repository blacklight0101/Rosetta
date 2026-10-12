import type { ArchiveWriter } from '../../src/application/ports/archive-writer.js';
import { EstimateRun } from '../../src/application/estimate/estimate-run.js';
import { ExportZip } from '../../src/application/use-cases/export-zip.js';
import { StartRun } from '../../src/application/use-cases/start-run.js';
import type { MemoryProjectRepository } from '../../src/infrastructure/db/memory-project-repository.js';
import type { MemoryProviderKeyRepository } from '../../src/infrastructure/db/memory-provider-key-repository.js';
import type { ServerOptions } from '../../src/presentation/web/server.js';
import { catalogAreas, estimatePrices, FixedScans } from './estimate-harness.js';
import type { RunHarness } from './run-harness.js';

/** RF-1006, RF-1108: the run use cases of the harness, with the scan start over the projects. */
export function runServices(
  runs: RunHarness,
  stores: {
    readonly projects: MemoryProjectRepository;
    readonly keys: MemoryProviderKeyRepository;
  },
  route: Pick<ServerOptions['runs'], 'heartbeat' | 'streams'>,
  archives: ArchiveWriter,
): ServerOptions['runs'] {
  const { projects, keys } = stores;
  return {
    subscribeRunEvents: runs.subscribe,
    stopRun: runs.stop,
    exportZip: new ExportZip({ runs: runs.runs, archives }),
    startRun: new StartRun({ projects, submit: runs.submit }),
    // RF-425: every project's scan has the same fixed code map (Catalog and Orders).
    estimateRun: new EstimateRun({
      projects,
      runs: runs.runs,
      scans: new FixedScans(catalogAreas),
      keys,
      priceTable: estimatePrices,
    }),
    ...route,
  };
}
