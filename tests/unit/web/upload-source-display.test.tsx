import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, expect, it, vi } from 'vitest';
import { StartRunPage } from '../../../web/src/pages/StartRunPage.js';
import { ProjectsPage } from '../../../web/src/pages/ProjectsPage.js';
import { json, renderPage } from './fake-api.js';
import { installFakeUploadServer } from './fake-upload-server.js';
import { overviewRow, projectOf } from './project-fixtures.js';
import { overview, sourceless, withSource, zipFile } from './zip-fixtures.js';

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

  await screen.findByText('OrderDesk (zip, no source)');
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

  expect(await screen.findByText(/has no source. Upload a zip to start/u)).not.toBeNull();
  expect(screen.getByLabelText('Zip file')).not.toBeNull();
  const start = screen.getByRole('button', { name: /^Analyse/u });
  expect(start.hasAttribute('disabled')).toBe(true);
  expect(start.getAttribute('title')).toBe('Upload a zip first: this project has no source.');
});

it('RF-128 a failed new upload to a project that already has a source does not say it has none', async () => {
  const server = installFakeUploadServer();
  renderStartOf(withSource);
  await screen.findByText('OrderDesk (zip, 19 Oct 2026)');
  const field = screen.getByLabelText('Zip file');
  fireEvent.change(field, { target: { files: [zipFile('OrderDesk-2.zip')] } });
  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Upload zip' }).hasAttribute('disabled')).toBe(false);
  });

  fireEvent.click(screen.getByRole('button', { name: 'Upload zip' }));
  await waitFor(() => {
    expect(server.requests).toHaveLength(1);
  });
  expect(server.requests[0]?.path).toBe('/api/projects/p-9/source');
  server.pending().respond(413, {
    code: 'RST-1912',
    message: 'The zip is larger than the limit.',
    nextStep: 'Zip again.',
  });

  expect(await screen.findByRole('button', { name: 'Upload again' })).not.toBeNull();
  expect(screen.queryByText(/has no source/u)).toBeNull();
});

it('RF-128 a stored zip updates the source line and releases Start', async () => {
  const server = installFakeUploadServer();
  renderStartOf(sourceless);
  await screen.findByText(/has no source\. Upload a zip to start/u);
  fireEvent.change(screen.getByLabelText('Zip file'), {
    target: { files: [zipFile('OrderDesk.zip')] },
  });
  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Upload zip' }).hasAttribute('disabled')).toBe(false);
  });
  fireEvent.click(screen.getByRole('button', { name: 'Upload zip' }));
  await waitFor(() => {
    expect(server.requests).toHaveLength(1);
  });

  server.pending().respond(201, { files: 1, size: 10, skipped: 0, snapshotHash: 'b'.repeat(64) });

  expect(await screen.findByText(/1 file kept/u)).not.toBeNull();
  expect(screen.queryByText(/has no source\. Upload a zip to start/u)).toBeNull();
  expect(screen.getByText(/^OrderDesk \(zip, \d{1,2} \w{3} \d{4}\)$/u)).not.toBeNull();
});

it('RF-128 the start page form keeps the project it has: no name field to make another', async () => {
  renderStartOf(withSource);
  await screen.findByText('OrderDesk (zip, 19 Oct 2026)');

  fireEvent.change(screen.getByLabelText('Zip file'), {
    target: { files: [zipFile('Another.zip')] },
  });

  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Upload zip' }).hasAttribute('disabled')).toBe(false);
  });
  expect(screen.queryByLabelText('Project name')).toBeNull();
});

it('RF-128 the date and name the server reports for the stored zip are the ones shown', async () => {
  const server = installFakeUploadServer();
  renderStartOf(sourceless);
  await screen.findByText(/has no source\. Upload a zip to start/u);
  fireEvent.change(screen.getByLabelText('Zip file'), {
    target: { files: [zipFile('OrderDesk.zip')] },
  });
  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Upload zip' }).hasAttribute('disabled')).toBe(false);
  });
  fireEvent.click(screen.getByRole('button', { name: 'Upload zip' }));
  await waitFor(() => {
    expect(server.requests).toHaveLength(1);
  });

  server.pending().respond(201, {
    files: 1,
    size: 10,
    skipped: 0,
    snapshotHash: 'b'.repeat(64),
    fileName: 'OrderDesk.zip',
    uploadedAt: '2026-01-02T03:04:05.000Z',
  });

  expect(await screen.findByText('OrderDesk (zip, 2 Jan 2026)')).not.toBeNull();
});

async function uploadReplacement(
  server: ReturnType<typeof installFakeUploadServer>,
): Promise<void> {
  await screen.findByText('OrderDesk (zip, 19 Oct 2026)');
  fireEvent.change(screen.getByLabelText('Zip file'), {
    target: { files: [zipFile('OrderDesk-v2.zip')] },
  });
  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Upload zip' }).hasAttribute('disabled')).toBe(false);
  });
  fireEvent.click(screen.getByRole('button', { name: 'Upload zip' }));
  await waitFor(() => {
    expect(server.requests).toHaveLength(1);
  });
}

const replaced = {
  files: 1,
  size: 10,
  skipped: 0,
  snapshotHash: 'c'.repeat(64),
  fileName: 'OrderDesk-v2.zip',
  uploadedAt: '2026-10-20T08:00:00.000Z',
};

it('RF-128 a replacing upload shows "The code changed since the last run." at once, without a reload', async () => {
  const server = installFakeUploadServer();
  renderStartOf(withSource);
  await uploadReplacement(server);
  expect(screen.queryByText('The code changed since the last run.')).toBeNull();

  server.pending().respond(201, { ...replaced, codeChangedSinceLastRun: true });

  expect(await screen.findByText('The code changed since the last run.')).not.toBeNull();
  expect(screen.getByText('OrderDesk (zip, 20 Oct 2026)')).not.toBeNull();
});

it('RF-128 an upload of the same code the last run read takes the notice away', async () => {
  const server = installFakeUploadServer();
  renderStartOf(changed);
  await uploadReplacement(server);
  expect(screen.getByText('The code changed since the last run.')).not.toBeNull();

  server.pending().respond(201, { ...replaced, codeChangedSinceLastRun: false });

  await screen.findByText('OrderDesk (zip, 20 Oct 2026)');
  expect(screen.queryByText('The code changed since the last run.')).toBeNull();
});

it('RF-128 an answer that does not say whether the code changed leaves the notice as it was', async () => {
  const server = installFakeUploadServer();
  renderStartOf(changed);
  await uploadReplacement(server);

  server.pending().respond(201, replaced);

  await screen.findByText('OrderDesk (zip, 20 Oct 2026)');
  expect(screen.getByText('The code changed since the last run.')).not.toBeNull();
});
