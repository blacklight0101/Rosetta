import type { CodeMap } from '../../domain/code-map/code-map.js';
import type { Run } from '../../domain/runs/run.js';
import type { RepositoryReader } from './repository-reader.js';
import type { ResolvedSource } from './run-executor.js';

// RF-200, RF-005, RF-126, data-model.md sections 3.3 and 3.4: what an understand run reads from the
// scan it builds on: the code map the scan wrote into its run folder (checked against the hash its
// manifest recorded), a read-only reader of the same snapshot with the scan's ignore rules and
// lifted deny patterns, and the pinned source, which the understand run records as its own.

export interface ScannedSource {
  readonly codeMap: CodeMap;
  /** Lower-case hexadecimal SHA-256 of the scan's `codemap.json`. */
  readonly codeMapHash: string;
  /** Read-only: the agent tools cannot change the snapshot (RF-005). */
  readonly reader: RepositoryReader;
  readonly source: ResolvedSource;
  /**
   * RF-155: the folders of the rendered workbooks the snapshot lists, relative to its root; absent
   * or empty for a GitHub snapshot and for a zip without workbooks.
   */
  readonly workbookFolders?: readonly string[];
}

export interface ScanResults {
  /**
   * The output of a scan run that ended `Completed`. Rejects with RST-1203 when its code map or
   * snapshot is gone and RST-1202 when the code map does not match the hash of its manifest.
   */
  open(scan: Run): Promise<ScannedSource>;
}
