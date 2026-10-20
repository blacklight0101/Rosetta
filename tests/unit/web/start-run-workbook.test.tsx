import { fireEvent, screen, waitFor } from '@testing-library/preact';
import { afterEach, expect, it, vi } from 'vitest';
import { json } from './fake-api.js';
import { installFakeUploadServer } from './fake-upload-server.js';
import { projectOf } from './project-fixtures.js';
import { projectPath } from './start-run-fixtures.js';
import { ready, renderStart, start } from './start-run-helpers.js';
import {
  answerFile,
  chooseFiles,
  finishedBody,
  sendButton,
  workbookFile,
} from './workbook-fixtures.js';

// RF-150, RF-128, RFC-005 section 4.9: the start page of a project of kind `workbook`. It shows the
// source card (name, workbook count, date) instead of the GitHub address, holds Start off while no
// batch is stored, and stores a new batch in the same card.

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.pushState({}, '', '/');
});

const stored = {
  fileName: 'Pricing.xlsx',
  uploadedAt: '2026-10-19T08:00:00.000Z',
  workbooks: 3,
};
const book = (source: unknown): Response =>
  json(200, projectOf('p-1', 'Pricing', { sourceKind: 'workbook', sourceUrl: '', source }));

it('RF-150 a workbook project shows its source card and no GitHub address or Resolve', async () => {
  renderStart({ [`GET ${projectPath}`]: book(stored) });
  await ready();

  expect(screen.getByRole('heading', { name: 'Source' })).not.toBeNull();
  expect(screen.getByText('Pricing (Excel, 3 workbooks, 19 Oct 2026)')).not.toBeNull();
  expect(screen.getByText(/holds Excel workbooks/u)).not.toBeNull();
  expect(screen.queryByLabelText(/GitHub repository URL/u)).toBeNull();
  expect(screen.queryByRole('button', { name: /Resolve/u })).toBeNull();
  expect(screen.getByLabelText('Workbook files')).not.toBeNull();
  expect(start().disabled).toBe(false);
});

it('RF-150 a workbook project with no source says to upload workbooks and holds Start off', async () => {
  renderStart({ [`GET ${projectPath}`]: book(null) });
  await ready();

  expect(screen.getByText(/has no source\. Upload workbooks to start\./u)).not.toBeNull();
  expect(start().disabled).toBe(true);
  expect(start().title).toContain('Upload workbooks first');
});

it('RF-150 storing workbooks in the card opens Start and updates the label', async () => {
  const server = installFakeUploadServer();
  renderStart({
    [`GET ${projectPath}`]: book(null),
    'POST /api/projects/p-1/source/batches': json(201, { batchId: 'b-1' }),
    'POST /api/projects/p-1/source/batches/b-1/finish': json(201, finishedBody),
  });
  await ready();
  chooseFiles(workbookFile('Pricing.xlsx'), workbookFile('Costs.xlsm'));
  await waitFor(() => {
    expect(sendButton().hasAttribute('disabled')).toBe(false);
  });
  fireEvent.click(sendButton());
  await answerFile(server, 1);
  await answerFile(server, 2);

  await screen.findByText(/3 workbooks read/u);
  expect(start().disabled).toBe(false);
  expect(screen.getByText('Pricing (Excel, 3 workbooks, 19 Oct 2026)')).not.toBeNull();
});
