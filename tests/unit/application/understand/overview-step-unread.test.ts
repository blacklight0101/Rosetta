import { describe, expect, it } from 'vitest';
import { ManifestUpdates } from '../../../../src/application/runs/manifest-updates.js';
import { overviewStep } from '../../../../src/application/understand/overview-step.js';
import type { ReaderTask } from '../../../../src/application/understand/reader-tasks.js';
import { RunCoverage, TaskReads } from '../../../../src/application/understand/run-coverage.js';
import type { Area } from '../../../../src/domain/code-map/area.js';
import type { FileEntry } from '../../../../src/domain/code-map/file-entry.js';
import { MemoryRunManifestStore } from '../../../../src/infrastructure/files/memory-run-manifest-store.js';
import { RecordingLogger } from '../../../support/recording-logger.js';
import { answer, Answers } from '../../../support/overview-step-harness.js';
import { scopeFor } from '../../../support/run-event-fixtures.js';
import { sampleRun } from '../../../support/run-fixtures.js';
import { SequenceIdGenerator } from '../../../support/sequence-id-generator.js';

// RF-264 (Q-53), RF-231: the overview step turns the coverage the run already measured (the
// first-party files not read) into a line of "What was not covered".

const paths = Array.from({ length: 42 }, (_, index) => `src/File${String(index)}.cs`);
const files: FileEntry[] = paths.map((path, index) => ({
  ...{ path, language: 'csharp', lines: 10, estimatedTokens: index === 0 ? 1000 : 100 },
  artefactKinds: [],
  mapLevel: 'coarse',
}));
const area: Area = {
  ...{ name: 'Shop', files: paths, estimatedTokens: 5100 },
  mapLevel: 'coarse',
  origin: 'folder',
};

async function overviewOf(readPaths: readonly string[], failure?: string) {
  const task: ReaderTask = { agentTaskId: 'reader-001', area };
  const codeMap = { areas: [area], files, symbols: [] };
  const parts = {
    ...{ logger: new RecordingLogger(), ids: new SequenceIdGenerator() },
    ...{ traceId: 'a'.repeat(32), nextCallId: () => 'c#1' },
    summariser: {
      ...{ provider: new Answers(() => answer('{}')), name: 'fake', kind: 'fake' as const },
      ...{ model: 'm', maxOutputTokens: 900, keySource: 'user' as const },
    },
    updates: new ManifestUpdates(new MemoryRunManifestStore(), scopeFor()),
    execution: { run: sampleRun({ stage: 'understand' }), signal: new AbortController().signal },
    overviewPrompt: { name: 'summariser/overview.v1.md', version: 'v1', sha256: 'ab', text: 'x' },
    scanned: { codeMap, source: { snapshotKey: 'upload__x@aaaaaaaaaaaaaaaa' } },
    allTasks: [task],
  } as const;
  const coverage = new RunCoverage([task]);
  const reads = new TaskReads();
  reads.add(readPaths.map((path) => ({ path, startLine: 1, endLine: 10 })));
  coverage.record(task, codeMap, { reads, failure });
  return overviewStep(parts, [], { coverage, thirdParty: new Set() });
}

describe('the overview of a run that left first-party files not read', () => {
  it('RF-264 names the 41 files not read, the share of tokens and the Deepen step', async () => {
    const overview = await overviewOf([paths[1] ?? '']);

    const [line] = overview.notCovered;
    expect(line).toContain(
      'First-party files not read: 41 files, 98% of first-party tokens not read.',
    );
    expect(line).toContain('Largest: src/File0.cs (1,000 tokens)');
    expect(line).toContain('Next step: run a Deepen to read them.');
  });

  it('RF-264 keeps the failed-area sentence and its next step after the files line (P3-76)', async () => {
    const overview = await overviewOf([paths[1] ?? ''], 'the model did not answer');

    expect(overview.notCovered).toHaveLength(2);
    expect(overview.notCovered[1]).toContain('Shop: its reader could not finish');
  });

  it('RF-264 lists nothing when every first-party file was read and the area gave a card', async () => {
    const overview = await overviewOf(paths);

    expect(overview.notCovered.filter((line) => line.startsWith('First-party files'))).toEqual([]);
  });
});
