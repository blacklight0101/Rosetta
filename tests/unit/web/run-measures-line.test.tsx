import { screen, waitFor, within } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { HistoryPage } from '../../../web/src/pages/HistoryPage.js';
import { ProjectsPage } from '../../../web/src/pages/ProjectsPage.js';
import { failure, json, renderPage } from './fake-api.js';
import { doneKey, history, scanKey } from './history-fixtures.js';
import { lastRunOf, overviewRow, projectOf } from './project-fixtures.js';
import { measures, understanding } from './understanding-fixtures.js';

// RF-231 scenario 1, RF-1008: the understanding measures beside each ended understand run, in the
// list of the project's runs and on the Projects page, not only on the page of the run or after a
// Deepen. One line of words and a glyph; a run that has no measures shows nothing, and a failed
// read never breaks the list.

afterEach(() => {
  window.history.pushState({}, '', '/');
});

const measuresOf = (runId: string): string => `GET /api/runs/${runId}/understanding`;
const historyPath = 'GET /api/projects/p-1/history';

function renderHistory(answers: Parameters<typeof renderPage>[1]) {
  const settled = { ...history, runs: history.runs.slice(1) };
  return renderPage(<HistoryPage />, { [historyPath]: json(200, settled), ...answers }, undefined, {
    projectId: 'p-1',
  });
}

async function rowOf(runKey: string): Promise<HTMLElement> {
  const [cell] = await screen.findAllByText(runKey);
  const row = cell?.closest('tr') ?? null;
  if (row === null) throw new Error(`No row for ${runKey}.`);
  return row;
}

describe('RF-231 the measures beside each run of the history', () => {
  const answers = { [measuresOf('r-1')]: understanding(measures()) };

  it('RF-231 shows the coverage, the Supported share and what was not judged beside an ended run', async () => {
    renderHistory(answers);

    const line = await within(await rowOf(doneKey)).findByTestId('run-measures');

    expect(line.textContent).toContain('42% of first-party tokens read');
    expect(line.textContent).toContain('68 of 118 judged claims supported');
    expect(line.textContent).toContain('3 not judged');
    expect(line.textContent).not.toMatch(/complete/iu);
  });

  it('RF-231 says well covered, with a glyph, only for a run at the bar', async () => {
    const good = measures({ firstPartyCoverage: 0.9, notJudged: 0, wellCovered: true });
    renderHistory({ [measuresOf('r-1')]: understanding(good) });

    const line = await within(await rowOf(doneKey)).findByTestId('run-measures');

    expect(line.textContent).toContain('Well covered');
    expect(line.querySelector('svg')).not.toBeNull();
  });

  it('RF-231 reads nothing for a scan', async () => {
    const page = renderHistory(answers);

    await rowOf(scanKey);
    await waitFor(() => {
      expect(page.calls.filter((call) => call.path.includes('/understanding'))).not.toHaveLength(0);
    });
    expect(page.calls.some((call) => call.path.includes('r-3/understanding'))).toBe(false);
    expect(within(await rowOf(scanKey)).queryByTestId('run-measures')).toBeNull();
  });

  it('RF-231 shows nothing for a run without measures or when the read fails, and keeps the row', async () => {
    renderHistory({ [measuresOf('r-1')]: failure(500, 'RST-2006') });

    const row = await rowOf(doneKey);

    await waitFor(() => {
      expect(within(row).queryByTestId('run-measures')).toBeNull();
    });
    expect(within(row).getByText('Completed')).toBeTruthy();
  });
});

describe('RF-231 the measures beside the last run of a project', () => {
  const understandRun = lastRunOf({
    id: 'r-7',
    stage: 'understand',
    runId: '20261012-1-understand',
  });
  const rows = {
    projects: [overviewRow(projectOf('p-1', 'octo/demo'), { lastRun: understandRun, runs: 1 })],
    truncated: false,
  };

  it('RF-231 shows the measures of the last run on the Projects page', async () => {
    renderPage(<ProjectsPage />, {
      'GET /api/projects/overview': json(200, rows),
      [measuresOf('r-7')]: understanding(measures()),
    });

    const line = await screen.findByTestId('run-measures');

    expect(line.textContent).toContain('42% of first-party tokens read');
  });
});
