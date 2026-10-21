import { describe, expect, it } from 'vitest';
import { ManifestUpdates } from '../../../../src/application/runs/manifest-updates.js';
import { overviewStep } from '../../../../src/application/understand/overview-step.js';
import type { ReaderTask } from '../../../../src/application/understand/reader-tasks.js';
import { RunCoverage } from '../../../../src/application/understand/run-coverage.js';
import type { Area } from '../../../../src/domain/code-map/area.js';
import { MemoryRunManifestStore } from '../../../../src/infrastructure/files/memory-run-manifest-store.js';
import { RecordingLogger } from '../../../support/recording-logger.js';
import { answer, Answers } from '../../../support/overview-step-harness.js';
import { scopeFor } from '../../../support/run-event-fixtures.js';
import { sampleRun } from '../../../support/run-fixtures.js';
import { SequenceIdGenerator } from '../../../support/sequence-id-generator.js';

// RF-231 (Q-49), RF-264: the overview of a run over a workbook project counts the areas the run
// planned: a root that holds no workbook file is no area of the project, so "What was not covered"
// never names it and the counts do not include it.

const area = (name: string, files: string[]): Area => ({
  ...{ name, files, estimatedTokens: 10, mapLevel: 'coarse', origin: 'folder' },
});
const loan = area('Loan.xlsx', ['Loan.xlsx/workbook.md']);
const root = area('(root)', ['dependencies.md']);
const rates = area('Rates.xlsx', ['Rates.xlsx/workbook.md']);
const workbookKey = `workbook__${'0'.repeat(8)}-0000-0000-0000-${'0'.repeat(12)}@${'a'.repeat(16)}`;

async function overviewOf(snapshotKey: string, folders: readonly string[] = ['Loan.xlsx']) {
  const provider = new Answers(() => answer('{}'));
  const task: ReaderTask = { agentTaskId: 'reader-001', area: loan };
  const run = sampleRun({ stage: 'understand' });
  const parts = {
    ...{ logger: new RecordingLogger(), ids: new SequenceIdGenerator() },
    ...{ traceId: 'a'.repeat(32), nextCallId: () => 'c#1' },
    summariser: {
      ...{ provider, name: 'fake', kind: 'fake' as const, model: 'm', maxOutputTokens: 900 },
      keySource: 'user',
    },
    updates: new ManifestUpdates(new MemoryRunManifestStore(), scopeFor()),
    execution: { run, signal: new AbortController().signal },
    overviewPrompt: { name: 'summariser/overview.v1.md', version: 'v1', sha256: 'ab', text: 'x' },
    scanned: {
      codeMap: { areas: [loan, root, rates] },
      source: { snapshotKey },
      workbookFolders: folders,
    },
    allTasks: [task],
  } as const;
  const coverage = new RunCoverage([task]);
  return overviewStep(parts, [], { coverage, thirdParty: new Set() });
}

describe('the overview of a run over a workbook project', () => {
  it('RF-231 names no (root) area in what was not covered and counts one area', async () => {
    const overview = await overviewOf(workbookKey);

    expect(overview.notCovered.join('\n')).not.toContain('(root)');
    expect(overview.notice).toContain('No card from 1 area passed the citation check.');
  });

  it('RF-231 lists the (root) area with dependencies.md when the project has two workbooks', async () => {
    const overview = await overviewOf(workbookKey, ['Loan.xlsx', 'Rates.xlsx']);

    expect(overview.notCovered.join('\n')).toContain('(root)');
  });

  it('RF-231 a zip keeps its root area in the list', async () => {
    const overview = await overviewOf('upload__x@aaaaaaaaaaaaaaaa');

    expect(overview.notCovered.join('\n')).toContain('(root)');
  });
});
