import { cleanup, render, screen, within } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { HistoryPage } from '../../../web/src/pages/HistoryPage.js';
import { ProjectRuns } from '../../../web/src/pages/ProjectRuns.js';
import { runHistorySchema } from '../../../web/src/api/history-schemas.js';
import { json, renderPage } from './fake-api.js';
import { doneKey, history, scanKey } from './history-fixtures.js';

// RF-230, RF-1008, DEC-220 (P8-130): the History table and the "Runs of this project" list read an
// understand run below the coverage bar as its page does, "Partly read: 16% of your code", from the
// history answer and with no coverage request per row.

afterEach(() => {
  cleanup();
  window.history.pushState({}, '', '/');
});

const partly = { partlyReadAreas: 2, readShare: 0.16 };
const withPartly = (change: Record<string, unknown>) => ({
  ...history,
  runs: history.runs.map((run) => (run.runId === doneKey ? { ...run, ...change } : run)),
});

async function rowOf(runKey: string): Promise<HTMLElement> {
  const [cell] = await screen.findAllByText(runKey);
  const row = cell?.closest('tr') ?? null;
  if (row === null) throw new Error(`No row for ${runKey}.`);
  return row;
}

/** The State cell as [badge, line under the badge]: the badge is the word, the line the share. */
const cellOf = (row: Element | null): [string, string] => {
  const cell = row?.querySelector('[data-label="State"]');
  const badge = cell?.querySelector('[data-testid="status-badge"]')?.textContent ?? '';
  return [badge, cell?.querySelector('.rst-table__sub')?.textContent ?? ''];
};
const stateOf = async (runKey: string) => cellOf(await rowOf(runKey));

function renderHistory(body: unknown) {
  return renderPage(
    <HistoryPage />,
    { 'GET /api/projects/p-1/history': json(200, body) },
    undefined,
    { projectId: 'p-1' },
  );
}

describe('the History table and a run below the coverage bar', () => {
  it('RF-1008 RF-230 reads "Partly read" with "16% of your code" under it for a Completed run, and no coverage request is made', async () => {
    const page = renderHistory(withPartly(partly));

    expect(await stateOf(doneKey)).toEqual(['Partly read', '16% of your code']);
    expect(page.calls.filter((call) => call.path.endsWith('/coverage'))).toEqual([]);
  });

  it('RF-1008 RF-230 reads only "Partly read" when the share is not known', async () => {
    renderHistory(withPartly({ partlyReadAreas: 1, readShare: null }));

    expect(await stateOf(doneKey)).toEqual(['Partly read', '']);
  });

  it('RF-1008 RF-230 keeps Completed for a run at the bar, and for a scan that has no areas', async () => {
    renderHistory(history);

    expect(await stateOf(doneKey)).toEqual(['Completed', '']);
    expect(await stateOf(scanKey)).toEqual(['Completed', '']);
  });
});

describe('the "Runs of this project" list and a run below the coverage bar', () => {
  it('RF-1008 RF-230 reads "Partly read" with "16% of your code" under it for a Completed run and keeps the others', () => {
    const runs = runHistorySchema.parse(withPartly(partly)).runs;
    render(<ProjectRuns runs={runs} />);

    const table = screen.getByRole('table', { name: 'Runs of this project' });
    const stateAt = (key: string) => cellOf(within(table).getByText(key).closest('tr'));
    expect(stateAt(doneKey)).toEqual(['Partly read', '16% of your code']);
    expect(stateAt(scanKey)).toEqual(['Completed', '']);
  });
});

describe('the history answer', () => {
  it('RF-1008 the wire shape reads a run without the figures as no partly read areas', () => {
    const [run] = runHistorySchema.parse(history).runs;

    expect(run).toMatchObject({ partlyReadAreas: 0, readShare: null });
  });
});
