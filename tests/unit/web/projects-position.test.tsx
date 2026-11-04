import { screen, within } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { ProjectsPage } from '../../../web/src/pages/ProjectsPage.js';
import { json, renderPage } from './fake-api.js';
import { lastRunOf, overviewRow, projectOf } from './project-fixtures.js';

// RF-010, RF-1008, RF-1108, P8-99, DEC-222, `P8Projects` artboard: the column "Where it is" gives the
// position of the project in the journey from the one overview read, in the words of the journey
// strip, and the table has the artboard's columns only.

const overviewPath = 'GET /api/projects/overview';
const demo = projectOf('p-1', 'octo/demo');

const ended = (stage: string, overrides: Record<string, unknown> = {}) =>
  lastRunOf({ id: `r-${stage}`, stage, ...overrides });

afterEach(() => {
  window.history.pushState({}, '', '/');
});

function whereCell(link: HTMLElement): HTMLElement {
  const cell = link.closest('tr')?.querySelector<HTMLElement>('td[data-label="Where it is"]');
  if (cell === null || cell === undefined) throw new Error('No "Where it is" cell.');
  return cell;
}

async function positionOf(lastRun: Record<string, unknown> | null): Promise<string> {
  const rows = [overviewRow(demo, lastRun === null ? {} : { runs: 1, lastRun })];
  renderPage(<ProjectsPage />, {
    [overviewPath]: json(200, { projects: rows, truncated: false }),
  });
  return whereCell(await screen.findByRole('link', { name: 'octo/demo', exact: true })).textContent;
}

const positions = [
  ['no run', null, 'Scan not started'],
  ['a running scan', ended('scan', { queueState: 'Running', endState: null }), 'Scan running'],
  ['a finished scan', ended('scan'), 'Scan done'],
  [
    'a queued understand run',
    ended('understand', { queueState: 'Queued', endState: null }),
    'Understand queued',
  ],
  [
    'a running understand run',
    ended('understand', { queueState: 'Running', endState: null }),
    'Understand running',
  ],
  ['a finished understand run', ended('understand'), 'Understand done'],
  ['a running plan run', ended('plan', { queueState: 'Running', endState: null }), 'Plan running'],
  ['a finished plan run', ended('plan'), 'Package ready'],
  ['a failed plan run', ended('plan', { endState: 'Failed' }), 'Plan failed'],
  [
    'an understand run at its cap',
    ended('understand', { endState: 'CapReached' }),
    'Understand stopped at its cap',
  ],
  [
    'a run stopped by the user',
    ended('understand', { endState: 'Interrupted', endReason: 'UserStop' }),
    'Stopped by you',
  ],
  [
    'a run stopped by a restart',
    ended('understand', { endState: 'Interrupted', endReason: 'Restart' }),
    'Stopped by a restart',
  ],
  [
    'a run cancelled while queued',
    ended('scan', { endState: 'Interrupted', endReason: 'QueueCancel' }),
    'Cancelled while queued',
  ],
] as const;

describe('RF-010 where it is: the position of the project in the journey', () => {
  it.each(positions)(
    'RF-010 where it is reads the position of %s',
    async (_name, lastRun, text) => {
      expect(await positionOf(lastRun)).toContain(text);
    },
  );

  it('RF-010 the position is not the badge of the last run', async () => {
    const text = await positionOf(ended('plan'));

    expect(text).not.toContain('Completed');
    expect(screen.queryByText('Completed')).toBeNull();
  });

  it('RF-1108 a queued run keeps its queue position beside the position', async () => {
    const queued = ended('understand', { queueState: 'Queued', endState: null, position: 2 });

    const text = await positionOf(queued);

    expect(text).toContain('Understand queued');
    expect(text).toContain('position 2, 1 run ahead');
  });
});

describe('RF-010 the columns of the projects list', () => {
  it("RF-010 the columns are the artboard's: Project, Source, Where it is, Last run, Cost, Actions", async () => {
    renderPage(<ProjectsPage />, {
      [overviewPath]: json(200, {
        projects: [overviewRow(demo, { runs: 4, lastRun: lastRunOf() })],
        truncated: false,
      }),
    });
    const link = await screen.findByRole('link', { name: 'octo/demo', exact: true });

    expect(screen.getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
      'Project',
      'Source',
      'Where it is',
      'Last run',
      'Cost',
      'Actions',
    ]);
    const row = link.closest('tr');
    expect(row?.querySelector('td[data-label="Runs"]')).toBeNull();
    expect(row?.querySelector('td[data-label="Tokens"]')).toBeNull();
    expect(row?.querySelector('td[data-label="State"]')).toBeNull();
  });
});

describe('RF-010 the position comes with the overview', () => {
  it('RF-010 the position comes with the one overview read: no request per row', async () => {
    const rows = [1, 2, 3].map((n) =>
      overviewRow(projectOf(`p-${String(n)}`, `octo/p${String(n)}`), {
        runs: 1,
        lastRun: lastRunOf({ id: `r-${String(n)}`, stage: 'plan' }),
      }),
    );
    const page = renderPage(<ProjectsPage />, {
      [overviewPath]: json(200, { projects: rows, truncated: false }),
    });
    await screen.findByRole('link', { name: 'octo/p3', exact: true });

    expect(screen.getAllByText('Package ready')).toHaveLength(3);
    const paths = page.calls.map((call) => call.path);
    expect(paths.filter((path) => path.includes('/journey'))).toEqual([]);
    expect(paths.filter((path) => path.startsWith('/api/projects/overview'))).toHaveLength(1);
  });

  it('RF-010 the failed-areas note stays under the position of a run that read with failures', async () => {
    renderPage(<ProjectsPage />, {
      [overviewPath]: json(200, {
        projects: [overviewRow(demo, { runs: 1, lastRun: lastRunOf({ failedAreas: 2 }) })],
        truncated: false,
      }),
    });
    const cell = whereCell(await screen.findByRole('link', { name: 'octo/demo', exact: true }));

    expect(within(cell).getByText('2 areas failed')).not.toBeNull();
  });
});
