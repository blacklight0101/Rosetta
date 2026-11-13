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
  unreadAreas: 0,
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
  expect(phaseOf(row('Queued', null), stateAfter())).toEqual({ kind: 'queued', position: null });
});

// RF-006 (P8-84): a resumed run that waits in the queue again has only the events of its earlier
// start; the row was queued after that start, so the page says Queued, not Running or the old end.
const requeued = (queuedAt: string): RunRow => ({ ...row('Queued', null), queuedAt });

it('RF-006 a resumed run queued after its earlier start is queued until its next run.started', () => {
  const earlier = stateAfter(ev(1, 'run.started', startedData));
  const restarted = stateAfter(
    ev(1, 'run.started', startedData),
    ev(3, 'run.started', startedData),
  );

  expect(phaseOf(requeued('2026-10-12T10:00:02.000Z'), earlier)).toEqual({
    kind: 'queued',
    position: null,
  });
  expect(phaseOf(requeued('2026-10-12T10:00:02.000Z'), restarted)).toEqual({ kind: 'running' });
});

it('RF-006 RF-432 the pause of the earlier life does not show while the resumed run is queued', () => {
  const paused = stateAfter(
    ev(1, 'run.started', startedData),
    ev(2, 'run.awaitingApproval', { continueAmount: 1 }),
  );

  expect(phaseOf(requeued('2026-10-12T10:00:05.000Z'), paused).kind).toBe('queued');
  expect(phaseOf(row('AwaitingApproval', null), paused).kind).toBe('awaiting');
});

// RF-1108, EV-106: a queued run behind the user's own running run carries that run to the page.
it('RF-1108 EV-106 a queued run carries the run it waits for into its phase', () => {
  const waitsFor = {
    id: '2f0c4b1e-0000-4000-8000-000000000009',
    runId: '20261109-100000-understand',
  };
  const queued: RunRow = { ...row('Queued', null), position: 2, waitsFor };

  expect(phaseOf(queued, stateAfter())).toEqual({ kind: 'queued', position: 2, waitsFor });
});

it('RF-1108 EV-106 a queued run that waits for no run carries no holder into its phase', () => {
  const queued: RunRow = { ...row('Queued', null), position: 2, waitsFor: null };

  expect(phaseOf(queued, stateAfter())).toEqual({ kind: 'queued', position: 2, waitsFor: null });
});
