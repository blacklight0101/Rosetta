import { describe, expect, it } from 'vitest';
import type { TaskResult } from '../../../../src/application/ports/task-results.js';
import { ReadUnderstanding } from '../../../../src/application/use-cases/read-understanding.js';
import type { Area } from '../../../../src/domain/code-map/area.js';
import type { DeepenRecord } from '../../../../src/domain/deepen/deepen-record.js';
import type { Run } from '../../../../src/domain/runs/run.js';
import type { RunManifest } from '../../../../src/domain/runs/run-manifest.js';
import { MemoryRunIndex } from '../../../../src/infrastructure/db/memory-run-index.js';
import {
  cardOf,
  claimOf,
  coverageOf,
  deepenFiles,
  libraryPath,
} from '../../../support/deepen-fixtures.js';
import { completedScan, FixedScans } from '../../../support/estimate-harness.js';
import { sampleManifest, sampleRun } from '../../../support/run-fixtures.js';
import { userAmy, userBob } from '../../../support/run-harness.js';

// RF-231, RF-209, RF-1105: what the run page reads of an ended understand run: its honest measures
// and, for a Deepen, the record of its rounds. Another user's run is as good as unknown.

const areas: readonly Area[] = [
  {
    name: 'src',
    files: ['src/a.cs', 'src/b.cs', 'src/c.cs'],
    estimatedTokens: 450,
    mapLevel: 'coarse',
    origin: 'folder',
  },
];

const result: TaskResult = {
  agentTaskId: 'reader-001',
  area: 'src',
  state: 'Done',
  turns: 3,
  withoutCards: false,
  cards: [
    cardOf('src', [
      claimOf('BR-001.c1', 'Supported', ['src/a.cs']),
      claimOf('BR-001.c2', 'Rejected', ['src/c.cs']),
      claimOf('BR-001.c3', 'Rejected', [libraryPath]),
      claimOf('BR-001.c4', 'Unverified', ['src/a.cs']),
    ]),
  ],
  coverage: coverageOf('src', [
    { path: 'src/a.cs', read: 2 },
    { path: 'src/b.cs', read: 0 },
    { path: 'src/c.cs', read: 2 },
  ]),
};

const record: DeepenRecord = {
  parentRunId: 'parent',
  parentRunKey: '20261001-100000-understand',
  maxRounds: 3,
  coveragePass: true,
  roundsDone: 1,
  stopReason: 'noProgress',
  outOfScope: [],
  rounds: [],
  before: null,
  after: null,
};

interface Setup {
  readonly results?: readonly TaskResult[];
  readonly manifest?: Partial<RunManifest>;
  readonly run?: Partial<Run>;
}

async function setup(options: Setup = {}) {
  const runs = new MemoryRunIndex();
  await runs.insert(completedScan('project', userAmy.userId));
  const understand = sampleRun({
    projectId: 'project',
    userId: userAmy.userId,
    stage: 'understand',
    queueState: 'Ended',
    endState: 'Completed',
    ...options.run,
  });
  await runs.insert(understand);
  const manifest = sampleManifest({ codemapHash: 'a'.repeat(64), ...options.manifest });
  const read = new ReadUnderstanding({
    runs,
    scans: new FixedScans(areas, deepenFiles),
    taskResults: { read: () => Promise.resolve(options.results ?? [result]) },
    manifests: { read: () => Promise.resolve(manifest) },
  });
  return { read, understand };
}

describe('RF-231 reading the understanding of an ended run', () => {
  it('RF-231 gives the measures of the run: first-party only, third-party apart', async () => {
    const { read, understand } = await setup();

    const outcome = await read.execute({ actor: userAmy, runId: understand.id });

    if (!outcome.ok) throw new Error(outcome.error);
    expect(outcome.value.measures).toMatchObject({
      supported: 1,
      rejected: 1,
      notJudged: 1,
      rejectedUnresolved: 1,
      wellCovered: false,
      thirdParty: { claims: 1 },
    });
    expect(outcome.value.measures?.filesNotRead.map((file) => file.path)).toEqual(['src/b.cs']);
    expect(outcome.value.deepen).toBeNull();
  });

  it('RF-209 gives the record of a Deepen run beside its measures', async () => {
    const { read, understand } = await setup({ manifest: { deepen: record } });

    const outcome = await read.execute({ actor: userAmy, runId: understand.id });

    if (!outcome.ok) throw new Error(outcome.error);
    expect(outcome.value.deepen).toEqual(record);
  });

  it('RF-1105 answers as for an unknown run when the run is another user', async () => {
    const { read, understand } = await setup();

    const outcome = await read.execute({ actor: userBob, runId: understand.id });

    expect(outcome).toEqual({ ok: false, error: 'not-found' });
  });
});

describe('RF-231 a run with nothing to measure', () => {
  it.each([
    ['a scan', { stage: 'scan' as const }],
    ['a run that has not ended', { queueState: 'Running' as const, endState: null }],
  ])('RF-231 has no measures for %s', async (_name, run) => {
    const { read, understand } = await setup({ run });

    const outcome = await read.execute({ actor: userAmy, runId: understand.id });

    expect(outcome).toEqual({ ok: true, value: { measures: null, deepen: null } });
  });

  it('RF-231 has no measures when the run left no task results', async () => {
    const { read, understand } = await setup({ results: [] });

    const outcome = await read.execute({ actor: userAmy, runId: understand.id });

    expect(outcome).toEqual({ ok: true, value: { measures: null, deepen: null } });
  });

  it('RF-231 has no measures when the code map is not the one the run read', async () => {
    const { read, understand } = await setup({ manifest: { codemapHash: 'b'.repeat(64) } });

    const outcome = await read.execute({ actor: userAmy, runId: understand.id });

    expect(outcome).toMatchObject({ ok: true, value: { measures: null } });
  });
});
