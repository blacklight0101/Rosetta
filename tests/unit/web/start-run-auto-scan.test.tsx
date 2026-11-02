import { fireEvent, screen, waitFor } from '@testing-library/preact';
import { afterEach, expect, it } from 'vitest';
import { failure, json, type Answer } from './fake-api.js';
import { projectOf } from './project-fixtures.js';
import { estimatePath, noCodeMap, projectPath, runAnswer, runsPath } from './start-run-fixtures.js';
import { renderStart } from './start-run-helpers.js';

// RF-160, RF-1001, ADR-027: adding a source starts the free scan by itself. The page offers no
// "scan only" choice; while the scan runs it says so, when it ends the areas and the estimate
// appear, and one that did not finish says so and offers Scan again.

afterEach(() => {
  window.history.pushState({}, '', '/');
});

const historyPath = `${projectPath}/history`;
const journeyPath = `${projectPath}/journey`;

const scanRun = (queueState: string, endState: string | null, position: number | null = null) => ({
  ...{ id: 'r-9', runId: '20261012-100000-scan', stage: 'scan', queueState, endState },
  ...{ commitSha: null, queuedAt: '2026-10-12T10:00:00.000Z', startedAt: null, endedAt: null },
  totals: { costMicros: 0, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
  ...{ sizeBytes: 0, failedAreas: 0, unreadAreas: 0, position },
});

const historyOf = (...runs: readonly object[]): Answer =>
  json(200, {
    project: {
      ...{ id: 'p-1', name: 'octo/demo', sourceUrl: 'https://github.com/octo/demo', ref: '' },
      ...{ subpath: '', folder: 'projects/p-1', sizeBytes: 0 },
    },
    runs,
  });

const unscanned: Record<string, Answer> = {
  [`GET ${estimatePath}`]: noCodeMap,
  [`GET ${journeyPath}`]: json(200, {
    ...{ source: null, scanRunId: null, briefSaved: false, plan: null, handoff: null },
  }),
};

const posts = (calls: readonly { readonly method: string; readonly path: string }[]) =>
  calls.filter((call) => call.method === 'POST' && call.path === runsPath);

it('RF-160 a project with a source and no scan starts the scan by itself and stays on the page', async () => {
  const { calls } = renderStart({
    ...unscanned,
    [`GET ${historyPath}`]: historyOf(),
    [`POST ${runsPath}`]: runAnswer('scan', null),
  });

  await waitFor(() => {
    expect(posts(calls)).toHaveLength(1);
  });
  expect(screen.getByTestId('scan-running')).not.toBeNull();
  expect(posts(calls)[0]).toMatchObject({ body: { stage: 'scan' } });
  expect(window.location.pathname).toBe('/');
  expect(screen.queryByLabelText('Scan only')).toBeNull();
  expect(screen.queryByRole('button', { name: /^Analyse/u })).toBeNull();
});

it('RF-160 a scan already waiting in the queue is not started again and says its place', async () => {
  const { calls } = renderStart({
    ...unscanned,
    [`GET ${historyPath}`]: historyOf(scanRun('Queued', null, 2)),
  });

  await waitFor(() => {
    expect(screen.getByTestId('scan-running').textContent).toContain('position 2');
  });
  expect(posts(calls)).toHaveLength(0);
});

it('RF-160 a scan that did not finish shows Scan again and no Analyse button', async () => {
  renderStart({
    ...unscanned,
    [`GET ${historyPath}`]: historyOf(scanRun('Ended', 'Failed')),
  });

  await screen.findByRole('button', { name: 'Scan again' });

  expect(screen.getByText(/did not finish/u)).not.toBeNull();
  expect(screen.queryByRole('button', { name: /^Analyse/u })).toBeNull();
});

it('RF-160 Scan again starts a new scan', async () => {
  const { calls } = renderStart({
    ...unscanned,
    [`GET ${historyPath}`]: historyOf(scanRun('Ended', 'Failed')),
    [`POST ${runsPath}`]: runAnswer('scan', 1),
  });

  fireEvent.click(await screen.findByRole('button', { name: 'Scan again' }));

  await waitFor(() => {
    expect(posts(calls)).toHaveLength(1);
  });
});

it('RF-160 a refused scan shows the plain error and offers Scan again', async () => {
  renderStart({
    ...unscanned,
    [`GET ${historyPath}`]: historyOf(),
    [`POST ${runsPath}`]: failure(400, 'RST-1203'),
  });

  expect((await screen.findByTestId('error-banner')).textContent).toContain('RST-1203');
  expect(screen.getByRole('button', { name: 'Scan again' })).not.toBeNull();
  expect(screen.queryByRole('button', { name: /^Analyse/u })).toBeNull();
});

it('RF-160 a project with no source asks for one and starts no scan', async () => {
  const { calls } = renderStart({
    ...unscanned,
    [`GET ${projectPath}`]: json(
      200,
      projectOf('p-1', 'Pricing', { sourceKind: 'upload', sourceUrl: '', source: null }),
    ),
  });

  await screen.findByTestId('scan-needs-source');

  expect(posts(calls)).toHaveLength(0);
});
