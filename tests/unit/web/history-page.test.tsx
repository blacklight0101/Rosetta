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

/** Opens the row menu of a run and returns the item of that name. */
async function menuItem(runKey: string, name: string): Promise<HTMLElement> {
  const row = within(await rowOf(runKey));
  fireEvent.click(row.getByRole('button', { name: `More actions for run ${runKey}` }));
  return row.findByRole('menuitem', { name: new RegExp(`^${name}`, 'u') });
}

afterEach(() => {
  window.history.pushState({}, '', '/');
});

describe('history page rows', () => {
  it('RF-1008 lists each run with its start, kind, short commit, state, tokens and cost', async () => {
    renderHistory();

    const table = await screen.findByRole('table', { name: 'Runs' });

    expect(screen.getByRole('heading', { name: 'History', level: 1 })).not.toBeNull();
    const live = within(await rowOf(liveKey));
    for (const text of ['11 Oct, 09:12', 'Understand', 'a1b2c3d', 'Running']) {
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

  it('RF-1008 links each run to its run page and its zip in the row menu', async () => {
    renderHistory();

    const done = within(await rowOf(scanKey));

    expect(done.getByRole('link', { name: `View run ${scanKey}` }).getAttribute('href')).toBe(
      '/runs/r-3',
    );
    const zip = await menuItem(scanKey, 'Zip');
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

describe('history page running time (P8-88)', () => {
  const timeOf = async (runKey: string): Promise<string | undefined> => {
    const row = await rowOf(runKey);
    return row.querySelector('[data-label="Running time"]')?.textContent ?? undefined;
  };

  it('RF-1008 has a Running time column before Tokens, with a dash while the run has not ended', async () => {
    renderHistory();

    const table = await screen.findByRole('table', { name: 'Runs' });

    const headers = within(table)
      .getAllByRole('columnheader')
      .map((header) => header.textContent);
    expect(headers.indexOf('Running time')).toBeGreaterThan(headers.indexOf('State'));
    expect(headers.indexOf('Running time')).toBeLessThan(headers.indexOf('Tokens'));
    expect(await timeOf(liveKey)).toBe('–');
    expect(await timeOf(scanKey)).toBe('8 s');
    expect(await timeOf(doneKey)).toBe('22 min');
  });

  it('RF-1008 shows 66 min of running time and the wall time of a run that was resumed', async () => {
    const resumed = { ...history.runs[3], runningMs: 3_960_000, wallMs: 7_800_000 };
    renderHistory({ [historyPath]: json(200, { ...history, runs: [resumed] }) });

    expect(await timeOf(doneKey)).toBe('66 min (over 2 h 10 min)');
  });

  it('RF-1008 leaves the wall time out when it is less than a minute longer than the running time', async () => {
    const quick = { ...history.runs[3], runningMs: 3_960_000, wallMs: 4_000_000 };
    renderHistory({ [historyPath]: json(200, { ...history, runs: [quick] }) });

    expect(await timeOf(doneKey)).toBe('66 min');
  });
});

describe('history page rows, states', () => {
  it('RF-1008 offers the zip of a run in progress only when it ends', async () => {
    renderHistory();

    const zip = await menuItem(liveKey, 'Zip');

    expect(zip.tagName).toBe('BUTTON');
    expect(zip.getAttribute('aria-disabled')).toBe('true');
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

    const button = await menuItem(liveKey, 'Delete');

    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.getAttribute('title')).toBe('Stop the run before deleting it');
  });

  it('RF-1012 asks first, naming the folder and the space it frees, and keeps the totals', async () => {
    renderHistory();
    fireEvent.click(await menuItem(doneKey, 'Delete'));

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
    fireEvent.click(await menuItem(doneKey, 'Delete'));

    fireEvent.click(screen.getByRole('button', { name: 'Delete run' }));

    await waitFor(() => {
      expect(screen.queryByText(doneKey)).toBeNull();
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('status').textContent).toContain(`Run ${doneKey} deleted`);
    expect(screen.getByRole('status').textContent).toContain('3.2 MB freed');
    const call = page.calls.find((each) => each.method === 'DELETE');
    expect(call).toMatchObject({ path: '/api/runs/r-1', csrf: 'csrf-0' });
  });

  it('RF-1012 deletes nothing when the confirmation is cancelled', async () => {
    const page = renderHistory();
    fireEvent.click(await menuItem(doneKey, 'Delete'));

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(page.calls.filter((each) => each.method === 'DELETE')).toEqual([]);
    expect(await rowOf(doneKey)).not.toBeNull();
  });

  it('RF-1012 keeps the run and shows the refusal when the server answers 409', async () => {
    renderHistory({ 'DELETE /api/runs/r-1': failure(409, 'RST-2306') });
    fireEvent.click(await menuItem(doneKey, 'Delete'));

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
