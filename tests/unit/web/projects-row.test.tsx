import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, expect, it } from 'vitest';
import { ProjectsPage } from '../../../web/src/pages/ProjectsPage.js';
import { json, renderPage, type Answer } from './fake-api.js';
import { history } from './history-fixtures.js';
import { lastRunOf, overviewRow, projectOf } from './project-fixtures.js';

// RF-010, RF-1012, P8-99, design-system.md section 14 (Projects), `P8Projects` artboard: the row of
// the projects list names the project as a link, shows its source as a badge, offers a secondary
// "Open" and a "More actions" menu with Rename (tests/unit/web/projects-rename.test.tsx), the project
// settings, the live run and Delete project.

const overviewPath = 'GET /api/projects/overview';
const zip = projectOf('p-2', 'Asset Manager', {
  sourceKind: 'upload',
  source: {
    fileName: 'asset-manager.zip',
    uploadedAt: '2026-11-02T08:00:00.000Z',
    fileCount: 12,
    sizeBytes: 4000,
  },
});
const sheets = projectOf('p-3', 'Invoice Generator', {
  sourceKind: 'workbook',
  source: {
    fileName: 'invoices.xlsx',
    uploadedAt: '2026-11-02T08:00:00.000Z',
    fileCount: 1,
    sizeBytes: 900,
    workbooks: 2,
  },
});
const github = projectOf('p-1', 'octo/webforms');

const renderProjects = (answers: Readonly<Record<string, Answer>>) =>
  renderPage(<ProjectsPage />, answers);

const rows = (list: readonly Record<string, unknown>[]): Response =>
  json(200, { projects: list, truncated: false });

const lastRunCell = (row: HTMLElement): string =>
  row.querySelector('td[data-label="Last run"]')?.textContent ?? '';

async function rowOf(name: string): Promise<HTMLElement> {
  const link = await screen.findByRole('link', { name, exact: true });
  const row = link.closest('tr');
  if (row === null) throw new Error(`No row for ${name}.`);
  return row;
}

function menuButton(row: HTMLElement, name: string): HTMLElement {
  return within(row).getByRole('button', { name: `More actions for ${name}` });
}

afterEach(() => {
  window.history.pushState({}, '', '/');
});

it('RF-010 the name of a project is the link to its page, with no source suffix', async () => {
  renderProjects({ [overviewPath]: rows([overviewRow(zip), overviewRow(sheets)]) });

  const row = await rowOf('Asset Manager');

  expect(
    within(row).getByRole('link', { name: 'Asset Manager', exact: true }).getAttribute('href'),
  ).toBe('/projects/p-2');
  expect(row.textContent).not.toContain('(zip');
  expect(screen.queryByText(/\(Excel,/u)).toBeNull();
  expect(document.querySelector('.rst-mono.rst-zip__file')).toBeNull();
});

it('RF-010 the source of each project is a badge in its own Source column', async () => {
  renderProjects({
    [overviewPath]: rows([overviewRow(github), overviewRow(zip), overviewRow(sheets)]),
  });

  await screen.findByRole('link', { name: 'octo/webforms', exact: true });

  expect(screen.getAllByRole('columnheader').map((cell) => cell.textContent)).toContain('Source');
  for (const [name, source] of [
    ['octo/webforms', 'GitHub'],
    ['Asset Manager', 'Zip'],
    ['Invoice Generator', 'Excel workbooks'],
  ] as const) {
    const badge = within(await rowOf(name)).getByText(source);
    expect(badge.className).toContain('rst-badge');
    expect(badge.closest('td')?.getAttribute('data-label')).toBe('Source');
  }
});

it('RF-010 a row has a secondary Open link and no primary button', async () => {
  renderProjects({ [overviewPath]: rows([overviewRow(github), overviewRow(zip)]) });

  const row = await rowOf('octo/webforms');

  const open = within(row).getByRole('link', { name: 'Open for octo/webforms' });
  expect(open.getAttribute('href')).toBe('/projects/p-1');
  expect(open.className).toContain('rst-button--secondary');
  expect(screen.queryByRole('link', { name: /^Start run/u })).toBeNull();
  expect(screen.queryByRole('link', { name: /^Settings for/u })).toBeNull();
  expect(document.querySelectorAll('.rst-table .rst-button--primary')).toHaveLength(0);
});

it('RF-010 the row menu offers Project settings, and Open live run only while the latest run is running', async () => {
  renderProjects({
    [overviewPath]: rows([
      overviewRow(github, {
        runs: 1,
        lastRun: lastRunOf({ id: 'r-7', queueState: 'Running', endState: null, endedAt: null }),
      }),
      overviewRow(zip, { runs: 1, lastRun: lastRunOf() }),
    ]),
  });

  fireEvent.click(menuButton(await rowOf('octo/webforms'), 'octo/webforms'));
  const running = screen.getByRole('menu', { name: 'More actions for octo/webforms' });
  expect(
    within(running).getByRole('menuitem', { name: 'Project settings' }).getAttribute('href'),
  ).toBe('/projects/p-1/settings');
  expect(
    within(running).getByRole('menuitem', { name: 'Open live run' }).getAttribute('href'),
  ).toBe('/runs/r-7');
  fireEvent.keyDown(running, { key: 'Escape' });

  fireEvent.click(menuButton(await rowOf('Asset Manager'), 'Asset Manager'));
  const ended = screen.getByRole('menu', { name: 'More actions for Asset Manager' });
  expect(within(ended).queryByRole('menuitem', { name: 'Open live run' })).toBeNull();
});

it('RF-1012 Delete project in the row menu asks the confirmation, then removes the project from the list', async () => {
  let deleted = false;
  const { calls } = renderProjects({
    [overviewPath]: () => rows(deleted ? [] : [overviewRow(github, { runs: 3 })]),
    'GET /api/projects/p-1/history': json(200, history),
    'DELETE /api/projects/p-1': () => {
      deleted = true;
      return json(200, { freedBytes: 7_800_000 });
    },
  });

  fireEvent.click(menuButton(await rowOf('octo/webforms'), 'octo/webforms'));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete project…' }));

  const dialog = await screen.findByRole('dialog', { name: 'Delete project octo/webforms?' });
  expect(dialog.textContent).toContain('projects/p-1');
  expect(dialog.textContent).toContain('7.8 MB');
  expect(dialog.textContent).toContain('cost ledger');
  expect(calls.some((call) => call.method === 'DELETE')).toBe(false);

  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete project' }));

  await waitFor(() => {
    expect(
      calls.some((call) => call.method === 'DELETE' && call.path === '/api/projects/p-1'),
    ).toBe(true);
  });
  await waitFor(() => {
    expect(screen.queryByRole('link', { name: 'octo/webforms', exact: true })).toBeNull();
  });
});

it('RF-1012 Cancel on the project confirmation deletes nothing and returns the focus to the menu button', async () => {
  const { calls } = renderProjects({
    [overviewPath]: rows([overviewRow(github, { runs: 3 })]),
    'GET /api/projects/p-1/history': json(200, history),
  });
  const button = menuButton(await rowOf('octo/webforms'), 'octo/webforms');
  fireEvent.click(button);
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete project…' }));
  const dialog = await screen.findByRole('dialog', { name: 'Delete project octo/webforms?' });

  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

  await waitFor(() => {
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  expect(document.activeElement).toBe(button);
  expect(calls.some((call) => call.method === 'DELETE')).toBe(false);
});

it('RF-1012 Delete project is disabled with the reason while a run of the project is queued or running', async () => {
  renderProjects({
    [overviewPath]: rows([
      overviewRow(github, {
        runs: 1,
        lastRun: lastRunOf({ queueState: 'Running', endState: null, endedAt: null }),
      }),
    ]),
  });

  fireEvent.click(menuButton(await rowOf('octo/webforms'), 'octo/webforms'));

  const item = screen.getByRole('menuitem', { name: /Delete project/u });
  expect(item.getAttribute('aria-disabled')).toBe('true');
  expect(item.textContent).toContain('A run is in progress. Stop it before deleting the project.');
  fireEvent.click(item);
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('RF-010 the last run shows only its date and time, a queued run says queued and no run says so', async () => {
  renderProjects({
    [overviewPath]: rows([
      overviewRow(github, {
        runs: 1,
        lastRun: lastRunOf({
          stage: 'understand',
          startedAt: '2026-11-03T09:10:00.000Z',
          endedAt: '2026-11-03T09:18:42.000Z',
        }),
      }),
      overviewRow(zip, {
        runs: 1,
        lastRun: lastRunOf({
          stage: 'scan',
          queueState: 'Queued',
          endState: null,
          startedAt: null,
          endedAt: null,
          position: 1,
        }),
      }),
      overviewRow(sheets),
    ]),
  });

  expect(lastRunCell(await rowOf('octo/webforms'))).toBe('3 Nov, 09:18');
  expect(lastRunCell(await rowOf('Asset Manager'))).toBe('queued');
  expect(lastRunCell(await rowOf('Invoice Generator'))).toBe('No run yet');
});

it('RF-010 the row menu reads Rename, Project settings and "Delete project…" in the order the artboard draws them', async () => {
  renderProjects({
    [overviewPath]: rows([overviewRow(github, { runs: 1, lastRun: lastRunOf() })]),
  });

  fireEvent.click(menuButton(await rowOf('octo/webforms'), 'octo/webforms'));

  const items = screen.getAllByRole('menuitem').map((item) => item.textContent);
  expect(items).toEqual(['Rename', 'Project settings', 'Delete project…']);
});

it('RF-1012 Escape on the project confirmation closes it, deletes nothing and returns the focus to the menu button', async () => {
  const { calls } = renderProjects({
    [overviewPath]: rows([overviewRow(github, { runs: 3 })]),
    'GET /api/projects/p-1/history': json(200, history),
  });
  const button = menuButton(await rowOf('octo/webforms'), 'octo/webforms');
  fireEvent.click(button);
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete project…' }));
  const dialog = await screen.findByRole('dialog', { name: 'Delete project octo/webforms?' });

  fireEvent.keyDown(dialog, { key: 'Escape' });

  await waitFor(() => {
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  expect(document.activeElement).toBe(button);
  expect(calls.some((call) => call.method === 'DELETE')).toBe(false);
});

it('RF-1012 a refused history read shows its error, opens no confirmation and deletes nothing', async () => {
  const { calls } = renderProjects({
    [overviewPath]: rows([overviewRow(github, { runs: 3 })]),
    'GET /api/projects/p-1/history': json(404, {
      code: 'RST-2003',
      message: 'That project was not found.',
      nextStep: 'Go back to your projects.',
    }),
  });
  fireEvent.click(menuButton(await rowOf('octo/webforms'), 'octo/webforms'));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete project…' }));

  const alert = await screen.findByTestId('error-banner');

  expect(alert.textContent).toContain('RST-2003');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(calls.some((call) => call.method === 'DELETE')).toBe(false);
});
