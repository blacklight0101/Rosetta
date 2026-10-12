import type { CodeMapSource } from '../../domain/code-map/code-map.js';
import type { ProjectSettings } from '../projects/project-settings.js';
import type { RunScope } from './run-events.js';

// RF-100, RF-104, RF-105, ADR-004: the scan of one snapshot, from the universal scan and the language
// packs to `codemap.json` and `scan-summary.md` in the run folder. The infrastructure adapter composes
// the scan modules; `RunScan` only decides when to call it and what to record about the result. A
// failure is a RosettaError with its code; an aborted signal stops the scan between its steps.

export interface ScanRequest {
  /** The run whose folder receives the two output files. */
  readonly scope: RunScope;
  /** The snapshot tree of the repository (read only). */
  readonly root: string;
  /** What the code map records about the repository; `subpath` limits the scan (RF-124). */
  readonly source: CodeMapSource;
  /** The `scan` settings of the project. */
  readonly settings: ProjectSettings['scan'];
  readonly signal: AbortSignal;
}

export interface ScanReport {
  /** SHA-256 of `codemap.json` (RF-003). */
  readonly codeMapHash: string;
  readonly files: number;
  readonly areas: number;
  /** How many files are mapped at each level (RF-110). */
  readonly mapLevels: { readonly coarse: number; readonly symbols: number };
}

export interface ScanPipeline {
  scan(request: ScanRequest): Promise<ScanReport>;
}
