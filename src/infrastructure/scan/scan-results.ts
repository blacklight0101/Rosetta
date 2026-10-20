import { createHash } from 'node:crypto';
import type { Logger } from '../../application/ports/logger.js';
import type { OutputWriter } from '../../application/ports/output-writer.js';
import type { RunManifestStore } from '../../application/ports/run-manifest-store.js';
import type { ScannedSource, ScanResults } from '../../application/ports/scan-results.js';
import { scanSettingsSchema } from '../../application/projects/project-settings.js';
import { scopeOf } from '../../application/runs/run-scope.js';
import type { CodeMap } from '../../domain/code-map/code-map.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { RunManifest } from '../../domain/runs/run-manifest.js';
import type { Run } from '../../domain/runs/run.js';
import { NodeRepositoryReader } from '../files/node-repository-reader.js';
import { runPath } from '../files/workspace-paths.js';
import { parseCodeMap } from './codemap/codemap-json.js';

// RF-200, RF-005, RF-126, data-model.md sections 3.3, 3.4 and 3.6: the code map and the snapshot of
// a completed scan run. The code map is read from the scan's run folder and must hash to what the
// scan's manifest recorded (a file changed since is refused, RST-1202); the snapshot is opened
// read-only with the ignore rules and the lifted deny patterns the scan used, so an agent reads
// exactly the files the code map lists. A missing code map, manifest or snapshot is RST-1203.

export interface FileScanResultsOptions {
  readonly writer: OutputWriter;
  readonly manifests: RunManifestStore;
  /** The read-only repository tree of a snapshot folder name (`<data>/sources/<key>/files`). */
  readonly snapshotRoot: (snapshotKey: string) => string;
  readonly logger: Logger;
  /** RF-155: the folders of the rendered workbooks a snapshot lists (none when unset). */
  readonly workbookFolders?: (snapshotKey: string) => Promise<readonly string[]>;
}

function missing(detail: string): RosettaError {
  return new RosettaError(ERROR_CODES.codeMapMissing, `The scan has no ${detail}.`);
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * The ignore rules and file size limit the scan ran with: those recorded when it was accepted, so
 * an agent reads and searches only files the scan could read (RF-144, RF-146).
 */
function scanLimitsOf(manifest: RunManifest): { ignoreRules: string; maxFileBytes?: number } {
  const recorded = scanSettingsSchema.safeParse(manifest.options['scanSettings']);
  if (!recorded.success) return { ignoreRules: '' };
  const { ignoreRules, maxFileBytes } = recorded.data;
  return { ignoreRules, maxFileBytes };
}

export class FileScanResults implements ScanResults {
  private readonly options: FileScanResultsOptions;

  constructor(options: FileScanResultsOptions) {
    this.options = options;
  }

  // RF-200, RF-126
  async open(scan: Run): Promise<ScannedSource> {
    const { commitSha, snapshotKey } = scan;
    // An upload has a snapshot and no commit (RF-130).
    if (snapshotKey === null) throw missing('snapshot');
    const manifest = await this.options.manifests.read(scopeOf(scan));
    const snapshotHash = manifest?.source.snapshotHash ?? null;
    if (manifest === undefined || snapshotHash === null) throw missing('manifest');
    const { codeMap, codeMapHash } = await this.codeMapOf(scan, manifest);
    const reader = await NodeRepositoryReader.open({
      root: this.options.snapshotRoot(snapshotKey),
      subpath: manifest.source.subpath,
      ...scanLimitsOf(manifest),
      allowDenied: manifest.security.allowDenied,
      logger: this.options.logger,
    }).catch((error: unknown) => {
      throw new RosettaError(ERROR_CODES.codeMapMissing, 'The snapshot of the scan is gone.', {
        cause: error,
      });
    });
    const source = { commitSha, snapshotKey, snapshotHash };
    const workbookFolders = await this.options.workbookFolders?.(snapshotKey);
    const listed =
      workbookFolders === undefined || workbookFolders.length === 0 ? {} : { workbookFolders };
    return { codeMap, codeMapHash, reader, source, ...listed };
  }

  private async codeMapOf(
    scan: Run,
    manifest: RunManifest,
  ): Promise<{ codeMap: CodeMap; codeMapHash: string }> {
    const path = `${runPath(scan.projectId, scan.runKey)}/codemap.json`;
    const read = await this.options.writer.readText({ userId: scan.userId, path });
    if (!read.ok) throw missing('code map');
    const codeMapHash = sha256(read.value);
    const parsed = parseCodeMap(read.value);
    if (codeMapHash !== manifest.codemapHash || !parsed.ok) {
      throw new RosettaError(
        ERROR_CODES.codeMapInvalid,
        'The code map of the scan does not match its manifest.',
      );
    }
    return { codeMap: parsed.value, codeMapHash };
  }
}
