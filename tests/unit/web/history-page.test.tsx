import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { HistoryPage } from '../../../web/src/pages/HistoryPage.js';
import { failure, json, renderPage, type Answer } from './fake-api.js';
import { capKey, doneKey, history, liveKey, scanKey, settledHistory } from './history-fixtures.js';

// RF-1008, RF-1012, RF-1105, P1-40: `/projects/:projectId/history`, the runs of a project with their
// source, commit, stage, state, cost and links to their report and zip, and the deletion of a run or
// of the project behind a confirmation that names the folder and the space it frees.

const historyPath = 'GET /api/projects/p-1/history';

function renderHistory(answers: Readonly<Record<string, Answer>> = {}) {
  return renderPage(<HistoryPage />, { [historyPath]: json(200, history), ...answers }, undefined, {
    projectId: 'p-1',
  });
}

async function rowOf(runKey: string): Promise<HTMLElement> {
  // The run id is shown once and also ends the hidden text of the View run link of the same row.
  const [cell] = await screen.findAllByText(runKey);
  const row = cell?.closest('tr') ?? null;
  if (row === null) throw new Error(`No row for ${runKey}.`);
  return row;
}

afterEach(() => {
  window.history.pushState({}, '', '/');
});

describe('history page rows', () => {
  it('RF-1008 lists each run with its start, stage, short commit, state, tokens and cost', async () => {
    renderHistory();

    const table = await screen.findByRole('table', { name: 'Runs' });

    expect(screen.getByRole('heading', { name: 'History', level: 1 })).not.toBeNull();
    const live = within(await rowOf(liveKey));
    for (const text of ['started 2026-10-11 09:12', 'understand', 'a1b2c3d', 'Running']) {
      expect(live.getByText(text)).not.toBeNull();
    }
    expect(live.getByText('196,102')).not.toBeNull();
    expect(live.getByText('$0.41')).not.toBeNull();
    expect(within(table).getAllByText('Completed')).toHaveLength(2);
    const capped = within(await rowOf(capKey));
    expect(capped.getByText('Cap reached')).not.toBeNull();
    expect(capped.getByText('$2.16')).not.toBeNull();
    expect(capped.getByText('0f1e2d3')).not.toBeNull();
  });

  it('RF-1008 links each run to its run page and its zip', async () => {
    renderHistory();

    const done = within(await rowOf(scanKey));

    expect(done.getByRole('link', { name: `View run ${scanKey}` }).getAttribute('href')).toBe(
      '/runs/r-3',
    );
    const zip = done.getByRole('link', { name: `Zip of run ${scanKey}` });
    expect(zip.getAttribute('href')).toBe('/api/runs/r-3/zip');
    expect(zip.hasAttribute('download')).toBe(true);
  });

  it('RF-1008 names no control of the history page like the Report controls of the run page', async () => {
    renderHistory();

    const table = await screen.findByRole('table', { name: 'Runs' });

    expect(within(table).queryAllByRole('link', { name: /report/iu })).toEqual([]);
    expect(within(table).queryAllByRole('button', { name: /report/iu })).toEqual([]);
  });
});

describe('history page rows, states', () => {
  it('RF-1008 offers the zip of a run in progress only when it ends', async () => {
    renderHistory();

    const live = within(await rowOf(liveKey));

    expect(live.queryByRole('link', { name: `Zip of run ${liveKey}` })).toBeNull();
    const zip = live.getByRole('button', { name: `Zip of run ${liveKey}` });
    expect(zip.hasAttribute('disabled')).toBe(true);
    expect(zip.getAttribute('title')).toBe('Available when the run ends.');
  });

  it('RF-1008 says so when the project has no run yet', async () => {
    renderHistory({ [historyPath]: json(200, { ...history, runs: [] }) });

    expect(await screen.findByText(/No runs yet/u)).not.toBeNull();
    expect(screen.queryByRole('table', { name: 'Runs' })).toBeNull();
  });

  it("RF-1105 shows the error and no table for another user's project", async () => {
    renderHistory({ [historyPath]: failure(404, 'RST-2003') });

    expect((await screen.findByTestId('error-banner-code')).textContent).toBe('RST-2003');
    expect(screen.queryByRole('table')).toBeNull();
  });
});

describe('deleting a run', () => {
  it('RF-1012 disables Delete for a run in progress, with the reason', async () => {
    renderHistory();

    const live = within(await rowOf(liveKey));

    const button = live.getByRole('button', { name: `Delete (running): run ${liveKey}` });
    expect(button.hasAttribute('disabled')).toBe(true);
    expect(button.getAttribute('title')).toBe('Stop the run before deleting it');
  });

  it('RF-1012 asks first, naming the folder and the space it frees, and keeps the totals', async () => {
    renderHistory();
    fireEvent.click(
      within(await rowOf(doneKey)).getByRole('button', { name: `Delete: run ${doneKey}` }),
    );

    const dialog = screen.getByRole('dialog', { name: `Delete run ${doneKey}?` });

    expect(dialog.textContent).toContain(`projects/p-1/runs/${doneKey}`);
    expect(dialog.textContent).toContain('3.2 MB');
    expect(dialog.textContent).toContain('412,606 tokens · $1.31');
    expect(dialog.textContent).toContain('This cannot be undone.');
    expect(within(dialog).getByRole('button', { name: 'Delete run' })).not.toBeNull();
  });
});

describe('deleting a run, confirmed', () => {
  it('RF-1012 deletes the run after the confirmation and says how much space it freed', async () => {
    const page = renderHistory({ 'DELETE /api/runs/r-1': json(200, { freedBytes: 3_200_000 }) });
    fireEvent.click(
      within(await rowOf(doneKey)).getByRole('button', { name: `Delete: run ${doneKey}` }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete run' }));

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: `Delete: run ${doneKey}` })).toBeNull();
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('status').textContent).toContain(`Run ${doneKey} deleted`);
    expect(screen.getByRole('status').textContent).toContain('3.2 MB freed');
    const call = page.calls.find((each) => each.method === 'DELETE');
    expect(call).toMatchObject({ path: '/api/runs/r-1', csrf: 'csrf-0' });
  });

  it('RF-1012 deletes nothing when the confirmation is cancelled', async () => {
    const page = renderHistory();
    fireEvent.click(
      within(await rowOf(doneKey)).getByRole('button', { name: `Delete: run ${doneKey}` }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(page.calls.filter((each) => each.method === 'DELETE')).toEqual([]);
    expect(await rowOf(doneKey)).not.toBeNull();
  });

  it('RF-1012 keeps the run and shows the refusal when the server answers 409', async () => {
    renderHistory({ 'DELETE /api/runs/r-1': failure(409, 'RST-2306') });
    fireEvent.click(
      within(await rowOf(doneKey)).getByRole('button', { name: `Delete: run ${doneKey}` }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete run' }));

    expect((await screen.findByTestId('error-banner-code')).textContent).toBe('RST-2306');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await rowOf(doneKey)).not.toBeNull();
  });
});

describe('deleting the project', () => {
  it('RF-1012 disables Delete project while a run is in progress, with the reason', async () => {
    renderHistory();

    const button = await screen.findByRole('button', { name: 'Delete project' });

    expect(button.hasAttribute('disabled')).toBe(true);
    expect(button.getAttribute('title')).toBe(
      'A run is in progress. Stop it before deleting the project.',
    );
  });

  it('RF-1012 names the folder, the runs and the space before deleting the project', async () => {
    renderHistory({ [historyPath]: json(200, settledHistory) });
    fireEvent.click(await screen.findByRole('button', { name: 'Delete project' }));

    const dialog = screen.getByRole('dialog', { name: 'Delete project octo/webforms?' });

    expect(dialog.textContent).toContain('projects/p-1');
    expect(dialog.textContent).toContain('7.8 MB');
    expect(dialog.textContent).toContain('3 runs');
    expect(dialog.textContent).toContain('cost ledger');
    expect(dialog.textContent).toContain('This cannot be undone.');
  });

  it('RF-1012 deletes the project after the confirmation and returns to the projects', async () => {
    const page = renderHistory({
      [historyPath]: json(200, settledHistory),
      'DELETE /api/projects/p-1': json(200, { freedBytes: 7_800_000 }),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Delete project' }));

    const dialog = screen.getByRole('dialog', { name: 'Delete project octo/webforms?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete project' }));

    await waitFor(() => {
      expect(window.location.pathname).toBe('/projects');
    });
    const call = page.calls.find((each) => each.method === 'DELETE');
    expect(call).toMatchObject({ path: '/api/projects/p-1', csrf: 'csrf-0' });
  });
});
