import type { Result } from '../../domain/errors/result.js';
import type { ManifestProblem, RunManifest } from '../../domain/runs/run-manifest.js';
import type { RunScope } from '../ports/run-events.js';
import type { RunManifestStore } from '../ports/run-manifest-store.js';
import { KeyedQueue } from '../support/keyed-queue.js';

// RF-003, RNF-002, data-model.md section 3.6: one run's manifest changed by several writers at once
// (the agent tasks, the budget guard's totals, the egress guard's counts). Each change reads the
// stored manifest, applies itself and writes the whole file, and all of them wait in one queue
// keyed by the run, so no change overwrites another. A run that has ended is left as it is.

export type ManifestChange = (manifest: RunManifest) => Result<RunManifest, ManifestProblem>;

export class ManifestUpdates {
  /** Shared with the cost and security recorders of the same run. */
  readonly queue = new KeyedQueue();
  private readonly manifests: RunManifestStore;
  private readonly scope: RunScope;

  constructor(manifests: RunManifestStore, scope: RunScope) {
    this.manifests = manifests;
    this.scope = scope;
  }

  // RF-003, RNF-002
  update(change: ManifestChange): Promise<void> {
    return this.queue.run(this.scope.id, async () => {
      const stored = await this.manifests.read(this.scope);
      if (stored === undefined) return;
      const changed = change(stored);
      if (changed.ok && changed.value !== stored)
        await this.manifests.write(this.scope, changed.value);
    });
  }
}
