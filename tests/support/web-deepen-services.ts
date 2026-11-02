import type { RoleKeyDependencies } from '../../src/application/runs/role-keys.js';
import { ALL_KEYS_SERVED } from './web-role-keys.js';
import { NO_LISTED_MODELS } from '../../src/application/models/model-list.js';
import { EstimateDeepen } from '../../src/application/estimate/deepen-estimate.js';
import type { TaskResult } from '../../src/application/ports/task-results.js';
import { ReadUnderstanding } from '../../src/application/use-cases/read-understanding.js';
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
    /** RF-431: the key check; every role served when absent. */
    readonly roleKeys?: RoleKeyDependencies;
  },
  results: readonly TaskResult[] = [],
): DeepenServices {
  const { projects, keys } = stores;
  const taskResults = { read: () => Promise.resolve(results) };
  return {
    startDeepen: new StartDeepen({
      roleKeys: stores.roleKeys ?? ALL_KEYS_SERVED,
      ...{ projects, runs: runs.runs, manifests: runs.manifests, submit: runs.submit },
    }),
    estimateDeepen: new EstimateDeepen({
      ...{ projects, runs: runs.runs, scans: new FixedScans(catalogAreas), keys },
      taskResults,
      priceTable: estimatePrices,
      models: NO_LISTED_MODELS,
      answers: { answeredQuestions: () => Promise.resolve([]) },
      priorCards: { cardsOf: () => Promise.resolve([]), markAnswered: () => Promise.resolve([]) },
    }),
    readUnderstanding: new ReadUnderstanding({
      ...{ runs: runs.runs, scans: new FixedScans(catalogAreas), taskResults },
      manifests: runs.manifests,
    }),
  };
}
