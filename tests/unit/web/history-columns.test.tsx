import { fireEvent, screen, within } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { HistoryPage } from '../../../web/src/pages/HistoryPage.js';
import { json, renderPage, type Answer } from './fake-api.js';
import { deepenKey, deepenRun, doneKey, history, liveKey, scanKey } from './history-fixtures.js';

// RF-1008, RF-1012, P8-89: the columns of the History artboard (kind, commit only for GitHub, start and
// coverage in their own columns) and the row menu with Zip and Delete.

const historyPath = 'GET /api/projects/p-1/history';

function renderHistory(answers: Readonly<Record<string, Answer>> = {}) {
  return renderPage(<HistoryPage />, { [historyPath]: json(200, history), ...answers }, undefined, {
    projectId: 'p-1',
  });
}

async function rowOf(runKey: string): Promise<HTMLElement> {
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

const headersOf = async (): Promise<(string | null)[]> =>
  within(await screen.findByRole('table', { name: 'Runs' }))
    .getAllByRole('columnheader')
    .map((header) => header.textContent);
const cellOf = async (runKey: string, label: string): Promise<string | undefined> =>
  (await rowOf(runKey)).querySelector(`[data-label="${label}"]`)?.textContent ?? undefined;

describe('history page columns (P8-89)', () => {
  it('RF-1008 P8-89 draws the columns of the artboard, with a row menu and no red button', async () => {
    renderHistory();

    expect(await headersOf()).toEqual([
      ...['Run', 'Kind', 'Commit', 'State', 'Coverage', 'Started'],
      ...['Running time', 'Tokens', 'Cost', 'Actions'],
    ]);
    const table = await screen.findByRole('table', { name: 'Runs' });
    expect(within(table).queryAllByRole('button', { name: /^Delete/u })).toEqual([]);
    expect(within(table).queryAllByRole('link', { name: /^Zip/u })).toEqual([]);
  });

  it('RF-1008 P8-89 names a Deepen "Deepen, 3 rounds" and the other runs by their stage', async () => {
    renderHistory({ [historyPath]: json(200, { ...history, runs: [deepenRun, ...history.runs] }) });

    expect(await cellOf(deepenKey, 'Kind')).toBe('Deepen, 3 rounds');
    expect(await cellOf(scanKey, 'Kind')).toBe('Scan');
    expect(await cellOf(doneKey, 'Kind')).toBe('Understand');
  });

  it('RF-1008 P8-89 names a Deepen that has finished no round "Deepen"', async () => {
    const waiting = { ...deepenRun, queueState: 'Queued', endState: null, deepenRounds: 0 };
    renderHistory({ [historyPath]: json(200, { ...history, runs: [waiting] }) });

    expect(await cellOf(deepenKey, 'Kind')).toBe('Deepen');
  });

  it('RF-1008 P8-89 shows a dash for a run of a GitHub project that has pinned no commit', async () => {
    const unpinned = { ...history.runs[0], commitSha: null };
    renderHistory({ [historyPath]: json(200, { ...history, runs: [unpinned] }) });

    expect(await cellOf(liveKey, 'Commit')).toBe('–');
  });
});

describe('history page commit and start (P8-89)', () => {
  it.each(['upload', 'workbook'])(
    'RF-1008 P8-89 has no Commit column and no "none" for a %s project',
    async (sourceKind) => {
      const project = { ...history.project, sourceKind, sourceUrl: '' };
      const runs = history.runs.map((run) => ({ ...run, commitSha: null }));
      renderHistory({ [historyPath]: json(200, { project, runs }) });

      expect(await headersOf()).not.toContain('Commit');
      const table = await screen.findByRole('table', { name: 'Runs' });
      expect(within(table).queryByText('none')).toBeNull();
      expect(await cellOf(doneKey, 'Commit')).toBeUndefined();
    },
  );

  it('RF-1008 P8-89 keeps the start in its own column, not under the run name', async () => {
    renderHistory();

    expect(await cellOf(scanKey, 'Started')).toBe('11 Oct, 09:11');
    expect(await cellOf(scanKey, 'Run')).toBe(scanKey);
    expect(await cellOf(liveKey, 'Tokens')).toBe('196,102');
  });
});

describe('the row menu (P8-89)', () => {
  it('RF-1012 P8-89 returns the focus to the menu button when the confirmation is cancelled', async () => {
    renderHistory();
    const row = within(await rowOf(doneKey));
    const button = row.getByRole('button', { name: `More actions for run ${doneKey}` });
    expect(button.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(await menuItem(doneKey, 'Delete'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(document.activeElement).toBe(button);
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('RF-1012 P8-89 closes the menu with Escape and gives the focus back to its button', async () => {
    renderHistory();
    const item = await menuItem(doneKey, 'Zip');
    const button = within(await rowOf(doneKey)).getByRole('button', {
      name: `More actions for run ${doneKey}`,
    });
    expect(button.getAttribute('aria-expanded')).toBe('true');

    fireEvent.keyDown(item, { key: 'Escape' });

    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(button);
  });
});

describe('the row menu button and keys (P8-89)', () => {
  it('RF-1008 P8-89 closes an open menu when its own button is clicked', async () => {
    renderHistory();
    await menuItem(doneKey, 'Zip');
    const button = within(await rowOf(doneKey)).getByRole('button', {
      name: `More actions for run ${doneKey}`,
    });

    fireEvent.mouseDown(button);
    fireEvent.click(button);

    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it.each(['ArrowDown', 'ArrowUp'])(
    'RF-1008 P8-89 opens the menu with %s on its button',
    async (key) => {
      renderHistory();
      const button = within(await rowOf(doneKey)).getByRole('button', {
        name: `More actions for run ${doneKey}`,
      });

      fireEvent.keyDown(button, { key });

      expect(button.getAttribute('aria-expanded')).toBe('true');
      const items = await screen.findAllByRole('menuitem');
      expect(document.activeElement).toBe(key === 'ArrowDown' ? items[0] : items.at(-1));
    },
  );

  it('RF-1008 P8-89 moves to the first item with Home and to the last with End', async () => {
    renderHistory();
    const item = await menuItem(doneKey, 'Zip');
    const items = screen.getAllByRole('menuitem');
    expect(items.length).toBeGreaterThan(1);

    fireEvent.keyDown(item, { key: 'End' });
    expect(document.activeElement).toBe(items.at(-1));

    fireEvent.keyDown(items.at(-1) ?? item, { key: 'Home' });
    expect(document.activeElement).toBe(items[0]);
  });
});
