import { fireEvent, screen, waitFor } from '@testing-library/preact';
import { afterEach, expect, it, vi } from 'vitest';
import { json } from './fake-api.js';
import { installFakeUploadServer } from './fake-upload-server.js';
import {
  chooseFile,
  chooseValid,
  nameField,
  renderUploadTab,
  sendOne,
  sizedFile,
  sourceless,
  uploadButton,
  zipFile,
} from './zip-fixtures.js';

// RF-128, RF-134: one project per form session, the project name, cancelling a upload that is under
// way, and a limit that arrives late.

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.pushState({}, '', '/');
});

it('RF-128 after a failed upload another file goes to the same project: one POST, two PUTs', async () => {
  const server = installFakeUploadServer();
  const view = renderUploadTab({ 'POST /api/projects': json(201, sourceless) });
  await chooseValid();
  await sendOne(server);
  server.pending().failNetwork();
  await screen.findByRole('alert');

  await chooseValid('Other.zip');
  fireEvent.click(screen.getByRole('button', { name: 'Upload again' }));

  await waitFor(() => {
    expect(server.requests).toHaveLength(2);
  });
  expect(server.pending().path).toBe('/api/projects/p-9/source');
  expect(view.calls.filter((call) => call.method === 'POST')).toHaveLength(1);
  expect(screen.queryByLabelText('Project name')).toBeNull();
});

it('RF-128 a cleared project name falls back to the file name without .zip', async () => {
  const server = installFakeUploadServer();
  const view = renderUploadTab({ 'POST /api/projects': json(201, sourceless) });
  await chooseValid();

  fireEvent.input(nameField(), { target: { value: '   ' } });
  await sendOne(server);

  expect(view.calls.find((call) => call.method === 'POST')?.body).toEqual({
    sourceKind: 'upload',
    name: 'OrderDesk',
  });
});

it('RF-128 a file called .zip with no name typed is held with the reason, nothing is sent', async () => {
  const server = installFakeUploadServer();
  renderUploadTab({ 'POST /api/projects': json(201, sourceless) });
  chooseFile(zipFile('.zip'));
  await screen.findByLabelText('Project name');

  await waitFor(() => {
    expect(uploadButton().getAttribute('title')).toBe('Enter a project name.');
  });
  fireEvent.submit(nameField().closest('form') ?? document.body);
  expect(server.requests).toHaveLength(0);
});

it('RF-128 leaving the tab while the zip goes out cancels the upload', async () => {
  const server = installFakeUploadServer();
  renderUploadTab({ 'POST /api/projects': json(201, sourceless) });
  await chooseValid();
  await sendOne(server);

  fireEvent.click(screen.getByRole('tab', { name: 'GitHub repository' }));

  expect(server.pending().wasAborted()).toBe(true);
});

it('RF-134 a limit that arrives after the file was chosen is applied to it', async () => {
  installFakeUploadServer();
  let release: (answer: Response) => void = () => undefined;
  const late = new Promise<Response>((resolve) => {
    release = resolve;
  });
  renderUploadTab({ 'GET /api/session': () => late });
  chooseFile(sizedFile('mid.zip', 300_000_000));
  await waitFor(() => {
    expect(uploadButton().hasAttribute('disabled')).toBe(false);
  });

  release(
    json(200, {
      user: { id: 'u-1', userName: 'ana', displayName: 'Ana', role: 'user', state: 'Active' },
      csrfToken: 'csrf-0',
      uploadMaxMb: 100,
    }),
  );

  expect((await screen.findByTestId('field-error')).textContent).toContain('limit is 100 MB');
  expect(uploadButton().hasAttribute('disabled')).toBe(true);
});
