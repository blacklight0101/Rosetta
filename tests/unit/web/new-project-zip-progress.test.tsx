import { screen, waitFor } from '@testing-library/preact';
import { afterEach, expect, it, vi } from 'vitest';
import { failure, json } from './fake-api.js';
import { installFakeUploadServer } from './fake-upload-server.js';
import { chooseValid, renderUploadTab, sendOne, sourceless } from './zip-fixtures.js';

// RF-159, DEC-183: a zip that holds workbooks shows the same progress as a batch of workbooks once it
// is sent: the page asks the server how it reads them, every second.

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.history.pushState({}, '', '/');
});

const reading = {
  elapsedMs: 5000,
  progress: { step: 'rendering', workbook: 1, workbooks: 2, sheet: 2, sheets: 6, cells: 300 },
};

it('RF-159 shows the steps, the workbook and sheet and the cells while the server reads the workbooks of the zip', async () => {
  const server = installFakeUploadServer();
  let reads = 0;
  renderUploadTab({
    'POST /api/projects': json(201, sourceless),
    'GET /api/projects/p-9/source/progress': () => {
      reads += 1;
      return reads === 1 ? failure(404, 'RST-2003') : json(200, reading);
    },
  });
  await chooseValid();
  await sendOne(server);

  server.pending().progress(200, 200);

  await waitFor(() => {
    expect(screen.getByTestId('processing-detail').textContent).toContain(
      'Workbook 1 of 2, sheet 2 of 6. 300 cells read.',
    );
  });
  expect(screen.getByText('Rendering sheets').dataset['state']).toBe('current');
  expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
});

it('RF-159 keeps the upload bar when the zip holds no workbooks', async () => {
  const server = installFakeUploadServer();
  renderUploadTab({
    'POST /api/projects': json(201, sourceless),
    'GET /api/projects/p-9/source/progress': json(200, { elapsedMs: 900, progress: null }),
  });
  await chooseValid();
  await sendOne(server);

  server.pending().progress(200, 200);

  const bar = await screen.findByRole('progressbar', { name: 'Upload progress' });
  expect(bar.getAttribute('aria-valuenow')).toBe('100');
  expect(screen.queryByTestId('processing')).toBeNull();
});
