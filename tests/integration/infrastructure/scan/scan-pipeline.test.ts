import { access, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { OutputWriter } from '../../../../src/application/ports/output-writer.js';
import type { ScanRequest } from '../../../../src/application/ports/scan-pipeline.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { err } from '../../../../src/domain/errors/result.js';
import { NodeOutputWriter } from '../../../../src/infrastructure/files/node-output-writer.js';
import { runPath } from '../../../../src/infrastructure/files/workspace-paths.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { CSharpPack } from '../../../../src/infrastructure/scan/packs/csharp/csharp-pack.js';
import { LanguagePackRegistry } from '../../../../src/infrastructure/scan/packs/pack-registry.js';
import { SnapshotScanPipeline } from '../../../../src/infrastructure/scan/scan-pipeline.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { MemoryLogger } from '../../../support/memory-logger.js';
import { templateSettings } from '../../../support/project-fixtures.js';
import { fixtureRoot } from '../../../support/scan-harness.js';
import { useTempRoot } from '../../../support/temp-root.js';

// RF-124, RNF-002: the scan pipeline on the C# fixture: a missing subpath fails, a scan that stops or
// fails while writing leaves neither output file behind, and a file discard cannot remove is logged.

const temp = useTempRoot('rosetta-pipeline-');
const userId = '0b7c3f8e-5d1a-4c2b-9e6f-1a2b3c4d5e6f';
const projectId = '00000000-0000-4000-a000-000000000001';
const runKey = '20260101-000001-scan';
const folder = (): string =>
  join(temp.path, 'users', userId, 'projects', projectId, 'runs', runKey);

function request(overrides: Partial<ScanRequest['source']>, signal: AbortSignal): ScanRequest {
  return {
    scope: { id: 'run-1', userId, projectId, runKey },
    root: fixtureRoot('webforms-csharp'),
    source: { owner: 'octo', repo: 'demo', commitSha: 'a'.repeat(40), subpath: '', ...overrides },
    settings: templateSettings.scan,
    signal,
  };
}

function pipelineOver(
  wrap: (writer: NodeOutputWriter) => OutputWriter,
  logger = new MemoryLogger(new FixedClock('2026-10-12T10:00:00.000Z'), new SecretMasker()),
): SnapshotScanPipeline {
  const masker = new SecretMasker();
  return new SnapshotScanPipeline({
    writer: wrap(new NodeOutputWriter({ dataDir: temp.path, logger })),
    masker,
    logger,
    packs: new LanguagePackRegistry([]),
  });
}

/** A writer that behaves like the real one, with `remove` replaced. */
function withRemove(writer: NodeOutputWriter, remove: OutputWriter['remove']): OutputWriter {
  return {
    writeText: (file, content) => writer.writeText(file, content),
    appendLine: (file, line) => writer.appendLine(file, line),
    readText: (file) => writer.readText(file),
    remove,
  };
}

/** A writer that behaves like the real one, with `writeText` replaced. */
function withWriteText(
  writer: NodeOutputWriter,
  writeText: OutputWriter['writeText'],
): OutputWriter {
  return {
    writeText,
    appendLine: (file, line) => writer.appendLine(file, line),
    readText: (file) => writer.readText(file),
    remove: (file) => writer.remove(file),
  };
}

async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}

async function outputFiles(): Promise<string[]> {
  return (await exists(folder())) ? (await readdir(folder())).sort() : [];
}

describe('SnapshotScanPipeline subpath and write failures', () => {
  it('RF-124 fails a subpath that is not in the snapshot with RST-1104 and writes nothing', async () => {
    const pipeline = pipelineOver((writer) => writer);

    const scanning = pipeline.scan(
      request({ subpath: 'NoSuchFolder' }, new AbortController().signal),
    );

    await expect(scanning).rejects.toMatchObject({ code: ERROR_CODES.fileNotFound });
    expect(await outputFiles()).toEqual([]);
  });

  it('RNF-002 removes codemap.json when the summary cannot be written', async () => {
    const refused = err({
      code: ERROR_CODES.writeOutsideWorkspace,
      reason: 'outside-workspace' as const,
      message: 'refused',
    });
    const pipeline = pipelineOver((writer) =>
      withWriteText(writer, (file, content) =>
        file.path.endsWith('.md') ? Promise.resolve(refused) : writer.writeText(file, content),
      ),
    );

    const scanning = pipeline.scan(request({}, new AbortController().signal));

    await expect(scanning).rejects.toMatchObject({ code: ERROR_CODES.writeOutsideWorkspace });
    expect(await outputFiles()).toEqual([]);
  });
});

describe('SnapshotScanPipeline stops and discard', () => {
  it('RNF-002 removes both files when the run is stopped between the two writes', async () => {
    const controller = new AbortController();
    const pipeline = pipelineOver((writer) =>
      withWriteText(writer, async (file, content) => {
        const written = await writer.writeText(file, content);
        if (file.path.endsWith('codemap.json')) controller.abort();
        return written;
      }),
    );

    await expect(pipeline.scan(request({}, controller.signal))).rejects.toThrow();

    expect(await outputFiles()).toEqual([]);
  });

  it('RNF-002 discard removes the output files of a run and is harmless when there are none', async () => {
    const pipeline = pipelineOver((writer) => writer);
    const { scope } = request({}, new AbortController().signal);
    await pipeline.scan(request({}, new AbortController().signal));
    expect(await outputFiles()).toEqual(['codemap.json', 'scan-summary.md']);

    await pipeline.discard(scope);
    await pipeline.discard(scope);

    expect(await outputFiles()).toEqual([]);
  });
});

const secret = 'sk-test-0000000000000000000000000000';
const scope = request({}, new AbortController().signal).scope;
const outputPath = (name: string): string => `${runPath(projectId, runKey)}/${name}`;

/** A pipeline whose writer fails to remove `codemap.json` as `fail` says and records the rest. */
function failingCodeMapRemoval(fail: () => ReturnType<OutputWriter['remove']>): {
  readonly pipeline: SnapshotScanPipeline;
  readonly logger: MemoryLogger;
  readonly removed: string[];
} {
  const logger = new MemoryLogger(new FixedClock('2026-10-12T10:00:00.000Z'), new SecretMasker());
  const removed: string[] = [];
  const pipeline = pipelineOver(
    (writer) =>
      withRemove(writer, (file) => {
        if (file.path.endsWith('codemap.json')) return fail();
        removed.push(file.path);
        return writer.remove(file);
      }),
    logger,
  );
  return { pipeline, logger, removed };
}

describe('SnapshotScanPipeline discard failures', () => {
  it('RNF-002 logs one warning with the path and code when an output file removal is refused', async () => {
    const refused = err({
      code: ERROR_CODES.writeOutsideWorkspace,
      reason: 'outside-workspace' as const,
      message: `refused ${secret}`,
    });
    const { pipeline, logger } = failingCodeMapRemoval(() => Promise.resolve(refused));

    await pipeline.discard(scope);

    const warnings = logger.entries.filter((entry) => entry.level === 'warn');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({
      logger: 'scan',
      code: ERROR_CODES.writeOutsideWorkspace,
      data: { path: outputPath('codemap.json') },
    });
    expect(logger.text()).not.toContain(secret);
  });

  it('RNF-002 logs one warning with the path when removing an output file throws, and goes on', async () => {
    const { pipeline, logger, removed } = failingCodeMapRemoval(() =>
      Promise.reject(new Error(`EACCES ${secret}`)),
    );

    await expect(pipeline.discard(scope)).resolves.toBeUndefined();

    const warnings = logger.entries.filter((entry) => entry.level === 'warn');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({
      logger: 'scan',
      data: { path: outputPath('codemap.json') },
    });
    expect(warnings[0]?.code).toBeUndefined();
    expect(removed).toEqual([outputPath('scan-summary.md')]);
    expect(logger.text()).not.toContain(secret);
  });
});

/** A pipeline with the C# pack and a scan-wide parse budget of `totalMs` on a clock that stands still. */
async function budgetedPipeline(totalMs: number): Promise<SnapshotScanPipeline> {
  const logger = new MemoryLogger(new FixedClock('2026-10-12T10:00:00.000Z'), new SecretMasker());
  return new SnapshotScanPipeline({
    writer: new NodeOutputWriter({ dataDir: temp.path, logger }),
    masker: new SecretMasker(),
    logger,
    packs: new LanguagePackRegistry([await CSharpPack.create()]),
    parseBudget: { totalMs, now: () => 0 },
  });
}

describe('SnapshotScanPipeline parse budget', () => {
  it('RF-110 finishes a scan past its parse budget with the remaining files not analysed', async () => {
    const roomy = await (await budgetedPipeline(1)).scan(request({}, new AbortController().signal));
    expect(roomy.mapLevels.symbols).toBeGreaterThan(0);

    const report = await (
      await budgetedPipeline(0)
    ).scan(request({}, new AbortController().signal));

    expect(report.mapLevels).toEqual({ coarse: roomy.files, symbols: 0 });
    const summary = await readFile(join(folder(), 'scan-summary.md'), 'utf8');
    expect(summary).toContain(`not analysed: parse budget reached`);
    expect(summary).toContain(`${String(roomy.mapLevels.symbols)} not analysed`);
  });
});
