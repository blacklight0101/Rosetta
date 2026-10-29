import { fireEvent, screen, waitFor } from '@testing-library/preact';
import { afterEach, expect, it, vi } from 'vitest';
import { json } from './fake-api.js';
import { installFakeUploadServer } from './fake-upload-server.js';
import { projectOf } from './project-fixtures.js';
import { projectPath } from './start-run-fixtures.js';
import { ready, renderStart } from './start-run-helpers.js';
import {
  answerFile,
  chooseFiles,
  acceptedBody,
  finishedBody,
  storedState,
  sendButton,
  workbookFile,
} from './workbook-fixtures.js';

// RF-150, RF-128, P3-55: a replacing batch on the start page of a workbook project shows or takes
// away "The code changed since the last run." at once, from the flag the finish answer carries,
// the way the zip form does, without the page being opened again.

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.pushState({}, '', '/');
});

const notice = 'The code changed since the last run.';
const stored = { fileName: 'Pricing.xlsx', uploadedAt: '2026-10-19T08:00:00.000Z', workbooks: 3 };
const book = (codeChangedSinceLastRun: boolean): Response =>
  json(
    200,
    projectOf('p-1', 'Pricing', {
      sourceKind: 'workbook',
      sourceUrl: '',
      source: stored,
      codeChangedSinceLastRun,
    }),
  );

async function replaceBatch(changed: boolean, finish: Record<string, unknown>): Promise<void> {
  const server = installFakeUploadServer();
  renderStart({
    [`GET ${projectPath}`]: book(changed),
    'POST /api/projects/p-1/source/batches': json(201, { batchId: 'b-1' }),
    'POST /api/projects/p-1/source/batches/b-1/finish': json(202, acceptedBody),
    'GET /api/projects/p-1/source/batches/b-1': json(
      200,
      storedState({ ...finishedBody, ...finish }),
    ),
  });
  await ready();
  expect(screen.queryByText(notice) !== null).toBe(changed);
  chooseFiles(workbookFile('Pricing.xlsx'));
  await waitFor(() => {
    expect(sendButton().hasAttribute('disabled')).toBe(false);
  });
  fireEvent.click(sendButton());
  await answerFile(server, 1);
  await screen.findByText(/workbooks? read/u);
}

it('RF-150 a replacing batch shows the notice at once, without opening the page again', async () => {
  await replaceBatch(false, { codeChangedSinceLastRun: true });

  expect(screen.getByText(notice)).not.toBeNull();
});

it('RF-150 a batch of the same code the last run read takes the notice away', async () => {
  await replaceBatch(true, { codeChangedSinceLastRun: false });

  expect(screen.queryByText(notice)).toBeNull();
});

it('RF-150 an answer that does not say whether the code changed leaves the notice as it was', async () => {
  await replaceBatch(true, {});

  expect(screen.getByText(notice)).not.toBeNull();
});
