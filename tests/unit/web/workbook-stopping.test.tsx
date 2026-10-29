import { fireEvent, screen } from '@testing-library/preact';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { failure, json } from './fake-api.js';
import { installFakeUploadServer } from './fake-upload-server.js';
import {
  chooseValid,
  happyAnswers,
  renderWorkbookTab,
  sendAll,
  stateRoute,
} from './workbook-fixtures.js';

// RF-159, DEC-188, design-system.md "Processing progress": while the Cancel request waits (it answers
// only when the work has ended, up to the time limit of the attach) the button reads "Stopping..." and is
// disabled; a request that fails gives the Cancel button back.

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const rendering = {
  ...{ step: 'rendering', workbook: 2, workbooks: 3, sheet: 4, sheets: 9, cells: 1200 },
};
const reading = () =>
  json(200, {
    ...{ batchId: 'b-1', phase: 'processing', files: 3, elapsedMs: 3000 },
    progress: rendering,
  });

it('RF-159 shows Stopping... with Cancel disabled while the Cancel request waits, then the outcome', async () => {
  const server = installFakeUploadServer();
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  renderWorkbookTab({
    ...happyAnswers(),
    [`GET ${stateRoute}`]: reading,
    [`DELETE ${stateRoute}`]: async () => {
      await held;
      return new Response(null, { status: 204 });
    },
  });
  await chooseValid();
  await sendAll(server);
  await screen.findByTestId('processing-detail');

  fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

  const stopping = await screen.findByRole('button', { name: /Stopping/u });
  expect(stopping.hasAttribute('disabled')).toBe(true);
  expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
  release();
  expect((await screen.findByRole('alert')).textContent).toContain('Nothing was published');
});

it('RF-159 a Cancel request that fails gives the Cancel button back', async () => {
  const server = installFakeUploadServer();
  renderWorkbookTab({
    ...happyAnswers(),
    [`GET ${stateRoute}`]: reading,
    [`DELETE ${stateRoute}`]: failure(500, 'RST-5000'),
  });
  await chooseValid();
  await sendAll(server);
  await screen.findByTestId('processing-detail');

  fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

  const again = await screen.findByRole('button', { name: 'Cancel' });
  expect(again.hasAttribute('disabled')).toBe(false);
  expect(screen.queryByRole('button', { name: /Stopping/u })).toBeNull();
});
