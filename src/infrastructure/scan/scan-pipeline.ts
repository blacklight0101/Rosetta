import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Logger } from '../../application/ports/logger.js';
import type { OutputWriter } from '../../application/ports/output-writer.js';
import type {
  ScanPipeline,
  ScanReport,
  ScanRequest,
} from '../../application/ports/scan-pipeline.js';
import type { RunScope } from '../../application/ports/run-events.js';
import type { WorkbookSplit } from '../../domain/code-map/folder-buckets.js';
import { isWorkbookSource, type CodeMap } from '../../domain/code-map/code-map.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { NodeRepositoryReader } from '../files/node-repository-reader.js';
import { runPath } from '../files/workspace-paths.js';
import type { TextMasker } from '../guards/secret-masker.js';
import { buildCodeMap } from './codemap/build-code-map.js';
import { writeScanOutputs } from './codemap/write-scan-outputs.js';
import type { LanguagePackRegistry } from './packs/pack-registry.js';
import { analyseWithPacks, type PackScan } from './packs/pack-scan.js';
import type { ParseBudget } from './packs/parse-budget.js';
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
  /** The scan-wide parse budget of the language packs (P1-75); the default when absent. */
  readonly parseBudget?: ParseBudget;
}

/** The code map and the number of files the packs left coarse because the parse budget was spent. */
interface Mapped {
  readonly codeMap: CodeMap;
  readonly overParseBudget: number;
}

function overParseBudget(packScan: PackScan): number {
  return packScan.warnings.filter((warning) => warning.code === ERROR_CODES.parseBudgetReached)
    .length;
}

function mapLevels(map: CodeMap): ScanReport['mapLevels'] {
  const symbols = map.files.filter((file) => file.mapLevel === 'symbols').length;
  return { coarse: map.files.length - symbols, symbols };
}

const OUTPUT_FILES = ['codemap.json', 'scan-summary.md'] as const;

/** RF-124: a subpath that is not a folder of the snapshot is an error, not an empty code map. */
async function requireSubpath(root: string, subpath: string): Promise<void> {
  if (subpath === '') return;
  const found = await stat(join(root, ...subpath.split('/'))).catch(() => undefined);
  if (found?.isDirectory() !== true) {
    throw new RosettaError(
      ERROR_CODES.fileNotFound,
      `The subpath ${subpath} is not in the snapshot.`,
    );
  }
}

/** The `values.md` line that says a rendered sheet holds no cell (render-values.ts). */
const EMPTY_SHEET_LINE = '- Non-empty cells: 0';
const VALUES_HEADER_LINES = 12;

/**
 * P3-109: the sheet folders of a rendered workbook tree whose `values.md` says the sheet holds no
 * cell; such a sheet gets no area of its own.
 */
async function workbookSplit(
  reader: NodeRepositoryReader,
  files: readonly { readonly path: string }[],
): Promise<WorkbookSplit> {
  const emptyFolders: string[] = [];
  for (const { path } of files) {
    const parts = path.split('/');
    if (parts.length !== 3 || parts[2] !== 'values.md') continue;
    const read = await reader.readLines({
      path,
      startLine: 1,
      endLine: VALUES_HEADER_LINES,
    });
    if (read.ok && read.value.lines.includes(EMPTY_SHEET_LINE)) {
      emptyFolders.push(parts.slice(0, 2).join('/'));
    }
  }
  return { emptyFolders };
}

export class SnapshotScanPipeline implements ScanPipeline {
  private readonly options: SnapshotScanPipelineOptions;

  constructor(options: SnapshotScanPipelineOptions) {
    this.options = options;
  }

  // RF-100, RF-105
  async scan(request: ScanRequest): Promise<ScanReport> {
    const began = Date.now();
    const mapped = await this.map(request);
    const { codeMap } = mapped;
    request.signal.throwIfAborted();
    const codeMapHash = await this.write(request, mapped, Date.now() - began);
    return {
      codeMapHash,
      files: codeMap.files.length,
      areas: codeMap.areas.length,
      mapLevels: mapLevels(codeMap),
    };
  }

  // RNF-002: a file that cannot be removed is logged with its path (and the refusal code) and the
  // other files are still removed; the error text is not logged, so no secret can reach the log.
  async discard(scope: RunScope): Promise<void> {
    const folder = runPath(scope.projectId, scope.runKey);
    for (const name of OUTPUT_FILES) {
      const path = `${folder}/${name}`;
      const removed = await this.options.writer
        .remove({ userId: scope.userId, path })
        .catch(() => undefined);
      if (removed?.ok !== true) {
        await this.options.logger.log({
          level: 'warn',
          logger: 'scan',
          message: 'An output file of a discarded scan could not be removed.',
          ...(removed === undefined ? {} : { code: removed.error.code }),
          runId: scope.id,
          data: { path },
        });
      }
    }
  }

  /** Writes both files; a refusal, a failure or a stop in between leaves neither of them. */
  private async write(request: ScanRequest, mapped: Mapped, durationMs: number): Promise<string> {
    const { scope, signal } = request;
    try {
      const written = await writeScanOutputs(
        this.options.writer,
        { userId: scope.userId, folder: runPath(scope.projectId, scope.runKey) },
        { ...mapped, durationMs, masker: this.options.masker },
      );
      if (!written.ok) throw new RosettaError(written.error.code, written.error.message);
      signal.throwIfAborted();
      return written.value.codeMapHash;
    } catch (error) {
      await this.discard(scope);
      throw error;
    }
  }

  private async map(request: ScanRequest): Promise<Mapped> {
    const { settings, source, signal } = request;
    const { logger, packs, masker, parseBudget } = this.options;
    const reader = await NodeRepositoryReader.open({
      root: request.root,
      subpath: source.subpath,
      ignoreRules: settings.ignoreRules,
      allowDenied: settings.allowDenied,
      logger,
      maxFileBytes: settings.maxFileBytes,
    });
    await requireSubpath(request.root, source.subpath);
    signal.throwIfAborted();
    const scan = await scanRepository(reader, { maxFileBytes: settings.maxFileBytes, masker });
    signal.throwIfAborted();
    const packScan = await analyseWithPacks({
      files: scan.files,
      reader,
      registry: packs,
      logger,
      maxFileBytes: settings.maxFileBytes,
      ...(parseBudget === undefined ? {} : { parseBudget }),
    });
    signal.throwIfAborted();
    const built = buildCodeMap({
      source,
      scan,
      packs: packScan,
      areaTokenBudget: settings.areaTokenBudget,
      configuredAreas: settings.areas ?? [],
      masker,
      ...(isWorkbookSource(source) ? { workbook: await workbookSplit(reader, scan.files) } : {}),
    });
    if (!built.ok) {
      throw new RosettaError(
        ERROR_CODES.codeMapInvalid,
        `The scan could not build a valid code map (${built.error}).`,
      );
    }
    return { codeMap: built.value, overParseBudget: overParseBudget(packScan) };
  }
}
