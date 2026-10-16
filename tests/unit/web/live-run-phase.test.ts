import { expect, it } from 'vitest';
import type { RunRow } from '../../../web/src/api/run-schemas.js';
import { phaseOf } from '../../../web/src/lib/live-run/run-phase.js';
import { ev, runEnded, startedData, stateAfter } from './live-run-fixtures.js';

// RF-1108, RF-1015 (P1-169): where a run is. A run the run row says has ended is ended while its
// events replay, so the page opens in the after-run mode and never flashes the running one.

const row = (queueState: RunRow['queueState'], endState: string | null): RunRow => ({
  id: '2f0c4b1e-0000-4000-8000-000000000001',
  projectId: 'p-1',
  runId: '20261012-100000-understand',
  stage: 'understand',
  queueState,
  endState,
  position: null,
  queuedAt: '2026-10-12T09:59:00.000Z',
  startedAt: '2026-10-12T10:00:00.000Z',
  endedAt: null,
  commitSha: null,
  totals: { costMicros: 0, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
  reportBuilt: false,
  failedAreas: 0,
});

it('RF-1015 an ended run stays ended while its events replay and after they are all in', () => {
  const replaying = stateAfter(ev(1, 'run.started', startedData));
  const replayed = stateAfter(ev(1, 'run.started', startedData), runEnded(2, 'Failed'));

  expect(phaseOf(row('Ended', 'Completed'), replaying)).toEqual({
    kind: 'ended',
    endState: 'Completed',
  });
  expect(phaseOf(row('Ended', 'Completed'), replayed)).toEqual({
    kind: 'ended',
    endState: 'Failed',
  });
});

it('RF-1108 a run the row calls running is running once its events start and ended once they end', () => {
  const started = stateAfter(ev(1, 'run.started', startedData));
  const ended = stateAfter(ev(1, 'run.started', startedData), runEnded(2, 'Completed'));

  expect(phaseOf(row('Running', null), started)).toEqual({ kind: 'running' });
  expect(phaseOf(row('Running', null), ended)).toEqual({ kind: 'ended', endState: 'Completed' });
  expect(phaseOf(row('Queued', null), stateAfter())).toEqual({ kind: 'queued' });
});
