import { expect, it } from 'vitest';
import { phaseOf } from '../../../web/src/lib/live-run/run-phase.js';
import type { RunRow } from '../../../web/src/api/run-schemas.js';
import { overviewOf } from '../../../web/src/lib/live-run/run-summary.js';
import { stepperOf } from '../../../web/src/lib/live-run/run-stepper.js';
import { agentEnded, ev, planned, runEnded, startedData, stateAfter } from './live-run-fixtures.js';

// RF-1002 (P9-04, EV-104): a reader the user stopped is `Stopped`, never counted as failed.

const row: RunRow = {
  id: 'run-1',
  projectId: 'p-1',
  runId: 'r',
  stage: 'understand',
  queueState: 'Running',
  endState: null,
  commitSha: null,
  startedAt: null,
  position: null,
  totals: { costMicros: 0, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
  reportBuilt: false,
  failedAreas: 0,
  unreadAreas: 0,
};

const started = ev(1, 'run.started', { ...startedData, stage: 'understand' });

function understandDetail(...events: Parameters<typeof stateAfter>): string | undefined {
  const state = stateAfter(...events);
  const steps = stepperOf(row, state, phaseOf(row, state));
  return steps.find((step) => step.name === 'Understand')?.detail;
}

it('RF-1002 a reader a Stop cut short reads stopped, not failed', () => {
  const events = [
    started,
    planned(2, 'a1', 'Catalog'),
    planned(3, 'a2', 'Orders'),
    agentEnded(4, 'a1', 'Done', 1),
    agentEnded(5, 'a2', 'Stopped'),
    runEnded(6, 'Interrupted'),
  ];

  expect(understandDetail(...events)).toBe('1 of 2 agents done, 1 stopped');
  expect(overviewOf(stateAfter(...events))).toMatchObject({ done: 1, failed: 0, stopped: 1 });
});

it('RF-1002 a reader that really failed still counts as failed beside a stopped one', () => {
  const events = [
    started,
    planned(2, 'a1', 'Catalog'),
    planned(3, 'a2', 'Orders'),
    agentEnded(4, 'a1', 'Failed'),
    agentEnded(5, 'a2', 'Stopped'),
    runEnded(6, 'Interrupted'),
  ];

  expect(understandDetail(...events)).toBe('0 of 2 agents done, 1 failed, 1 stopped');
});

it('RF-1002 a stopped reader read again under another task in a resume shows no failure', () => {
  const events = [
    started,
    planned(2, 'a1', 'Catalog'),
    planned(3, 'a2', 'Orders'),
    agentEnded(4, 'a1', 'Done', 1),
    agentEnded(5, 'a2', 'Stopped'),
    runEnded(6, 'Interrupted'),
    ev(7, 'run.started', { ...startedData, stage: 'understand' }),
    planned(8, 'a3', 'Orders'),
    agentEnded(9, 'a3', 'Done', 1),
    runEnded(10, 'Completed'),
  ];

  const overview = overviewOf(stateAfter(...events));

  expect(understandDetail(...events)).toBe('2 of 2 agents done');
  expect(overview).toMatchObject({ done: 2, failed: 0, stopped: 0 });
});
