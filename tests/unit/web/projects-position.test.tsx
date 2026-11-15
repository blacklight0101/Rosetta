import { cleanup, screen, within } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import type { JourneyFacts } from '../../../web/src/api/journey-schemas.js';
import { chooseSkipDeepen } from '../../../web/src/lib/deepen-choice.js';
import { ProjectsPage } from '../../../web/src/pages/ProjectsPage.js';
import { json, renderPage } from './fake-api.js';
import { facts, roadSigns, source, sourceId } from './journey-fixtures.js';
import { lastRunOf, overviewRow, projectOf } from './project-fixtures.js';

// RF-010, RF-1008, RF-1108, P8-99, DEC-222, `P8Projects` artboard: the column "Where it is" gives the
// position of the project in the journey from the one overview read, in the words of the journey
// strip, and the table has the artboard's columns only. P8-137, DEC-226: the overview carries each
// project's journey facts, so the row says what the project page says beside its title.

const overviewPath = 'GET /api/projects/overview';
const demo = projectOf('p-1', 'octo/demo');

const ended = (stage: string, overrides: Record<string, unknown> = {}) =>
  lastRunOf({ id: `r-${stage}`, stage, ...overrides });

afterEach(() => {
  window.history.pushState({}, '', '/');
  window.localStorage.clear();
});

function whereCell(link: HTMLElement): HTMLElement {
  const cell = link.closest('tr')?.querySelector<HTMLElement>('td[data-label="Where it is"]');
  if (cell === null || cell === undefined) throw new Error('No "Where it is" cell.');
  return cell;
}

async function positionOf(
  lastRun: Record<string, unknown> | null,
  journey: JourneyFacts | null = null,
): Promise<string> {
  const rows = [overviewRow(demo, lastRun === null ? {} : { runs: 1, lastRun, journey })];
  renderPage(<ProjectsPage />, {
    [overviewPath]: json(200, { projects: rows, truncated: false }),
  });
  return whereCell(await screen.findByRole('link', { name: 'octo/demo', exact: true })).textContent;
}

/** A row whose project has these journey facts, with its newest run. */
const journeyRow = (name: string, lastRun: Record<string, unknown>) =>
  [lastRun, roadSigns[name] ?? facts()] as const;

const positions = [
  ['no run', [null, null], 'Scan not started'],
  [
    'a running scan',
    [ended('scan', { queueState: 'Running', endState: null }), null],
    'Scan running',
  ],
  ['a project with only a finished scan', [ended('scan'), null], 'Start a run'],
  [
    'a scan cancelled while queued',
    [ended('scan', { endState: 'Interrupted', endReason: 'QueueCancel' }), null],
    'Cancelled while queued',
  ],
  [
    'a running understand run',
    journeyRow('running', ended('understand', { queueState: 'Running', endState: null })),
    'Understand running',
  ],
  [
    'an understand run paused for approval',
    [
      ended('understand', { queueState: 'AwaitingApproval', endState: null, endedAt: null }),
      facts({ source: source({ queueState: 'AwaitingApproval', endState: null, endedAt: null }) }),
    ],
    'Paused for approval',
  ],
  [
    'a finished understand run with open questions',
    journeyRow('asking', ended('understand')),
    'Questions waiting',
  ],
  [
    'a finished understand run with no brief',
    journeyRow('noBrief', ended('understand')),
    'Plan setup waiting',
  ],
  [
    'a running plan run',
    journeyRow('planning', ended('plan', { queueState: 'Running', endState: null })),
    'Plan running',
  ],
  ['a finished plan run', journeyRow('written', ended('plan')), 'Package ready'],
  ['a package out of date', journeyRow('stale', ended('plan')), 'Package out of date'],
  ['a failed plan run', journeyRow('failed', ended('plan', { endState: 'Failed' })), 'Plan failed'],
  [
    'an understand run at its cap',
    journeyRow('capped', ended('understand', { endState: 'CapReached' })),
    'Understand stopped at its cap',
  ],
  [
    'a scan its owner stopped at the approved amount',
    [ended('scan', { endState: 'CapReached', endReason: 'StoppedAtApproval' }), null],
    'Scan stopped at the approved amount',
  ],
  [
    'an understand run stopped by the user',
    journeyRow(
      'stoppedByYou',
      ended('understand', { endState: 'Interrupted', endReason: 'UserStop' }),
    ),
    'Understand stopped by you',
  ],
] as const;

describe('RF-010 where it is: the position of the project in the journey', () => {
  it.each(positions)(
    'RF-010 where it is reads the position of %s',
    async (_name, [lastRun, journey], text) => {
      expect(await positionOf(lastRun, journey)).toContain(text);
    },
  );

  it('RF-010 the position is not the badge of the last run', async () => {
    const text = await positionOf(...journeyRow('written', ended('plan')));

    expect(text).not.toContain('Completed');
    expect(screen.queryByText('Completed')).toBeNull();
  });

  it('RF-1108 a queued run keeps its queue position beside the position', async () => {
    const queued = ended('understand', { queueState: 'Queued', endState: null, position: 2 });

    const text = await positionOf(...journeyRow('queued', queued));

    expect(text).toContain('Understand running');
    expect(text).toContain('position 2, 1 run ahead');
  });
});

describe('RF-646 the Deepen choice of the viewer in the projects list', () => {
  it('RF-646 a Deepen skipped on the project page is skipped in the row too', async () => {
    const journey = facts({ source: source({ openQuestions: 2, deepens: 0 }), briefSaved: false });

    expect(await positionOf(ended('understand'), journey)).toContain('Deepen waiting');
    cleanup();
    chooseSkipDeepen(sourceId, true);

    expect(await positionOf(ended('understand'), journey)).toContain('Questions waiting');
  });
});

describe('RF-432 a run paused for approval in the projects list', () => {
  it('RF-432 one paused run leaves the whole list readable, with its time under Last run', async () => {
    const paused = ended('understand', {
      queueState: 'AwaitingApproval',
      endState: null,
      endedAt: null,
    });
    renderPage(<ProjectsPage />, {
      [overviewPath]: json(200, {
        projects: [
          overviewRow(demo, { runs: 1, lastRun: paused }),
          overviewRow(projectOf('p-2', 'acme/shop')),
        ],
        truncated: false,
      }),
    });
    const link = await screen.findByRole('link', { name: 'octo/demo', exact: true });

    expect(screen.getByRole('link', { name: 'acme/shop', exact: true })).not.toBeNull();
    expect(whereCell(link).textContent).toContain('Paused for approval');
    expect(link.closest('tr')?.querySelector('td[data-label="Last run"]')?.textContent).toBe(
      '12 Oct, 09:30',
    );
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
        journey: roadSigns['written'],
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
