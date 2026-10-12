import { recordManifestCall, type MeteredCall } from '../../domain/runs/run-manifest.js';
import type { RunIndex } from '../ports/run-index.js';
import type { RunManifestStore } from '../ports/run-manifest-store.js';
import type { RunScope } from '../ports/run-events.js';

// RF-421, RF-1010, data-model.md sections 3.6 and 4 (`runs`): after each metered call the budget
// guard adds the call's tokens and cost to the run's manifest totals and to the running totals of
// its row (shown in lists; the cost ledger stays the source of truth). One recorder serves every
// provider of a run and its updates run one after another, so parallel agent tasks lose no call.
// A run that has ended or has no manifest is left as it is.

/** What the budget guard adds to a run after each call. */
export interface RunCostRecorder {
  addCall(call: MeteredCall): Promise<void>;
}

export interface ManifestCostRecorderOptions {
  readonly manifests: RunManifestStore;
  readonly runs: RunIndex;
  readonly scope: RunScope;
}

export class ManifestCostRecorder implements RunCostRecorder {
  private readonly options: ManifestCostRecorderOptions;
  private tail: Promise<unknown> = Promise.resolve();

  constructor(options: ManifestCostRecorderOptions) {
    this.options = options;
  }

  // RF-421
  addCall(call: MeteredCall): Promise<void> {
    const result = this.tail.then(async () => {
      const { manifests, runs, scope } = this.options;
      const stored = await manifests.read(scope);
      if (stored === undefined) return;
      const changed = recordManifestCall(stored, call);
      if (!changed.ok) return;
      await manifests.write(scope, changed.value);
      const { inputTokens, outputTokens, cachedInputTokens, costMicros } = changed.value.totals;
      await runs.recordTotals(scope.id, {
        inputTokens,
        outputTokens,
        cachedInputTokens,
        costMicros,
      });
    });
    this.tail = result.catch(() => undefined);
    return result;
  }
}
