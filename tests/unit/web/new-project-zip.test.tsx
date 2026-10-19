import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, expect, it, vi } from 'vitest';
import { failure, json } from './fake-api.js';
import { installFakeUploadServer } from './fake-upload-server.js';
import {
  chooseFile,
  overview,
  renderUploadTab,
  sourceless,
  summaryBody,
  uploadButton,
  withSource,
  zipFile,
} from './zip-fixtures.js';

// RF-128, RF-134, RFC-004 sections 4.2 and 4.5: the Upload a zip tab of the New project form
// against a fake server. The refusals before sending are in zip-checks.test.tsx.

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.pushState({}, '', '/');
});

function nameField(): HTMLInputElement {
  const field = screen.getByLabelText('Project name');
  if (!(field instanceof HTMLInputElement)) throw new Error('The name field is not an input.');
  return field;
}

/** Chooses a zip and waits until the form accepts it. */
async function chooseValid(name = 'OrderDesk.zip'): Promise<void> {
  chooseFile(zipFile(name));
  await waitFor(() => {
    expect(uploadButton().hasAttribute('disabled')).toBe(false);
  });
}

async function sendOne(server: { readonly requests: readonly unknown[] }): Promise<void> {
  fireEvent.click(uploadButton());
  await waitFor(() => {
    expect(server.requests.length).toBeGreaterThan(0);
  });
}

it('RF-128 the form has the tabs GitHub repository and Upload a zip', () => {
  renderUploadTab();

  const tabs = screen.getAllByRole('tab').map((tab) => tab.textContent);
  expect(tabs).toEqual(['GitHub repository', 'Upload a zip']);
  expect(screen.getByLabelText('Zip file')).not.toBeNull();
  fireEvent.click(screen.getByRole('tab', { name: 'GitHub repository' }));
  expect(screen.getByLabelText('GitHub repository URL')).not.toBeNull();
  expect(screen.queryByLabelText('Zip file')).toBeNull();
});

it('RF-134 the tab states the limit (500 MB until the server says) and how to make a zip', async () => {
  renderUploadTab();

  expect(await screen.findByText(/Largest zip: 500 MB/u)).not.toBeNull();
  expect(screen.getByText(/Windows:/u).textContent).toContain('Compressed (zipped) folder');
  expect(screen.getByText(/macOS:/u).textContent).toContain('Compress');
});

it('RF-134 the limit is the one the server reports', async () => {
  renderUploadTab({
    'GET /api/session': json(200, {
      user: { id: 'u-1', userName: 'ana', displayName: 'Ana', role: 'user', state: 'Active' },
      csrfToken: 'csrf-0',
      uploadMaxMb: 100,
    }),
  });

  expect(await screen.findByText(/Largest zip: 100 MB/u)).not.toBeNull();
});

it('RF-128 sends the zip to a new project of kind upload, with the CSRF token, and shows the summary', async () => {
  const server = installFakeUploadServer();
  const view = renderUploadTab({ 'POST /api/projects': json(201, sourceless) });
  await chooseValid();
  expect(nameField().value).toBe('OrderDesk');

  await sendOne(server);

  expect(view.calls.find((call) => call.method === 'POST')).toEqual({
    method: 'POST',
    path: '/api/projects',
    csrf: 'csrf-0',
    body: { sourceKind: 'upload', name: 'OrderDesk' },
  });
  const sent = server.pending();
  expect(sent.method).toBe('PUT');
  expect(sent.path).toBe('/api/projects/p-9/source');
  expect(sent.headers['content-type']).toBe('application/zip');
  expect(sent.headers['x-csrf-token']).toBe('csrf-0');
  expect(sent.body).toBeInstanceOf(File);

  sent.respond(201, summaryBody);

  const summary = await screen.findByText(/70 files kept/u);
  expect(summary.textContent).toContain('3.2 MB');
  expect(summary.textContent).toContain('12 entries left out');
  expect(screen.getByRole('link', { name: 'Start a run' }).getAttribute('href')).toBe(
    '/projects/p-9/start',
  );
});

it('RF-128 the project name is editable and the edited name is the one created', async () => {
  const server = installFakeUploadServer();
  const view = renderUploadTab({ 'POST /api/projects': json(201, sourceless) });
  await chooseValid();

  fireEvent.input(nameField(), { target: { value: 'Order desk 2' } });
  await sendOne(server);

  expect(view.calls.find((call) => call.method === 'POST')?.body).toEqual({
    sourceKind: 'upload',
    name: 'Order desk 2',
  });
});

it('RF-128 shows the progress of the upload', async () => {
  const server = installFakeUploadServer();
  renderUploadTab({ 'POST /api/projects': json(201, sourceless) });
  await chooseValid();
  await sendOne(server);

  server.pending().progress(50, 200);

  const bar = await screen.findByRole('progressbar', { name: 'Upload progress' });
  expect(bar.getAttribute('aria-valuenow')).toBe('25');
  expect(uploadButton().hasAttribute('disabled')).toBe(true);
});

it('RF-128 a failed upload names the reason and offers Upload again, which reuses the project', async () => {
  const server = installFakeUploadServer();
  const view = renderUploadTab({
    'POST /api/projects': json(201, sourceless),
    'GET /api/projects/overview': overview(sourceless),
  });
  await chooseValid();
  await sendOne(server);

  server.pending().respond(413, {
    code: 'RST-1912',
    message: 'The zip is larger than the limit.',
    nextStep: 'Remove the node_modules folder and zip again.',
  });

  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain('RST-1912');
  expect(alert.textContent).toContain('Remove the node_modules folder and zip again.');
  expect(screen.getByText(/has no source/u)).not.toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Upload again' }));
  await waitFor(() => {
    expect(server.requests).toHaveLength(2);
  });
  expect(server.pending().path).toBe('/api/projects/p-9/source');
  expect(view.calls.filter((call) => call.method === 'POST')).toHaveLength(1);
});

it('RF-128 an upload that cannot reach the server offers Upload again', async () => {
  const server = installFakeUploadServer();
  renderUploadTab({ 'POST /api/projects': json(201, sourceless) });
  await chooseValid();
  await sendOne(server);

  server.pending().failNetwork();

  expect((await screen.findByRole('alert')).textContent).toContain('RST-2009');
  expect(screen.getByRole('button', { name: 'Upload again' })).not.toBeNull();
});

it('RF-128 a refused project creation shows the refusal and sends no archive', async () => {
  const server = installFakeUploadServer();
  renderUploadTab({ 'POST /api/projects': failure(422, 'RST-1900') });
  await chooseValid();

  fireEvent.click(uploadButton());

  expect((await screen.findByRole('alert')).textContent).toContain('RST-1900');
  expect(server.requests).toHaveLength(0);
});

it('RF-128 the new project appears in the list as name (zip, date) once the zip is in', async () => {
  const server = installFakeUploadServer();
  let stored = false;
  renderUploadTab({
    'POST /api/projects': json(201, sourceless),
    'GET /api/projects/overview': () => (stored ? overview(withSource) : overview()),
  });
  await chooseValid();
  await sendOne(server);

  stored = true;
  server.pending().respond(201, summaryBody);

  const row = (await screen.findByText('OrderDesk (zip, 19 Oct 2026)')).closest('tr');
  expect(row).not.toBeNull();
  expect(within(row ?? document.body).queryByText(/github/iu)).toBeNull();
});
