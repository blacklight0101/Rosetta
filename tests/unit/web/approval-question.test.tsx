import { fireEvent, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyEvent, initialRunState } from '../../../web/src/lib/live-run/reduce-run.js';
import { phaseOf } from '../../../web/src/lib/live-run/run-phase.js';
import { json } from './fake-api.js';
import { ev, runKey, startedData } from './live-run-fixtures.js';
import { renderLive, runPath, runRow, runUuid } from './live-run-helpers.js';

// RF-432, ADR-026, design-system.md section 14: a run that paused near the amount its owner
// approved shows "Waiting for your approval" and asks Continue (+N) or Stop here; Continue posts to
// /continue, Stop here to /stop. A later `run.started` (the run continued) clears the question.

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.pushState({}, '', '/');
});

const pausedRow = () => runRow({ queueState: 'AwaitingApproval', stage: 'understand' });
const awaiting = (seq: number) =>
  ev(seq, 'run.awaitingApproval', { continueAmount: { tokens: 1_300_000, costMicros: 600_000 } });
const answered = json(202, {
  id: runUuid,
  runId: runKey,
  stage: 'understand',
  queueState: 'Queued',
});

describe('the phase of a paused run', () => {
  it('RF-432 is awaiting with the N to offer, until the run starts again', () => {
    const paused = [ev(1, 'run.started', startedData), awaiting(2)].reduce(
      applyEvent,
      initialRunState(),
    );

    expect(phaseOf(pausedRow(), paused)).toEqual({
      kind: 'awaiting',
      continueAmount: { tokens: 1_300_000, costMicros: 600_000 },
    });
    const again = applyEvent(paused, ev(3, 'run.started', startedData));
    expect(phaseOf(runRow(), again)).toEqual({ kind: 'running' });
  });
});

describe('the question on the run page', () => {
  it('RF-432 shows the badge and asks Continue (+N); Continue posts to /continue', async () => {
    const { stream, calls } = renderLive({
      [`GET ${runPath}`]: pausedRow(),
      [`POST ${runPath}/continue`]: answered,
    });
    const connection = await stream.connection();
    connection.event(ev(1, 'run.started', startedData));
    connection.event(awaiting(2));

    const button = await screen.findByRole('button', { name: 'Continue (+$0.60)' });
    expect(screen.getByTestId('run-status').textContent).toContain('Waiting for your approval');
    expect(screen.queryByRole('button', { name: 'Stop run' })).toBeNull();
    fireEvent.click(button);

    await waitFor(() => {
      expect(calls.at(-1)).toMatchObject({ method: 'POST', path: `${runPath}/continue` });
    });
  });

  it('RF-432 Stop here posts to /stop', async () => {
    const { calls } = renderLive({
      [`GET ${runPath}`]: pausedRow(),
      [`POST ${runPath}/stop`]: json(200, { id: runUuid, stopRequested: false }),
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Stop here' }));

    await waitFor(() => {
      expect(calls.at(-1)).toMatchObject({ method: 'POST', path: `${runPath}/stop` });
    });
  });
});
