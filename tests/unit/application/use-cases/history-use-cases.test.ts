import { describe, expect, it } from 'vitest';
import { ListHistory } from '../../../../src/application/use-cases/list-history.js';
import { ListSnapshots } from '../../../../src/application/use-cases/list-snapshots.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import type { Run } from '../../../../src/domain/runs/run.js';
import { MemoryProjectRepository } from '../../../../src/infrastructure/db/memory-project-repository.js';
import { MemoryRunIndex } from '../../../../src/infrastructure/db/memory-run-index.js';
import { MemorySnapshotCache } from '../../../support/memory-snapshot-cache.js';
import { MemoryWorkspaceFolders } from '../../../support/memory-workspace-folders.js';
import { sampleProject } from '../../../support/project-fixtures.js';
import { runningRun, sampleRun } from '../../../support/run-fixtures.js';
import { userAmy, userBob } from '../../../support/run-harness.js';
import { sampleCachedSnapshot, snapshotSha } from '../../../support/snapshot-listing-fixtures.js';

// RF-1008, RF-1012, RF-1105: the history of a project and the administrator's snapshot list.

const admin = { userId: '00000000-0000-4000-9000-0000000000ad', role: 'admin' } as const;

async function historySetup() {
  const projects = new MemoryProjectRepository();
  const runs = new MemoryRunIndex();
  const folders = new MemoryWorkspaceFolders();
  const project = sampleProject({ userId: userAmy.userId });
  await projects.insertOrFind(project);
  const ended = (overrides: Partial<Run>): Run =>
    sampleRun({
      userId: userAmy.userId,
      projectId: project.id,
      queueState: 'Ended',
      endState: 'Completed',
      startedAt: 1,
      endedAt: 2,
      ...overrides,
    });
  const listHistory = new ListHistory({ projects, runs, folders });
  return { runs, folders, project, ended, listHistory };
}

describe('ListHistory: the queue', () => {
  it('RF-1108 EV-80 gives a queued run its place in the server queue and every other run none', async () => {
    const { runs, project, ended, listHistory } = await historySetup();
    const ahead = sampleRun({ queueState: 'Queued', queuedAt: 1_000, userId: userBob.userId });
    const mine = sampleRun({
      ...{ userId: userAmy.userId, projectId: project.id, queueState: 'Queued', queuedAt: 2_000 },
    });
    const done = ended({ queuedAt: 500 });
    for (const run of [ahead, mine, done]) await runs.insert(run);

    const result = await listHistory.execute({
      actor: { userId: userAmy.userId, role: 'user' },
      projectId: project.id,
    });

    expect(result.ok && result.value.runs.map((each) => each.position)).toEqual([2, null]);
  });
});

describe('ListHistory', () => {
  it('RF-1008 lists the runs of the project newest first, each with the size of its folder', async () => {
    const { runs, folders, project, ended, listHistory } = await historySetup();
    const older = ended({ queuedAt: 1_000, commitSha: snapshotSha });
    const newer = ended({ queuedAt: 2_000 });
    await runs.insert(older);
    await runs.insert(newer);
    const target = { userId: userAmy.userId, projectId: project.id };
    folders.seed({ ...target, runKey: older.runKey }, { 'manifest.json': '12345' });
    folders.seed(
      { ...target, runKey: newer.runKey },
      { 'manifest.json': '123', 'spec.md': '1234' },
    );

    const result = await listHistory.execute({ actor: userAmy, projectId: project.id });

    if (!result.ok) throw new Error('The history was not listed');
    expect(result.value.project.id).toBe(project.id);
    expect(result.value.runs.map(({ run, sizeBytes }) => [run.id, sizeBytes])).toEqual([
      [newer.id, 7],
      [older.id, 5],
    ]);
    expect(result.value.sizeBytes).toBe(12);
  });

  it('RF-1008 lists a run that is still running with the other runs', async () => {
    const { runs, project, listHistory } = await historySetup();
    await runs.insert(runningRun({ userId: userAmy.userId, projectId: project.id }));

    const result = await listHistory.execute({ actor: userAmy, projectId: project.id });

    if (!result.ok) throw new Error('The history was not listed');
    expect(result.value.runs.map(({ run }) => run.queueState)).toEqual(['Running']);
  });

  it("RF-1105 answers not found for another user's project and for an unknown id", async () => {
    const { project, listHistory } = await historySetup();

    const other = await listHistory.execute({ actor: userBob, projectId: project.id });
    const unknown = await listHistory.execute({ actor: userAmy, projectId: 'not-a-uuid' });

    expect(other).toEqual({ ok: false, error: ERROR_CODES.notFound });
    expect(unknown).toEqual(other);
  });
});

describe('ListSnapshots', () => {
  function snapshotSetup() {
    const snapshots = new MemorySnapshotCache();
    const runs = new MemoryRunIndex();
    return { snapshots, runs, listSnapshots: new ListSnapshots({ snapshots, runs }) };
  }

  it('RF-1012 lists each snapshot with the runs that use it, those still running and the last use', async () => {
    const { snapshots, runs, listSnapshots } = snapshotSetup();
    const used = sampleCachedSnapshot();
    const unused = sampleCachedSnapshot({
      key: `octo__other@${'b'.repeat(40)}`,
      repository: 'octo/other',
      commitSha: 'b'.repeat(40),
    });
    snapshots.add(used);
    snapshots.add(unused);
    const done = { snapshotKey: used.key, queueState: 'Ended', endState: 'Completed' } as const;
    await runs.insert(sampleRun({ ...done, queuedAt: 5, startedAt: 10, endedAt: 500 }));
    await runs.insert(sampleRun({ ...done, queuedAt: 15, startedAt: 20, endedAt: 900 }));
    await runs.insert(runningRun({ snapshotKey: used.key, queuedAt: 600, startedAt: 700 }));

    const result = await listSnapshots.execute({ actor: admin });

    if (!result.ok) throw new Error('The snapshots were not listed');
    expect(result.value).toEqual([
      { snapshot: used, runs: 3, activeRuns: 1, lastUsedAt: 900 },
      { snapshot: unused, runs: 0, activeRuns: 0, lastUsedAt: null },
    ]);
  });

  it('RF-1012 refuses a user who is not the administrator', async () => {
    const { snapshots, listSnapshots } = snapshotSetup();
    snapshots.add(sampleCachedSnapshot());

    const result = await listSnapshots.execute({ actor: userAmy });

    expect(result).toEqual({ ok: false, error: ERROR_CODES.notAllowed });
  });
});
