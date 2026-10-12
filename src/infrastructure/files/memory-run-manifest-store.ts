import type { RunScope } from '../../application/ports/run-events.js';
import type { RunManifestStore } from '../../application/ports/run-manifest-store.js';
import type { RunManifest } from '../../domain/runs/run-manifest.js';

// Architecture section 7, RF-003: the manifests of runs in memory, for unit tests. Passes the same
// contract suite as FileRunManifestStore.
export class MemoryRunManifestStore implements RunManifestStore {
  private readonly manifests = new Map<string, RunManifest>();

  write(scope: RunScope, manifest: RunManifest): Promise<void> {
    this.manifests.set(scope.id, manifest);
    return Promise.resolve();
  }

  read(scope: RunScope): Promise<RunManifest | undefined> {
    return Promise.resolve(this.manifests.get(scope.id));
  }
}
