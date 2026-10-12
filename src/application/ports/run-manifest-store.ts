import type { RunManifest } from '../../domain/runs/run-manifest.js';
import type { RunScope } from './run-events.js';

// Data-model.md section 3.6, RF-003: `runs/<runId>/manifest.json`, what a run was and how it ended.
// The whole file is replaced each time (a temporary file, then a rename), so a crash leaves the
// previous complete manifest, never half of one (RNF-002).

export interface RunManifestStore {
  /** Replaces the run's manifest; rejects with RST-2106 when it cannot be stored. */
  write(scope: RunScope, manifest: RunManifest): Promise<void>;
  /** Undefined when the run has no manifest; rejects with RST-2106 when the file is unreadable. */
  read(scope: RunScope): Promise<RunManifest | undefined>;
}
