import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isResumable } from '../../../web/src/lib/live-run/resumable.js';
import { applyEvent, initialRunState } from '../../../web/src/lib/live-run/reduce-run.js';
import { phaseOf } from '../../../web/src/lib/live-run/run-phase.js';
import { HistoryPage } from '../../../web/src/pages/HistoryPage.js';
import { failure, json, renderPage, type Answer } from './fake-api.js';
import { capKey, doneKey, history, liveKey, scanKey } from './history-fixtures.js';
import { runEnded, ev, runKey, startedData } from './live-run-fixtures.js';
import { renderLive, runPath, runRow, runUuid } from './live-run-helpers.js';

// RF-006, RF-304, design-system.md section 14: the Resume button of the run page and of the history
// page. It shows for an understand run that stopped at a cap, failed or was interrupted; it asks
// the server to queue the run again, and the page then follows the same run from its start.

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.pushState({}, '', '/');
});

const resumed = json(202, {
  id: runUuid,
  runId: runKey,
  stage: 'understand',
  queueState: 'Running',
});
const endedRow = (endState: string, stage = 'understand') =>
  runRow({ queueState: 'Ended', endState, stage });

describe('isResumable', () => {
  it.each([
    ['understand', 'CapReached', true],
    ['understand', 'Failed', true],
    ['understand', 'Interrupted', true],
    ['understand', 'Completed', false],
    ['scan', 'Failed', false],
    ['scan', 'CapReached', false],
  ])('RF-006 %s ended %s: %s', (stage, endState, expected) => {
    expect(isResumable(stage, endState)).toBe(expected);
  });
});

describe('the run page after a run ended', () => {
  it.each(['CapReached', 'Failed', 'Interrupted'])(
    'RF-006 offers Resume for an understand run that ended %s',
    async (endState) => {
      renderLive({ [`GET ${runPath}`]: endedRow(endState) });

      expect(await screen.findByRole('button', { name: 'Resume run' })).toBeTruthy();
    },
  );

  it('RF-006 says to raise the cap first when the run stopped at its cap', async () => {
    renderLive({ [`GET ${runPath}`]: endedRow('CapReached') });

    await screen.findByRole('button', { name: 'Resume run' });

    expect(screen.getByTestId('resume-note').textContent).toContain('Raise the cap');
  });
});

describe('the run page, no Resume', () => {
  it.each([
    ['a run that completed', endedRow('Completed')],
    ['a scan that failed', endedRow('Failed', 'scan')],
    ['a run still running', runRow({ queueState: 'Running' })],
    ['a run still queued', runRow({ queueState: 'Queued' })],
  ])('RF-006 offers no Resume for %s', async (_name, row) => {
    renderLive({ [`GET ${runPath}`]: row });

    await screen.findByTestId('run-status');

    expect(screen.queryByRole('button', { name: 'Resume run' })).toBeNull();
  });
});

describe('the run page, pressing Resume', () => {
  it('RF-006 asks the server to resume the run with its id and follows it from its start', async () => {
    // The server answers the run as ended until the Resume was asked, and as running after it.
    let asked = false;
    const { stream, calls } = renderLive({
      [`GET ${runPath}`]: () => (asked ? runRow() : endedRow('CapReached')),
      [`POST ${runPath}/resume`]: () => {
        asked = true;
        return resumed;
      },
    });
    await stream.connection();

    fireEvent.click(await screen.findByRole('button', { name: 'Resume run' }));

    await waitFor(() => {
      expect(calls.at(-1)).toMatchObject({
        ...{ method: 'POST', path: `${runPath}/resume` },
        csrf: 'csrf-0',
      });
    });
    const second = await stream.connection();
    second.event(ev(1, 'run.started', startedData));
    await waitFor(() => {
      expect(screen.getByTestId('run-status').textContent).toContain('Running');
    });
    expect(screen.queryByRole('button', { name: 'Resume run' })).toBeNull();
  });

  it('RF-006 shows the code of a refused Resume and keeps the button', async () => {
    renderLive({
      [`GET ${runPath}`]: endedRow('CapReached'),
      [`POST ${runPath}/resume`]: failure(409, 'RST-2307'),
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Resume run' }));

    expect((await screen.findByTestId('error-banner')).textContent).toContain('RST-2307');
    expect(screen.getByRole('button', { name: 'Resume run' })).toBeTruthy();
  });
});

describe('the events of a resumed run', () => {
  it('RF-006 a second run.started after run.ended puts the page back to running', () => {
    const afterEnd = [ev(1, 'run.started', startedData), runEnded(2, 'CapReached')].reduce(
      applyEvent,
      initialRunState(),
    );
    expect(phaseOf(runRow0(), afterEnd)).toEqual({ kind: 'ended', endState: 'CapReached' });

    const again = applyEvent(afterEnd, ev(3, 'run.started', startedData));

    expect(again.ended).toBeUndefined();
    expect(phaseOf(runRow0(), again)).toEqual({ kind: 'running' });
  });
});

function runRow0() {
  return {
    ...{ id: runUuid, projectId: 'p-1', runId: runKey, stage: 'understand' },
    ...{ queueState: 'Running' as const, endState: null, commitSha: null, startedAt: null },
    ...{ position: null, reportBuilt: false, failedAreas: 0, unreadAreas: 0 },
    totals: { costMicros: 0, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
  };
}

function renderHistory(answers: Readonly<Record<string, Answer>> = {}) {
  return renderPage(
    <HistoryPage />,
    { 'GET /api/projects/p-1/history': json(200, history), ...answers },
    undefined,
    { projectId: 'p-1' },
  );
}

async function rowOf(key: string): Promise<HTMLElement> {
  const [cell] = await screen.findAllByText(key);
  const row = cell?.closest('tr') ?? null;
  if (row === null) throw new Error(`No row for ${key}.`);
  return row;
}

describe('the history page', () => {
  it('RF-006 offers Resume on the understand run that stopped at its cap and on no other row', async () => {
    renderHistory();

    const capped = within(await rowOf(capKey));
    expect(capped.getByRole('button', { name: `Resume run ${capKey}` })).toBeTruthy();
    for (const key of [doneKey, scanKey, liveKey]) {
      expect(within(await rowOf(key)).queryByRole('button', { name: /^Resume run/u })).toBeNull();
    }
  });

  it('RF-006 resumes the run and opens its page', async () => {
    const { calls } = renderHistory({
      'POST /api/runs/r-2/resume': json(202, {
        ...{ id: 'r-2', runId: capKey, stage: 'understand' },
        ...{ queueState: 'Running', position: null },
      }),
    });

    fireEvent.click(
      within(await rowOf(capKey)).getByRole('button', { name: `Resume run ${capKey}` }),
    );

    await waitFor(() => {
      expect(calls.at(-1)).toMatchObject({ method: 'POST', path: '/api/runs/r-2/resume' });
      expect(window.location.pathname).toBe('/runs/r-2');
    });
  });

  it('RF-006 shows the code of a refused Resume and stays on the page', async () => {
    renderHistory({ 'POST /api/runs/r-2/resume': failure(409, 'RST-2307') });

    fireEvent.click(
      within(await rowOf(capKey)).getByRole('button', { name: `Resume run ${capKey}` }),
    );

    expect((await screen.findByTestId('error-banner-code')).textContent).toBe('RST-2307');
    expect(window.location.pathname).not.toBe('/runs/r-2');
  });
});
