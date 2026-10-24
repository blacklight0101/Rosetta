import type { CostLedger } from '../ports/cost-ledger.js';
import type { CostTotals } from '../ports/cost-totals.js';
import type { Logger } from '../ports/logger.js';
import type { ProviderSinks } from '../ports/provider-set-factory.js';
import type { RunScope } from '../ports/run-events.js';
import type { RunExecution } from '../ports/run-executor.js';
import type { RunIndex } from '../ports/run-index.js';
import type { RunManifestStore } from '../ports/run-manifest-store.js';
import type { ManifestUpdates } from '../runs/manifest-updates.js';
import { ownerLogger } from '../runs/owner-logger.js';
import { RunBudgetEvents } from '../runs/run-budget-events.js';
import { ManifestCostRecorder } from '../runs/run-cost-record.js';
import { scopeOf } from '../runs/run-scope.js';
import { ManifestSecurityRecorder } from '../runs/run-security-record.js';

// RF-408, RF-142, RF-422, RF-1003, RF-1010: the sinks the guards of an understand run's providers
// write to: the call log and egress log of the run folder, the manifest's security and cost
// records, the run's stop, and the usage and budget events.

export interface RunSinkDependencies {
  /** The call log and the egress log of the run folder (RF-408, RF-142). */
  readonly runSinks: (scope: RunScope) => Pick<ProviderSinks, 'recorder' | 'egressLog'>;
  readonly manifests: RunManifestStore;
  readonly runs: RunIndex;
  readonly ledger: Pick<CostLedger, 'runEntries'>;
  readonly costTotals: Pick<CostTotals, 'projectGroups'>;
  readonly logger: Logger;
}

/** The run's sinks for its guards: call log, egress log, manifest records, stop and events. */
export async function runProviderSinks(
  deps: RunSinkDependencies,
  execution: RunExecution,
  updates: ManifestUpdates,
): Promise<ProviderSinks & { readonly budgetEvents: RunBudgetEvents }> {
  const { run, events } = execution;
  const scope = scopeOf(run);
  const { manifests, runs, ledger, costTotals } = deps;
  const logger = ownerLogger(deps.logger, run.userId);
  return {
    ...deps.runSinks(scope),
    security: new ManifestSecurityRecorder({ manifests, scope, queue: updates.queue }),
    costs: new ManifestCostRecorder({ manifests, runs, scope, queue: updates.queue }),
    stopRun: (reason) => {
      execution.stop(reason);
    },
    // RF-1003, RF-1010: usage and budget events start from what the run and project spent.
    budgetEvents: await RunBudgetEvents.open({ events, run, ledger, costTotals, logger }),
  };
}
