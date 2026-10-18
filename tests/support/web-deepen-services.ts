import { EstimateDeepen } from '../../src/application/estimate/deepen-estimate.js';
import type { TaskResult } from '../../src/application/ports/task-results.js';
import { StartDeepen } from '../../src/application/use-cases/start-deepen.js';
import type { MemoryProjectRepository } from '../../src/infrastructure/db/memory-project-repository.js';
import type { MemoryProviderKeyRepository } from '../../src/infrastructure/db/memory-provider-key-repository.js';
import type { DeepenServices } from '../../src/presentation/web/deepen-routes.js';
import { catalogAreas, estimatePrices, FixedScans } from './estimate-harness.js';
import type { RunHarness } from './run-harness.js';

// RF-209: the Deepen use cases of the test server, over the run harness's memory adapters. The
// estimate reads the task results a test gives (none by default).

export function deepenServices(
  runs: RunHarness,
  stores: {
    readonly projects: MemoryProjectRepository;
    readonly keys: MemoryProviderKeyRepository;
  },
  results: readonly TaskResult[] = [],
): DeepenServices {
  const { projects, keys } = stores;
  return {
    startDeepen: new StartDeepen({
      ...{ projects, runs: runs.runs, manifests: runs.manifests, submit: runs.submit },
    }),
    estimateDeepen: new EstimateDeepen({
      ...{ projects, runs: runs.runs, scans: new FixedScans(catalogAreas), keys },
      taskResults: { read: () => Promise.resolve(results) },
      priceTable: estimatePrices,
    }),
  };
}
