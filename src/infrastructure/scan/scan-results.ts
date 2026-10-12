import type { Logger } from '../../application/ports/logger.js';
import type { OutputWriter } from '../../application/ports/output-writer.js';
import type { RunManifestStore } from '../../application/ports/run-manifest-store.js';
import type { ScannedSource, ScanResults } from '../../application/ports/scan-results.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';

// RF-200, RF-005, RF-126: the code map and the snapshot of a completed scan run.

export interface FileScanResultsOptions {
  readonly writer: OutputWriter;
  readonly manifests: RunManifestStore;
  /** The read-only repository tree of a snapshot folder name (`<data>/sources/<key>/files`). */
  readonly snapshotRoot: (snapshotKey: string) => string;
  readonly logger: Logger;
}

export class FileScanResults implements ScanResults {
  private readonly options: FileScanResultsOptions;

  constructor(options: FileScanResultsOptions) {
    this.options = options;
  }

  open(): Promise<ScannedSource> {
    return Promise.reject(new RosettaError(ERROR_CODES.codeMapMissing));
  }
}
