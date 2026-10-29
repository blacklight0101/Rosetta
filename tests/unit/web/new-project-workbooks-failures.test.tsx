import { fireEvent, screen, waitFor } from '@testing-library/preact';
import { afterEach, expect, it, vi } from 'vitest';
import { failure, json } from './fake-api.js';
import { installFakeUploadServer } from './fake-upload-server.js';
import {
  acceptedBody,
  answerFile,
  batchRoute,
  chooseValid,
  finishRoute,
  happyAnswers,
  posts,
  renderWorkbookTab,
  sendAll,
  sendButton,
  stateRoute,
  storedState,
} from './workbook-fixtures.js';

// RF-150, RF-158, RFC-005 section 4.2: what the Excel workbooks tab does when the project, the batch,
// a file or the finish call fails: the reason is shown, the project is kept, and Upload again goes
// on in the same batch when it is still open and starts a new one when it is not.

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.pushState({}, '', '/');
});

const tooBig = {
  code: 'RST-1912',
  message: 'The files are larger than the limit.',
  nextStep: 'Remove files that are not part of the system.',
};

it('RF-150 a failure on the second of three files names the reason, stops there and offers Upload again', async () => {
  const server = installFakeUploadServer();
  const view = renderWorkbookTab(happyAnswers());
  await chooseValid();

  fireEvent.click(sendButton());
  await answerFile(server, 1);
  await answerFile(server, 2, 422, {
    code: 'RST-1921',
    message: 'Costs.xlsm is an older Excel format.',
    nextStep: 'Open the file in Excel and save it as .xlsx.',
  });

  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain('RST-1921');
  expect(alert.textContent).toContain('Costs.xlsm is an older Excel format.');
  const items = screen.getAllByRole('listitem').map((item) => item.textContent);
  expect(items.some((text) => text.startsWith('Pricing.xlsx') && text.endsWith('Sent'))).toBe(true);
  expect(items.some((text) => text.startsWith('Costs.xlsm') && text.endsWith('Failed'))).toBe(true);
  expect(items.some((text) => text.startsWith('Rates.xlsx') && text.endsWith('Not sent'))).toBe(
    true,
  );
  expect(server.requests).toHaveLength(2);
  expect(posts(view)).not.toContain(finishRoute);
  expect(screen.getByText(/has no source yet/u)).not.toBeNull();
  expect(sendButton().textContent).toBe('Upload again');
});

it('RF-150 Upload again after a failed file goes on in the same batch from the failed file, one project, one batch', async () => {
  const server = installFakeUploadServer();
  const view = renderWorkbookTab(happyAnswers());
  await chooseValid();
  fireEvent.click(sendButton());
  await answerFile(server, 1);
  await answerFile(server, 2, 413, tooBig);
  await screen.findByRole('alert');

  fireEvent.click(sendButton());
  await answerFile(server, 3);
  await answerFile(server, 4);

  await screen.findByText(/3 workbooks read/u);
  expect(server.requests.map((request) => request.headers['x-file-name'])).toEqual([
    'Pricing.xlsx',
    'Costs.xlsm',
    'Costs.xlsm',
    'Rates.xlsx',
  ]);
  expect(posts(view)).toEqual(['/api/projects', batchRoute, finishRoute]);
});

it('RF-150 a network loss on a file offers Upload again', async () => {
  const server = installFakeUploadServer();
  renderWorkbookTab(happyAnswers());
  await chooseValid();
  fireEvent.click(sendButton());
  await waitFor(() => {
    expect(server.requests).toHaveLength(1);
  });

  server.pending().failNetwork();

  expect((await screen.findByRole('alert')).textContent).toContain('RST-2009');
  expect(sendButton().textContent).toBe('Upload again');
});

it('RF-150 a refused batch (one workbook refused at finish) names the file and reason and Upload again starts a new batch with every file', async () => {
  const server = installFakeUploadServer();
  let finishes = 0;
  const view = renderWorkbookTab({
    ...happyAnswers(),
    [`POST ${finishRoute}`]: json(202, acceptedBody),
    [`GET ${stateRoute}`]: () => {
      finishes += 1;
      return finishes === 1
        ? json(200, {
            ...{ batchId: 'b-1', phase: 'refused', files: 3, elapsedMs: 900 },
            refusal: {
              ...{ status: 422, code: 'RST-1922' },
              message: 'Costs.xlsm is password-protected.',
              nextStep: 'Remove the password in Excel and upload again.',
            },
          })
        : json(200, storedState());
    },
  });
  await chooseValid();
  await sendAll(server);

  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain('Costs.xlsm is password-protected.');
  expect(alert.textContent).toContain('Remove the password in Excel and upload again.');
  expect(screen.getByText(/has no source yet/u)).not.toBeNull();
  const items = screen.getAllByRole('listitem').map((item) => item.textContent);
  expect(items.filter((text) => text.endsWith('Not sent'))).toHaveLength(3);

  fireEvent.click(sendButton());
  await answerFile(server, 4);
  await answerFile(server, 5);
  await answerFile(server, 6);

  await screen.findByText(/3 workbooks read/u);
  expect(posts(view)).toEqual(['/api/projects', batchRoute, finishRoute, batchRoute, finishRoute]);
  expect(server.requests).toHaveLength(6);
});

it('RF-150 choosing other files after a failure keeps the project: one POST /api/projects, a new batch for the new set', async () => {
  const server = installFakeUploadServer();
  const view = renderWorkbookTab(happyAnswers());
  await chooseValid();
  fireEvent.click(sendButton());
  await answerFile(server, 1);
  await answerFile(server, 2, 413, tooBig);
  await screen.findByRole('alert');

  await chooseValid('Other.xlsx');
  fireEvent.click(sendButton());
  await answerFile(server, 3);

  await waitFor(() => {
    expect(posts(view).filter((path) => path === finishRoute)).toHaveLength(1);
  });
  expect(posts(view).filter((path) => path === '/api/projects')).toHaveLength(1);
  expect(posts(view).filter((path) => path === batchRoute)).toHaveLength(2);
  expect(server.requests.at(-1)?.headers['x-file-name']).toBe('Other.xlsx');
});

it('RF-150 a refused project creation shows the refusal, sends nothing else and the button still says Upload workbooks', async () => {
  const server = installFakeUploadServer();
  const view = renderWorkbookTab({
    ...happyAnswers(),
    'POST /api/projects': failure(422, 'RST-1900'),
  });
  await chooseValid();

  fireEvent.click(sendButton());

  expect((await screen.findByRole('alert')).textContent).toContain('RST-1900');
  expect(server.requests).toHaveLength(0);
  expect(posts(view)).toEqual(['/api/projects']);
  expect(sendButton().textContent).toBe('Upload workbooks');
  expect(screen.queryByText(/has no source/u)).toBeNull();
});

it('RF-150 a refused batch (one batch at a time) shows the refusal and sends no file', async () => {
  const server = installFakeUploadServer();
  renderWorkbookTab({ ...happyAnswers(), [`POST ${batchRoute}`]: failure(409, 'RST-1919') });
  await chooseValid();

  fireEvent.click(sendButton());

  expect((await screen.findByRole('alert')).textContent).toContain('RST-1919');
  expect(server.requests).toHaveLength(0);
  expect(sendButton().textContent).toBe('Upload again');
});

it('RNF-010 after a failure focus goes to the error alert, not to the page body', async () => {
  const server = installFakeUploadServer();
  renderWorkbookTab(happyAnswers());
  await chooseValid();
  fireEvent.click(sendButton());
  await answerFile(server, 1);
  await answerFile(server, 2, 413, tooBig);

  const alert = await screen.findByRole('alert');

  await waitFor(() => {
    expect(document.activeElement).toBe(alert);
  });
});
