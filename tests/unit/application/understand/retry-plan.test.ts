import { describe, expect, it } from 'vitest';
import type { TaskResult, TaskResults } from '../../../../src/application/ports/task-results.js';
import type { ReaderTask } from '../../../../src/application/understand/reader-tasks.js';
import {
  planRetry,
  scheduleTasks,
  type RetryDependencies,
} from '../../../../src/application/understand/retry-plan.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import type { Area } from '../../../../src/domain/code-map/area.js';
import type { ManifestAgentTask } from '../../../../src/domain/runs/run-manifest.js';
import type { Run } from '../../../../src/domain/runs/run.js';
import { cardOf, claimOf } from '../../../support/deepen-fixtures.js';
import { sampleManifest, sampleRun } from '../../../support/run-fixtures.js';

// RF-208, RF-006, Q-43: what a run that retries the failed areas of another run schedules: the tasks
// of the areas that gave no usable card (or were never read) with the task id of their failed task or
// the next number, the results of every other task held as they were, and the refusals.

const area = (name: string): Area => ({
  ...{ name, files: [], estimatedTokens: 1 },
  ...{ mapLevel: 'coarse', origin: 'folder' },
});
const areas = ['Catalog', 'Models', 'Services', 'Setup'].map(area);
const hash = 'sha256:aaa';
const scanned = { codeMapHash: hash, codeMap: { areas } } as const;
const taskOf = (name: string, agentTaskId = 'reader-001'): ReaderTask => ({
  agentTaskId,
  area: area(name),
});

function resultOf(agentTaskId: string, name: string, failure?: string): TaskResult {
  const cards =
    failure === undefined ? [cardOf(name, [claimOf('BR-001.c1', 'Supported', [])])] : [];
  const coverage = { area: name, files: [], tokens: 1, readTokens: 0, readTokenShare: 0 };
  return {
    ...{ agentTaskId, area: name, state: failure === undefined ? 'Done' : 'InvalidOutput' },
    ...{ turns: 1, withoutCards: false, cards },
    coverage: failure === undefined ? coverage : { ...coverage, failure },
  };
}

/** Task results by run id; writes are not needed. */
class FakeResults implements TaskResults {
  private readonly byRun: Readonly<Record<string, readonly TaskResult[]>>;
  constructor(byRun: Readonly<Record<string, readonly TaskResult[]>>) {
    this.byRun = byRun;
  }
  read(scope: { readonly id: string }): Promise<readonly TaskResult[]> {
    return Promise.resolve(this.byRun[scope.id] ?? []);
  }
  write(): Promise<void> {
    return Promise.resolve();
  }
  readConsolidation(): Promise<{ types: []; merges: [] }> {
    return Promise.resolve({ types: [], merges: [] });
  }
  writeConsolidation(): Promise<void> {
    return Promise.resolve();
  }
}

const parent: Run = sampleRun({ stage: 'understand', queueState: 'Ended', endState: 'Completed' });
const child: Run = sampleRun({
  ...{ stage: 'understand', userId: parent.userId, projectId: parent.projectId },
  queueState: 'Running',
});

function world(parentResults: readonly TaskResult[], own: readonly TaskResult[] = []) {
  const deps: RetryDependencies = {
    runs: { find: (_user, id) => Promise.resolve(id === parent.id ? parent : undefined) },
    manifests: { read: () => Promise.resolve(sampleManifest({ codemapHash: hash })) },
    taskResults: new FakeResults({ [parent.id]: parentResults, [child.id]: own }),
  };
  const execution = (agentTasks: readonly ManifestAgentTask[] = []) => ({
    run: child,
    manifest: sampleManifest({ stage: 'understand', agentTasks: [...agentTasks] }),
  });
  return { deps, execution };
}

const first = [
  resultOf('reader-001', 'Catalog'),
  resultOf('reader-002', 'Models', 'invalid output (RST-1300)'),
  resultOf('reader-003', 'Services'),
];

describe('planRetry: the tasks', () => {
  it('RF-208 reads again the failed area with its task id and holds every other result', async () => {
    const { deps, execution } = world(first);

    const planned = await planRetry(deps, execution(), {
      parentRunId: parent.id,
      tasks: [taskOf('Catalog'), taskOf('Models', 'reader-002')],
      scanned,
    });

    if (!planned.ok) throw new Error(planned.error);
    expect(planned.value.plan.tasks.map((t) => [t.agentTaskId, t.area.name])).toEqual([
      ['reader-002', 'Models'],
    ]);
    expect(planned.value.plan.kept.map((r) => r.agentTaskId)).toEqual(['reader-001', 'reader-003']);
    expect(planned.value.allTasks.map((t) => [t.agentTaskId, t.area.name])).toEqual([
      ['reader-001', 'Catalog'],
      ['reader-002', 'Models'],
      ['reader-003', 'Services'],
    ]);
    expect(planned.value.link).toEqual({
      ...{ parentRunId: parent.id, parentRunKey: parent.runKey, areas: 1 },
      seeded: {
        ...{ cards: 2, claims: 2, supported: 2 },
        ...{ rejected: 0, citationInvalid: 0, notJudged: 0 },
      },
    });
  });

  it('RF-208 gives an area the run never read the next task number, in area order', async () => {
    const { deps, execution } = world(first);

    const planned = await planRetry(deps, execution(), {
      parentRunId: parent.id,
      tasks: [taskOf('Models'), taskOf('Setup', 'reader-002')],
      scanned,
    });

    if (!planned.ok) throw new Error(planned.error);
    expect(planned.value.plan.tasks.map((t) => [t.agentTaskId, t.area.name])).toEqual([
      ['reader-002', 'Models'],
      ['reader-004', 'Setup'],
    ]);
    expect(planned.value.allTasks.map((t) => t.area.name)).toEqual([
      ...['Catalog', 'Models', 'Services', 'Setup'],
    ]);
  });
});

describe('planRetry: an area the run read well', () => {
  it('RF-208 holds an area the run read well even when the request names it', async () => {
    const { deps, execution } = world(first);

    const planned = await planRetry(deps, execution(), {
      parentRunId: parent.id,
      tasks: [taskOf('Catalog'), taskOf('Services', 'reader-002')],
      scanned,
    });

    if (!planned.ok) throw new Error(planned.error);
    expect(planned.value.plan.tasks).toEqual([]);
    expect(planned.value.plan.kept.map((r) => r.agentTaskId)).toEqual([
      ...['reader-001', 'reader-002', 'reader-003'],
    ]);
    expect(planned.value.link.areas).toBe(0);
  });
});

describe('planRetry: the results it holds', () => {
  it('RF-208 leaves out the task of an area the code map no longer has', async () => {
    const { deps, execution } = world([...first, resultOf('reader-009', 'Gone')]);

    const planned = await planRetry(deps, execution(), {
      ...{ parentRunId: parent.id, tasks: [taskOf('Models', 'reader-002')], scanned },
    });

    if (!planned.ok) throw new Error(planned.error);
    expect(planned.value.allTasks.map((t) => t.area.name)).toEqual([
      ...['Catalog', 'Models', 'Services'],
    ]);
  });

  it('RF-209 puts the tasks of one area in task order, as a Deepen leaves several', async () => {
    const { deps, execution } = world([
      ...[resultOf('reader-005', 'Catalog', 'invalid output (RST-1300)')],
      ...[resultOf('reader-001', 'Catalog')],
    ]);

    const planned = await planRetry(deps, execution(), {
      ...{ parentRunId: parent.id, tasks: [taskOf('Catalog')], scanned },
    });

    if (!planned.ok) throw new Error(planned.error);
    expect(planned.value.allTasks.map((t) => t.agentTaskId)).toEqual(['reader-001', 'reader-005']);
    expect(planned.value.plan.tasks.map((t) => t.agentTaskId)).toEqual(['reader-005']);
  });
});

describe('planRetry: a resumed retry', () => {
  it('RF-006 keeps the retried task it finished and runs the one it did not', async () => {
    const parentResults = [...first, resultOf('reader-004', 'Setup', 'invalid output (RST-1300)')];
    const finished = resultOf('reader-002', 'Models');
    const { deps, execution } = world(parentResults, [finished]);
    const listed = (id: string, name: string, state: string): ManifestAgentTask => ({
      ...{ agentTaskId: id, area: name, role: 'reader', state },
      ...{ turns: 1, cards: 0 },
    });

    const planned = await planRetry(
      deps,
      execution([listed('reader-002', 'Models', 'Done'), listed('reader-004', 'Setup', 'Running')]),
      {
        parentRunId: parent.id,
        tasks: [taskOf('Models'), taskOf('Setup', 'reader-002')],
        scanned,
      },
    );

    if (!planned.ok) throw new Error(planned.error);
    expect(planned.value.plan.tasks.map((t) => t.agentTaskId)).toEqual(['reader-004']);
    expect(planned.value.plan.kept.map((r) => r.agentTaskId)).toEqual([
      ...['reader-001', 'reader-003', 'reader-002'],
    ]);
  });
});

describe('planRetry: what it refuses', () => {
  const input = { parentRunId: parent.id, tasks: [taskOf('Models')], scanned };

  it('RF-208 refuses a run that is not found or belongs to another project', async () => {
    const { deps, execution } = world(first);
    const elsewhere = {
      ...deps,
      runs: { find: () => Promise.resolve({ ...parent, projectId: 'x' }) },
    };

    expect(await planRetry(deps, execution(), { ...input, parentRunId: 'gone' })).toEqual({
      ok: false,
      error: ERROR_CODES.notFound,
    });
    expect(await planRetry(elsewhere, execution(), input)).toEqual({
      ok: false,
      error: ERROR_CODES.notFound,
    });
  });

  it('RF-006 refuses a code map that is not the one the run it retries read', async () => {
    const { deps, execution } = world(first);

    const planned = await planRetry(deps, execution(), {
      ...input,
      scanned: { ...scanned, codeMapHash: 'sha256:bbb' },
    });

    expect(planned).toEqual({ ok: false, error: ERROR_CODES.resumeSourceChanged });
  });

  it('RF-006 refuses a run whose task results cannot be read', async () => {
    const { deps, execution } = world([]);

    expect(await planRetry(deps, execution(), input)).toEqual({
      ok: false,
      error: ERROR_CODES.taskResultsUnreadable,
    });
  });
});

describe('scheduleTasks', () => {
  it('RF-208 leaves the tasks of a run that retries nothing as planned, all of them run', async () => {
    const { deps, execution } = world(first);
    const tasks = [taskOf('Catalog'), taskOf('Models', 'reader-002')];

    const scheduled = await scheduleTasks(deps, execution(), {
      ...{ tasks, scanned },
      options: { cloudConsent: false },
    });

    if (!scheduled.ok) throw new Error(scheduled.error);
    expect(scheduled.value.plan).toEqual({ tasks, kept: [] });
    expect(scheduled.value.allTasks).toEqual(tasks);
    expect(scheduled.value.link).toBeUndefined();
  });

  it('RF-208 takes the plan of a run that retries another from that run', async () => {
    const { deps, execution } = world(first);

    const scheduled = await scheduleTasks(deps, execution(), {
      ...{ tasks: [taskOf('Models')], scanned },
      options: { cloudConsent: false, retryOf: parent.id },
    });

    if (!scheduled.ok) throw new Error(scheduled.error);
    expect(scheduled.value.plan.kept).toHaveLength(2);
    expect(scheduled.value.link?.parentRunKey).toBe(parent.runKey);
  });
});
