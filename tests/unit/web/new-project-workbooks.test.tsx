import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, expect, it, vi } from 'vitest';
import { failure, json } from './fake-api.js';
import { installFakeUploadServer } from './fake-upload-server.js';
import { overviewRow, projectOf } from './project-fixtures.js';
import {
  answerFile,
  batchRoute,
  chooseFiles,
  chooseValid,
  filesRoute,
  finishedBody,
  finishRoute,
  formOf,
  happyAnswers,
  renderWorkbookTab,
  sendButton,
  workbookFile,
} from './workbook-fixtures.js';

// RF-150, RF-158, RFC-005 sections 4.2 and 4.9: the Excel workbooks tab of the New project form
// against a fake server: the project, a batch, one request per file, then finish. The refusals before
// sending are in workbook-checks.test.tsx.

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.pushState({}, '', '/');
});

const tooBig = {
  code: 'RST-1912',
  message: 'The files are larger than the limit.',
  nextStep: 'Remove files that are not part of the system.',
};

const posts = (view: { readonly calls: readonly { readonly method: string; path: string }[] }) =>
  view.calls.filter((call) => call.method === 'POST').map((call) => call.path);

async function sendAll(
  server: ReturnType<typeof installFakeUploadServer>,
  count = 3,
): Promise<void> {
  fireEvent.click(sendButton());
  for (let index = 1; index <= count; index += 1) await answerFile(server, index);
}

it('RF-150 the form has the tabs GitHub repository, Upload a zip and Excel workbooks', () => {
  renderWorkbookTab();

  expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
    'GitHub repository',
    'Upload a zip',
    'Excel workbooks',
  ]);
  fireEvent.click(screen.getByRole('tab', { name: 'GitHub repository' }));
  expect(screen.getByLabelText('GitHub repository URL')).not.toBeNull();
  expect(screen.queryByLabelText('Workbook files')).toBeNull();
});

it('RF-150 makes a workbook project named after the first file, then a batch, one request per file, then finish', async () => {
  const server = installFakeUploadServer();
  const view = renderWorkbookTab(happyAnswers());
  await chooseValid('Price list (2026).xlsx', 'Costs.xlsm', 'Rates.xlsx');
  expect(screen.getByLabelText<HTMLInputElement>('Project name').value).toBe('Price list (2026)');

  await sendAll(server);

  await screen.findByText(/3 workbooks read/u);
  expect(view.calls.filter((call) => call.method === 'POST')).toEqual([
    {
      method: 'POST',
      path: '/api/projects',
      csrf: 'csrf-0',
      body: { sourceKind: 'workbook', name: 'Price list (2026)' },
    },
    { method: 'POST', path: batchRoute, csrf: 'csrf-0', body: undefined },
    { method: 'POST', path: finishRoute, csrf: 'csrf-0', body: undefined },
  ]);
  expect(server.requests.map((request) => `${request.method} ${request.path}`)).toEqual([
    `PUT ${filesRoute}`,
    `PUT ${filesRoute}`,
    `PUT ${filesRoute}`,
  ]);
  expect(server.requests.map((request) => request.headers['x-file-name'])).toEqual([
    encodeURIComponent('Price list (2026).xlsx'),
    'Costs.xlsm',
    'Rates.xlsx',
  ]);
  expect(server.requests[0]?.headers['x-csrf-token']).toBe('csrf-0');
  expect(server.requests[0]?.body).toBeInstanceOf(File);
});

it('RF-150 the project name is editable and the edited name is the one created', async () => {
  const server = installFakeUploadServer();
  const view = renderWorkbookTab(happyAnswers());
  await chooseValid();

  fireEvent.input(screen.getByLabelText('Project name'), { target: { value: 'Order desk 2' } });
  fireEvent.click(sendButton());
  await answerFile(server, 1);

  expect(
    view.calls.find((call) => call.path === '/api/projects' && call.method === 'POST')?.body,
  ).toEqual({
    sourceKind: 'workbook',
    name: 'Order desk 2',
  });
});

it('RF-150 a name of spaces falls back to the first file name; nothing is sent without any name', async () => {
  const server = installFakeUploadServer();
  const view = renderWorkbookTab(happyAnswers());
  await chooseValid('Pricing.xlsx');

  fireEvent.input(screen.getByLabelText('Project name'), { target: { value: '   ' } });
  fireEvent.click(sendButton());
  await answerFile(server, 1);

  expect(
    view.calls.find((call) => call.path === '/api/projects' && call.method === 'POST')?.body,
  ).toEqual({
    sourceKind: 'workbook',
    name: 'Pricing',
  });
});

it('RF-150 a file named only .xlsx has no name to start from, so nothing is sent until one is typed', async () => {
  const server = installFakeUploadServer();
  const view = renderWorkbookTab(happyAnswers());
  await chooseValid('.xlsx');

  expect(sendButton().getAttribute('title')).toBe('Enter a project name.');
  fireEvent.submit(formOf());

  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(server.requests).toHaveLength(0);
  expect(posts(view)).toEqual([]);
});

it('RF-150 shows the progress per file while the files go out, one at a time', async () => {
  const server = installFakeUploadServer();
  renderWorkbookTab(happyAnswers());
  await chooseValid();
  fireEvent.click(sendButton());
  await waitFor(() => {
    expect(server.requests).toHaveLength(1);
  });

  server.pending().progress(50, 200);

  const bar = await screen.findByRole('progressbar', { name: 'Upload progress' });
  expect(bar.getAttribute('aria-valuenow')).toBe('25');
  expect(bar.getAttribute('aria-valuetext')).toBe('File 1 of 3: 25% sent');
  const items = screen.getAllByRole('listitem').map((item) => item.textContent);
  expect(
    items.some((text) => text.startsWith('Pricing.xlsx') && text.endsWith('Sending 25%')),
  ).toBe(true);
  expect(items.some((text) => text.startsWith('Costs.xlsm') && text.endsWith('Waiting'))).toBe(
    true,
  );
  expect(sendButton().hasAttribute('disabled')).toBe(true);

  server.pending().respond(201, { name: 'Pricing.xlsx', size: 1 });
  await waitFor(() => {
    expect(server.requests).toHaveLength(2);
  });
  const after = screen.getAllByRole('listitem').map((item) => item.textContent);
  expect(after.some((text) => text.startsWith('Pricing.xlsx') && text.endsWith('Sent'))).toBe(true);
  expect(screen.getByRole('progressbar').getAttribute('aria-valuetext')).toBe(
    'File 2 of 3: 0% sent',
  );
});

it('RF-150 the summary lists each workbook with its sheets, cells, formulas and macro modules, and what was left out', async () => {
  const server = installFakeUploadServer();
  renderWorkbookTab(happyAnswers());
  await chooseValid();

  await sendAll(server);

  const summary = (await screen.findByText(/3 workbooks read/u)).closest('div');
  if (summary === null) throw new Error('The summary has no box.');
  const text = within(summary)
    .getAllByRole('listitem')
    .map((item) => item.textContent);
  expect(text).toContain('Pricing.xlsx: 4 sheets, 1200 cells, 310 formulas, 0 macro modules.');
  expect(text).toContain('Costs.xlsm: 2 sheets, 90 cells, 12 formulas, 3 macro modules.');
  expect(text).toContain('Rates.xlsx: 1 sheet, 40 cells, 0 formulas, 0 macro modules.');
  expect(summary.textContent).toContain('1 item left out');
  expect(text).toContain('Costs.xlsm: Macro module Module9 is locked and was not read.');
  expect(within(summary).getByRole('link', { name: 'Start a run' }).getAttribute('href')).toBe(
    '/projects/p-9/start',
  );
});

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
    [`POST ${finishRoute}`]: () => {
      finishes += 1;
      return finishes === 1
        ? json(422, {
            code: 'RST-1922',
            message: 'Costs.xlsm is password-protected.',
            nextStep: 'Remove the password in Excel and upload again.',
          })
        : json(201, finishedBody);
    },
  });
  await chooseValid();
  await sendAll(server);

  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain('Costs.xlsm is password-protected.');
  expect(alert.textContent).toContain('Remove the password in Excel and upload again.');
  expect(screen.getByText(/has no source yet/u)).not.toBeNull();

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

it('RF-150 pressing submit twice while the files go out starts one upload', async () => {
  const server = installFakeUploadServer();
  const view = renderWorkbookTab(happyAnswers());
  await chooseValid();
  fireEvent.click(sendButton());
  await waitFor(() => {
    expect(server.requests).toHaveLength(1);
  });

  fireEvent.submit(formOf());

  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(server.requests).toHaveLength(1);
  expect(posts(view)).toEqual(['/api/projects', batchRoute]);
});

it('RF-150 leaving the tab while a file is going out stops that upload', async () => {
  const server = installFakeUploadServer();
  renderWorkbookTab(happyAnswers());
  await chooseValid();
  fireEvent.click(sendButton());
  await waitFor(() => {
    expect(server.requests).toHaveLength(1);
  });

  fireEvent.click(screen.getByRole('tab', { name: 'GitHub repository' }));

  expect(server.pending().wasAborted()).toBe(true);
});

it('RF-150 the new project appears in the list as name (Excel, N workbooks, date) once the batch is finished', async () => {
  const server = installFakeUploadServer();
  let stored = false;
  const stored3 = projectOf('p-9', 'Pricing', {
    sourceUrl: '',
    sourceKind: 'workbook',
    source: {
      fileName: 'Pricing.xlsx',
      uploadedAt: '2026-10-19T08:00:00.000Z',
      workbookCount: 3,
    },
  });
  renderWorkbookTab({
    ...happyAnswers(),
    'GET /api/projects/overview': () =>
      json(200, {
        projects: stored ? [overviewRow(stored3)] : [],
        truncated: false,
      }),
  });
  await chooseValid();
  fireEvent.click(sendButton());
  await answerFile(server, 1);
  await answerFile(server, 2);
  stored = true;
  await answerFile(server, 3);

  const row = (await screen.findByText('Pricing (Excel, 3 workbooks, 19 Oct 2026)')).closest('tr');
  expect(row).not.toBeNull();
  expect(within(row ?? document.body).queryByText(/github/iu)).toBeNull();
});

it('RF-150 an unreadable finish answer is not taken for a stored batch', async () => {
  const server = installFakeUploadServer();
  renderWorkbookTab({
    ...happyAnswers(),
    [`POST ${finishRoute}`]: json(201, { workbooks: 'many' }),
  });
  await chooseValid();

  await sendAll(server);

  expect((await screen.findByRole('alert')).textContent).toContain('RST-');
  expect(screen.queryByText(/workbooks? read/u)).toBeNull();
});

it('RF-150 choosing files again after a stored batch clears the summary', async () => {
  const server = installFakeUploadServer();
  renderWorkbookTab(happyAnswers());
  await chooseValid();
  await sendAll(server);
  await screen.findByText(/3 workbooks read/u);

  chooseFiles(workbookFile('More.xlsx'));

  await waitFor(() => {
    expect(screen.queryByText(/3 workbooks read/u)).toBeNull();
  });
});
