import type { Logger } from '../../application/ports/logger.js';
import type { OutputWriter } from '../../application/ports/output-writer.js';
import type {
  ScanPipeline,
  ScanReport,
  ScanRequest,
} from '../../application/ports/scan-pipeline.js';
import type { CodeMap } from '../../domain/code-map/code-map.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { NodeRepositoryReader } from '../files/node-repository-reader.js';
import { runPath } from '../files/workspace-paths.js';
import type { TextMasker } from '../guards/secret-masker.js';
import { buildCodeMap } from './codemap/build-code-map.js';
import { writeScanOutputs } from './codemap/write-scan-outputs.js';
import type { LanguagePackRegistry } from './packs/pack-registry.js';
import { analyseWithPacks } from './packs/pack-scan.js';
import { scanRepository } from './universal/universal-scan.js';

// RF-100, RF-104, RF-105, RF-141, ADR-004: the scan of one snapshot. It reads the snapshot only
// through the RepositoryReader (ignore rules and deny list applied), runs the universal scan and the
// language packs, builds and masks the code map and writes `codemap.json` and `scan-summary.md`
// through the OutputWriter into the run folder. The signal is checked between the steps.

export interface SnapshotScanPipelineOptions {
  readonly writer: OutputWriter;
  readonly masker: TextMasker;
  readonly logger: Logger;
  readonly packs: LanguagePackRegistry;
}

function mapLevels(map: CodeMap): ScanReport['mapLevels'] {
  const symbols = map.files.filter((file) => file.mapLevel === 'symbols').length;
  return { coarse: map.files.length - symbols, symbols };
}

export class SnapshotScanPipeline implements ScanPipeline {
  private readonly options: SnapshotScanPipelineOptions;

  constructor(options: SnapshotScanPipelineOptions) {
    this.options = options;
  }

  // RF-100, RF-105
  async scan(request: ScanRequest): Promise<ScanReport> {
    const began = Date.now();
    const codeMap = await this.map(request);
    request.signal.throwIfAborted();
    const { scope } = request;
    const written = await writeScanOutputs(
      this.options.writer,
      { userId: scope.userId, folder: runPath(scope.projectId, scope.runKey) },
      { codeMap, durationMs: Date.now() - began, masker: this.options.masker },
    );
    if (!written.ok) throw new RosettaError(written.error.code, written.error.message);
    return {
      codeMapHash: written.value.codeMapHash,
      files: codeMap.files.length,
      areas: codeMap.areas.length,
      mapLevels: mapLevels(codeMap),
    };
  }

  private async map(request: ScanRequest): Promise<CodeMap> {
    const { settings, source, signal } = request;
    const { logger, packs, masker } = this.options;
    const reader = await NodeRepositoryReader.open({
      root: request.root,
      subpath: source.subpath,
      ignoreRules: settings.ignoreRules,
      allowDenied: settings.allowDenied,
      logger,
    });
    signal.throwIfAborted();
    const scan = await scanRepository(reader, { maxFileBytes: settings.maxFileBytes });
    signal.throwIfAborted();
    const packScan = await analyseWithPacks({
      files: scan.files,
      reader,
      registry: packs,
      logger,
      maxFileBytes: settings.maxFileBytes,
    });
    signal.throwIfAborted();
    const built = buildCodeMap({
      source,
      scan,
      packs: packScan,
      areaTokenBudget: settings.areaTokenBudget,
      configuredAreas: settings.areas ?? [],
      masker,
    });
    if (!built.ok) {
      throw new RosettaError(
        ERROR_CODES.codeMapInvalid,
        `The scan could not build a valid code map (${built.error}).`,
      );
    }
    return built.value;
  }
}
