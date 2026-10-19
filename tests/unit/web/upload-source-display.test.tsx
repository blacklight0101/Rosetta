import { screen, within } from '@testing-library/preact';
import { afterEach, expect, it, vi } from 'vitest';
import { StartRunPage } from '../../../web/src/pages/StartRunPage.js';
import { ProjectsPage } from '../../../web/src/pages/ProjectsPage.js';
import { json, renderPage } from './fake-api.js';
import { installFakeUploadServer } from './fake-upload-server.js';
import { overviewRow, projectOf } from './project-fixtures.js';
import { overview, sourceless, withSource } from './zip-fixtures.js';

// RF-128, RF-134, RFC-004 section 4.5: how a project of kind upload shows in the projects list and on
// its start page: `<name> (zip, <date>)`, the note that the code changed since the last run, and the
// project with no source that offers Upload again. A GitHub project looks as it does on main.

afterEach(() => {
  vi.unstubAllGlobals();
});

const changed = projectOf('p-9', 'OrderDesk', {
  sourceUrl: '',
  sourceKind: 'upload',
  source: { fileName: 'OrderDesk.zip', uploadedAt: '2026-10-19T08:00:00.000Z' },
  codeChangedSinceLastRun: true,
});

function rowOf(text: string): HTMLElement {
  const row = screen.getByText(text).closest('tr');
  if (row === null) throw new Error(`No row for ${text}.`);
  return row;
}

it('RF-128 the list shows an upload as name (zip, date) and a GitHub project unchanged', async () => {
  const github = projectOf('p-1', 'octo/demo', { ref: 'main' });
  renderPage(<ProjectsPage />, {
    'GET /api/projects/overview': overview(withSource, github),
  });

  await screen.findByText('OrderDesk (zip, 19 Oct 2026)');
  const zipRow = rowOf('OrderDesk (zip, 19 Oct 2026)');
  expect(within(zipRow).queryByText('default branch')).toBeNull();
  expect(within(zipRow).queryByText(/whole repository/u)).toBeNull();
  const githubRow = rowOf('octo/demo');
  expect(within(githubRow).getByText('main')).not.toBeNull();
  expect(within(githubRow).queryByText(/zip/u)).toBeNull();
});

it('RF-128 the list says the code changed since the last run, for an upload only', async () => {
  renderPage(<ProjectsPage />, {
    'GET /api/projects/overview': overview(changed, projectOf('p-1', 'octo/demo')),
  });

  await screen.findByText('OrderDesk (zip, 19 Oct 2026)');

  expect(
    within(rowOf('OrderDesk (zip, 19 Oct 2026)')).getByText(/code changed since the last run/iu),
  ).not.toBeNull();
  expect(within(rowOf('octo/demo')).queryByText(/code changed/iu)).toBeNull();
});

it('RF-128 an upload with no source is listed as having none', async () => {
  renderPage(<ProjectsPage />, {
    'GET /api/projects/overview': json(200, {
      projects: [overviewRow(sourceless)],
      truncated: false,
    }),
  });

  const row = rowOf('OrderDesk (zip, no source)');

  expect(within(row).getByText(/no source/iu)).not.toBeNull();
});

function renderStartOf(project: Record<string, unknown>): void {
  renderPage(
    <StartRunPage />,
    {
      'GET /api/projects/p-9': json(200, project),
      'GET /api/projects/p-9/estimate': json(404, {
        code: 'RST-2003',
        message: 'No code map.',
        nextStep: 'Run a scan first.',
      }),
      'GET /api/account/limits': json(404, {
        code: 'RST-2003',
        message: 'x',
        nextStep: 'x',
      }),
    },
    undefined,
    { projectId: 'p-9' },
  );
}

it('RF-128 the start page of an upload names the zip and its date instead of a GitHub field', async () => {
  renderStartOf(changed);

  expect(await screen.findByText('OrderDesk (zip, 19 Oct 2026)')).not.toBeNull();
  expect(screen.queryByLabelText('GitHub repository URL')).toBeNull();
  expect(screen.getByText(/code changed since the last run/iu)).not.toBeNull();
});

it('RF-128 the start page of an upload with no source says so, offers Upload again and holds Start', async () => {
  installFakeUploadServer();
  renderStartOf(sourceless);

  expect(await screen.findByText(/has no source/u)).not.toBeNull();
  expect(screen.getByLabelText('Zip file')).not.toBeNull();
  const start = screen.getByRole('button', { name: /^Start run/u });
  expect(start.hasAttribute('disabled')).toBe(true);
  expect(start.getAttribute('title')).toBe('Upload a zip first: this project has no source.');
});
