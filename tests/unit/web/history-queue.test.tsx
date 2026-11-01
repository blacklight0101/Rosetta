import { screen, within } from '@testing-library/preact';
import { afterEach, expect, it } from 'vitest';
import { HistoryPage } from '../../../web/src/pages/HistoryPage.js';
import { json, renderPage } from './fake-api.js';
import { history } from './history-fixtures.js';

// RF-1108, EV-80: the history shows the place of a queued run and the runs ahead of it.

afterEach(() => {
  window.history.pushState({}, '', '/');
});

it('RF-1108 EV-80 a queued run in the history shows its place and the runs ahead', async () => {
  const queued = {
    ...{ id: 'r-5', runId: '20261011-091300-plan', stage: 'plan', queueState: 'Queued' },
    ...{ endState: null, commitSha: null, queuedAt: '2026-10-11T09:13:00.000Z' },
    ...{ startedAt: null, endedAt: null, sizeBytes: 0, position: 3 },
    totals: { costMicros: 0, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
  };
  renderPage(
    <HistoryPage />,
    { 'GET /api/projects/p-1/history': json(200, { ...history, runs: [queued, ...history.runs] }) },
    undefined,
    { projectId: 'p-1' },
  );

  const [cell] = await screen.findAllByText('20261011-091300-plan');
  const row = cell?.closest('tr') ?? null;

  expect(row).not.toBeNull();
  expect(within(row as HTMLElement).getByText('position 3, 2 runs ahead')).not.toBeNull();
});
