import { describe, expect, it } from 'vitest';
import { phaseOf } from '../../../web/src/lib/live-run/run-phase.js';
import type { RunRow } from '../../../web/src/api/run-schemas.js';
import { stepperOf } from '../../../web/src/lib/live-run/run-stepper.js';
import { ev, runEnded, startedData, stateAfter } from './live-run-fixtures.js';

// RF-1015 (Q-44), RF-627: the stepper of a plan run shows the plan steps (brief, planner calls,
// package, checks), never the understand steps; a package written with gaps (RST-1806) has its
// package done and its checks stopped.

function row(queueState: RunRow['queueState']): RunRow {
  return {
    id: 'run-1',
    projectId: 'p-1',
    runId: 'r',
    stage: 'plan',
    queueState,
    endState: null,
    commitSha: null,
    startedAt: null,
    position: null,
    totals: { costMicros: 0, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
    reportBuilt: false,
    failedAreas: 0,
  };
}

const started = ev(1, 'run.started', { ...startedData, stage: 'plan' });

function words(
  events: readonly ReturnType<typeof ev>[],
  queueState: RunRow['queueState'] = 'Running',
): string[] {
  const state = stateAfter(...events);
  const run = row(queueState);
  const steps = stepperOf(run, state, phaseOf(run, state));
  return steps.map((step) => `${step.name}:${step.status}`);
}

describe('RF-1015 the stepper of a plan run', () => {
  it('RF-1015 shows the plan steps while the planner works', () => {
    expect(words([started])).toEqual([
      'Brief:done',
      'Planner calls:current',
      'Package:waiting',
      'Checks:waiting',
    ]);
  });

  it('RF-1015 shows every plan step waiting while the run is queued', () => {
    expect(words([], 'Queued')).toEqual([
      'Brief:waiting',
      'Planner calls:waiting',
      'Package:waiting',
      'Checks:waiting',
    ]);
  });

  it('RF-1015 shows every plan step done for a package written without gaps', () => {
    expect(words([started, runEnded(2, 'Completed')])).toEqual([
      'Brief:done',
      'Planner calls:done',
      'Package:done',
      'Checks:done',
    ]);
  });
});
describe('RF-1015 the stepper of a plan run (2)', () => {
  it('RF-627 shows the package done and the checks stopped for a run that ended RST-1806', () => {
    expect(words([started, runEnded(2, 'Failed', 'RST-1806')])).toEqual([
      'Brief:done',
      'Planner calls:done',
      'Package:done',
      'Checks:stopped',
    ]);
  });

  it('RF-1015 stops at the planner calls when the planner failed before a package', () => {
    expect(words([started, runEnded(2, 'Failed', 'RST-1803')])).toEqual([
      'Brief:done',
      'Planner calls:stopped',
      'Package:waiting',
      'Checks:waiting',
    ]);
  });

  it('RF-1015 never shows the understand steps for a plan run', () => {
    const names = words([started, runEnded(2, 'Failed', 'RST-1803')]).join(' ');

    for (const name of ['Snapshot', 'Scan', 'Understand', 'Verify', 'Report']) {
      expect(names).not.toContain(name);
    }
  });
});
