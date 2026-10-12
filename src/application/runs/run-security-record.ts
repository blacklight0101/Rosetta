import type { Result } from '../../domain/errors/result.js';
import {
  recordManifestBlockedCall,
  recordManifestMasking,
  type ManifestProblem,
  type RunManifest,
} from '../../domain/runs/run-manifest.js';
import type { RunManifestStore } from '../ports/run-manifest-store.js';
import type { RunScope } from '../ports/run-events.js';

// RF-141, RF-009, data-model.md section 3.6: what the egress guard adds to a run's manifest: the
// secrets masked per kind and the calls a guard blocked. One recorder serves every provider of a
// run, and its updates run one after another, so parallel agent tasks lose no count. A run that
// has ended or has no manifest is left as it is.

/** The manifest fields the egress guard keeps up to date. */
export interface RunSecurityRecorder {
  /** Adds the secrets masked in content sent for the first time, per kind. */
  addMasking(counts: Readonly<Record<string, number>>): Promise<void>;
  /** Counts one call a guard blocked. */
  addBlockedCall(): Promise<void>;
}

export interface ManifestSecurityRecorderOptions {
  readonly manifests: RunManifestStore;
  readonly scope: RunScope;
}

type ManifestChange = (manifest: RunManifest) => Result<RunManifest, ManifestProblem>;

export class ManifestSecurityRecorder implements RunSecurityRecorder {
  private readonly options: ManifestSecurityRecorderOptions;
  private tail: Promise<unknown> = Promise.resolve();

  constructor(options: ManifestSecurityRecorderOptions) {
    this.options = options;
  }

  // RF-141
  addMasking(counts: Readonly<Record<string, number>>): Promise<void> {
    return this.update((manifest) => recordManifestMasking(manifest, counts));
  }

  // RF-141
  addBlockedCall(): Promise<void> {
    return this.update(recordManifestBlockedCall);
  }

  private update(change: ManifestChange): Promise<void> {
    const result = this.tail.then(async () => {
      const { manifests, scope } = this.options;
      const stored = await manifests.read(scope);
      if (stored === undefined) return;
      const changed = change(stored);
      if (changed.ok) await manifests.write(scope, changed.value);
    });
    this.tail = result.catch(() => undefined);
    return result;
  }
}
