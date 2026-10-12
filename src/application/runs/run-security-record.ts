import type { RunManifestStore } from '../ports/run-manifest-store.js';
import type { RunScope } from '../ports/run-events.js';

// RF-141, RF-009, data-model.md section 3.6: what the egress guard adds to a run's manifest.

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

export class ManifestSecurityRecorder implements RunSecurityRecorder {
  constructor(_options: ManifestSecurityRecorderOptions) {}

  addMasking(_counts: Readonly<Record<string, number>>): Promise<void> {
    return Promise.reject(new Error('not implemented'));
  }

  addBlockedCall(): Promise<void> {
    return Promise.reject(new Error('not implemented'));
  }
}
