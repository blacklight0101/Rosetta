import { describe, expect, it } from 'vitest';
import type { TaskResult } from '../../../../src/application/ports/task-results.js';
import type { ReaderTask } from '../../../../src/application/understand/reader-tasks.js';
import { planResume } from '../../../../src/application/understand/resume-plan.js';
import type { ManifestAgentTask } from '../../../../src/domain/runs/run-manifest.js';

// RF-006: which reader tasks a resume runs and which results it keeps. A task is kept only when
// the manifest says it finished and its result is stored: no result, no trust.

function task(n: number, name: string): ReaderTask {
  return {
    agentTaskId: `reader-00${String(n)}`,
    area: { name, files: [], estimatedTokens: 1, mapLevel: 'coarse', origin: 'folder' },
  };
}

function listed(each: ReaderTask, state: string): ManifestAgentTask {
  return {
    agentTaskId: each.agentTaskId,
    area: each.area.name,
    role: 'reader',
    state,
    turns: 1,
    cards: 0,
  };
}

function result(each: ReaderTask, state: TaskResult['state'] = 'Done'): TaskResult {
  return {
    agentTaskId: each.agentTaskId,
    area: each.area.name,
    state,
    turns: 1,
    withoutCards: false,
    cards: [],
    coverage: { area: each.area.name, files: [], tokens: 1, readTokens: 0, readTokenShare: 0 },
  };
}

const one = task(1, 'Catalog');
const two = task(2, 'Orders');
const three = task(3, 'Billing');

describe('planResume', () => {
  it('RF-006 runs the tasks that did not finish and keeps the results of the ones that did', () => {
    const plan = planResume(
      [one, two, three],
      [listed(one, 'Done'), listed(two, 'StoppedByCap'), listed(three, 'Planned')],
      [result(one)],
    );

    expect(plan.tasks.map((each) => each.agentTaskId)).toEqual(['reader-002', 'reader-003']);
    expect(plan.kept.map((each) => each.agentTaskId)).toEqual(['reader-001']);
  });

  it.each(['Failed', 'Running', 'Planned', 'StoppedByCap'])(
    'RF-006 runs a task listed %s again even when a result is stored for it',
    (state) => {
      const plan = planResume([one], [listed(one, state)], [result(one)]);

      expect(plan.tasks).toEqual([one]);
      expect(plan.kept).toEqual([]);
    },
  );

  it.each(['TurnLimitReached', 'InvalidOutput'] as const)(
    'RF-006 keeps a task that ended %s with its result',
    (state) => {
      const plan = planResume([one], [listed(one, state)], [result(one, state)]);

      expect(plan.tasks).toEqual([]);
      expect(plan.kept.map((each) => each.state)).toEqual([state]);
    },
  );
});

describe('planResume, results that cannot be trusted', () => {
  it('RF-006 runs a finished task again when its result is missing', () => {
    const plan = planResume([one], [listed(one, 'Done')], []);

    expect(plan.tasks).toEqual([one]);
  });

  it('RF-006 runs a finished task again when the stored result is for another area', () => {
    const other = { ...result(one), area: 'Somewhere else' };

    const plan = planResume([one], [listed(one, 'Done')], [other]);

    expect(plan.tasks).toEqual([one]);
    expect(plan.kept).toEqual([]);
  });

  it('RF-006 runs a task the manifest never listed', () => {
    const plan = planResume([one, two], [listed(one, 'Done')], [result(one), result(two)]);

    expect(plan.tasks).toEqual([two]);
    expect(plan.kept.map((each) => each.agentTaskId)).toEqual(['reader-001']);
  });
});
