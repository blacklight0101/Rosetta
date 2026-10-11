import { join } from 'node:path';
import type { CodeMap } from '../../src/domain/code-map/code-map.js';
import { NodeOutputWriter } from '../../src/infrastructure/files/node-output-writer.js';
import { SecretMasker } from '../../src/infrastructure/guards/secret-masker.js';
import {
  buildCodeMap,
  type BuildCodeMapInput,
} from '../../src/infrastructure/scan/codemap/build-code-map.js';
import { writeScanOutputs } from '../../src/infrastructure/scan/codemap/write-scan-outputs.js';
import { CSharpPack } from '../../src/infrastructure/scan/packs/csharp/csharp-pack.js';
import { LanguagePackRegistry } from '../../src/infrastructure/scan/packs/pack-registry.js';
import { analyseWithPacks } from '../../src/infrastructure/scan/packs/pack-scan.js';
import { FixedClock } from './fixed-clock.js';
import { MemoryLogger } from './memory-logger.js';
import { scanTree } from './scan-harness.js';
import { timedAsync } from './stopwatch.js';

export const testUserId = '0b7c3f8e-5d1a-4c2b-9e6f-1a2b3c4d5e6f';
const maxFileBytes = 1_000_000;

export interface ScanToOutputsOptions {
  /** The folder of the output files inside the user's workspace, for example `runs/r1`. */
  readonly runFolder: string;
  readonly dataDir: string;
  readonly areaTokenBudget?: number;
  readonly configuredAreas?: BuildCodeMapInput['configuredAreas'];
  readonly withCSharpPack?: boolean;
}

export interface ScanToOutputsResult {
  readonly codeMap: CodeMap;
  readonly codeMapHash: string;
  readonly durationMs: number;
  /** Where the files landed on disk. */
  readonly codeMapPath: string;
  readonly summaryPath: string;
}

/** Scan, language packs, code map and writers over a folder on disk: what RunScan will do (P1-23). */
export async function scanToOutputs(
  root: string,
  options: ScanToOutputsOptions,
): Promise<ScanToOutputsResult> {
  const masker = new SecretMasker();
  const logger = new MemoryLogger(new FixedClock('2026-10-11T09:00:00.000Z'), masker);
  const packs = options.withCSharpPack === false ? [] : [await CSharpPack.create()];
  const timed = await timedAsync(async () => {
    const { scan, reader } = await scanTree(root);
    const packScan = await analyseWithPacks({
      files: scan.files,
      reader,
      registry: new LanguagePackRegistry(packs),
      logger,
      maxFileBytes,
    });
    const built = buildCodeMap({
      source: { owner: 'octo', repo: 'demo', commitSha: 'c'.repeat(40), subpath: '' },
      scan,
      packs: packScan,
      areaTokenBudget: options.areaTokenBudget ?? 60_000,
      configuredAreas: options.configuredAreas ?? [],
      masker,
    });
    if (!built.ok) throw new Error(`code map failed: ${built.error}`);
    return built.value;
  });
  const writer = new NodeOutputWriter({ dataDir: options.dataDir, logger });
  const written = await writeScanOutputs(
    writer,
    { userId: testUserId, folder: options.runFolder },
    { codeMap: timed.result, durationMs: Math.round(timed.ms), masker },
  );
  if (!written.ok) throw new Error(`write failed: ${written.error.message}`);
  const workspace = join(options.dataDir, 'users', testUserId, ...options.runFolder.split('/'));
  return {
    codeMap: timed.result,
    codeMapHash: written.value.codeMapHash,
    durationMs: timed.ms,
    codeMapPath: join(workspace, 'codemap.json'),
    summaryPath: join(workspace, 'scan-summary.md'),
  };
}
