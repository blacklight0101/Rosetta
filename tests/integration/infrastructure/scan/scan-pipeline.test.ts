import { access, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { OutputWriter } from '../../../../src/application/ports/output-writer.js';
import type { ScanRequest } from '../../../../src/application/ports/scan-pipeline.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { err } from '../../../../src/domain/errors/result.js';
import { NodeOutputWriter } from '../../../../src/infrastructure/files/node-output-writer.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { LanguagePackRegistry } from '../../../../src/infrastructure/scan/packs/pack-registry.js';
import { SnapshotScanPipeline } from '../../../../src/infrastructure/scan/scan-pipeline.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { MemoryLogger } from '../../../support/memory-logger.js';
import { templateSettings } from '../../../support/project-fixtures.js';
import { fixtureRoot } from '../../../support/scan-harness.js';
import { useTempRoot } from '../../../support/temp-root.js';

// RF-124, RNF-002: the scan pipeline on the C# fixture: a missing subpath fails, and a scan that
// stops or fails while writing leaves neither output file behind.

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

function pipelineOver(wrap: (writer: NodeOutputWriter) => OutputWriter): SnapshotScanPipeline {
  const masker = new SecretMasker();
  const logger = new MemoryLogger(new FixedClock('2026-10-12T10:00:00.000Z'), masker);
  return new SnapshotScanPipeline({
    writer: wrap(new NodeOutputWriter({ dataDir: temp.path, logger })),
    masker,
    logger,
    packs: new LanguagePackRegistry([]),
  });
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
