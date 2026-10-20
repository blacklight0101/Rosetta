import { fireEvent, screen, waitFor } from '@testing-library/preact';
import { afterEach, expect, it, vi } from 'vitest';
import { empty, json } from './fake-api.js';
import { installFakeUploadServer } from './fake-upload-server.js';
import {
  answerFile,
  batchRoute,
  chooseFiles,
  chooseValid,
  happyAnswers,
  posts,
  renderWorkbookTab,
  sendButton,
  workbookFile,
} from './workbook-fixtures.js';

// RF-150, RF-151, DEC-149: the page uses the file limit the server reports, drops a batch the server
// no longer has, and cancels an open batch it will not use again, so the user is never blocked by
// RST-1919 for the 30 minutes a batch stays open.

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.pushState({}, '', '/');
});

const sessionWith = (workbookMaxFiles: number): Response =>
  json(200, {
    user: { id: 'u-1', userName: 'ana', displayName: 'Ana', role: 'user', state: 'Active' },
    csrfToken: 'csrf-0',
    uploadMaxMb: 100,
    workbookMaxFiles,
  });

const deletes = (view: {
  readonly calls: readonly { readonly method: string; readonly path: string }[];
}): string[] => view.calls.filter((call) => call.method === 'DELETE').map((call) => call.path);

it('RF-151 the file limit of the session replaces the built-in 20', async () => {
  renderWorkbookTab({ 'GET /api/session': sessionWith(2) });

  chooseFiles(workbookFile('A.xlsx'), workbookFile('B.xlsx'), workbookFile('C.xlsx'));

  const problem = await screen.findByText(/3 files chosen. Upload at most 2 workbooks/u);
  expect(problem).not.toBeNull();
  expect(sendButton().hasAttribute('disabled')).toBe(true);
});

it('RF-151 twenty-one files are accepted when the session allows thirty', async () => {
  renderWorkbookTab({ 'GET /api/session': sessionWith(30) });
  const names = Array.from({ length: 21 }, (_, index) => `Book${String(index)}.xlsx`);

  chooseFiles(...names.map((name) => workbookFile(name)));

  await waitFor(() => {
    expect(sendButton().hasAttribute('disabled')).toBe(false);
  });
});

it('RF-150 a batch the server no longer has (404) is dropped: Upload again opens a new one', async () => {
  const server = installFakeUploadServer();
  const view = renderWorkbookTab(happyAnswers());
  await chooseValid();
  fireEvent.click(sendButton());
  await answerFile(server, 1);
  await answerFile(server, 2, 404, { code: 'RST-1007', message: 'Not found.', nextStep: 'Retry.' });
  await screen.findByRole('alert');

  fireEvent.click(sendButton());

  await waitFor(() => {
    expect(posts(view).filter((path) => path === batchRoute)).toHaveLength(2);
  });
});

it('RF-150 an open batch the files no longer fit is cancelled before a new one is opened', async () => {
  const server = installFakeUploadServer();
  const view = renderWorkbookTab({
    ...happyAnswers(),
    [`DELETE ${batchRoute}/b-1`]: empty(204),
  });
  await chooseValid();
  fireEvent.click(sendButton());
  await answerFile(server, 1);
  await answerFile(server, 2, 422, { code: 'RST-1921', message: 'Old.', nextStep: 'Save again.' });
  await screen.findByRole('alert');
  await chooseValid('Other.xlsx', 'More.xlsx');

  fireEvent.click(sendButton());

  await waitFor(() => {
    expect(deletes(view)).toEqual([`${batchRoute}/b-1`]);
  });
  await waitFor(() => {
    expect(posts(view).filter((path) => path === batchRoute)).toHaveLength(2);
  });
});

it('RF-150 a batch that is reused is not cancelled', async () => {
  const server = installFakeUploadServer();
  const view = renderWorkbookTab(happyAnswers());
  await chooseValid();
  fireEvent.click(sendButton());
  await answerFile(server, 1);
  await answerFile(server, 2, 422, { code: 'RST-1921', message: 'Old.', nextStep: 'Save again.' });
  await screen.findByRole('alert');

  fireEvent.click(sendButton());
  await answerFile(server, 3);

  expect(deletes(view)).toEqual([]);
  expect(posts(view).filter((path) => path === batchRoute)).toHaveLength(1);
});
