import { fireEvent, screen, waitFor } from '@testing-library/preact';
import { afterEach, expect, it, vi } from 'vitest';
import { installFakeUploadServer } from './fake-upload-server.js';
import {
  chooseFiles,
  chooseValid,
  formOf,
  happyAnswers,
  renderWorkbookTab,
  sendButton,
  sessionWithLimit,
  workbookFile,
} from './workbook-fixtures.js';

// RF-158, RF-150, RNF-010: what the Excel workbooks tab checks before anything is sent: the type
// (with the save-as message for .xls), the count, the total size, an empty file and repeated names;
// plus the keyboard and the names that hold HTML.

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.pushState({}, '', '/');
});

const megabyte = 1024 * 1024;

async function refusalOf(...files: File[]): Promise<string> {
  const server = installFakeUploadServer();
  const view = renderWorkbookTab(happyAnswers());
  chooseFiles(...files);

  const shown = await screen.findByTestId('field-error');
  expect(screen.getByLabelText('Workbook files').getAttribute('aria-invalid')).toBe('true');
  expect(sendButton().hasAttribute('disabled')).toBe(true);
  expect(server.requests).toHaveLength(0);
  expect(view.calls.filter((call) => call.method === 'POST')).toHaveLength(0);
  const list = document.getElementById('workbook-problems');
  return `${shown.textContent} ${list?.textContent ?? ''}`;
}

it('RF-158 the tab states the accepted types, the total size and the count in one line', async () => {
  renderWorkbookTab();

  expect(
    await screen.findByText('Accepted: .xlsx and .xlsm. At most 20 files and 500 MB in all.'),
  ).not.toBeNull();
});

it('RF-158 the size in the line is the one the server reports', async () => {
  renderWorkbookTab({ 'GET /api/session': sessionWithLimit(100) });

  expect(
    await screen.findByText('Accepted: .xlsx and .xlsm. At most 20 files and 100 MB in all.'),
  ).not.toBeNull();
});

it('RF-158 an .xls is refused before sending, with how to save it as .xlsx', async () => {
  const text = await refusalOf(workbookFile('Old prices.xls'));

  expect(text).toContain('Old prices.xls');
  expect(text).toContain(
    'Open the file in Excel and save it as .xlsx (or .xlsm if it has macros).',
  );
});

it('RF-158 an .xlsb is refused with the same save-as message', async () => {
  expect(await refusalOf(workbookFile('Binary.xlsb'))).toContain('save it as .xlsx');
});

it('RF-158 a file of another type is refused by name and told what to choose', async () => {
  const text = await refusalOf(workbookFile('data.csv'));

  expect(text).toContain('data.csv');
  expect(text).toContain('Choose files ending in .xlsx or .xlsm.');
});

it('RF-158 the extension check ignores case', async () => {
  installFakeUploadServer();
  renderWorkbookTab();

  await chooseValid('LOUD.XLSX', 'Macros.XlSm');

  expect(screen.queryByTestId('field-error')).toBeNull();
});

it('RF-158 21 files are refused before sending, 20 are accepted', async () => {
  const names = Array.from({ length: 21 }, (_, index) => `Book ${String(index + 1)}.xlsx`);
  const text = await refusalOf(...names.map((name) => workbookFile(name)));
  expect(text).toContain('21 files');
  expect(text).toContain('at most 20 workbooks');
  expect(text).toContain('split them into projects');

  chooseFiles(...names.slice(0, 20).map((name) => workbookFile(name)));
  await waitFor(() => {
    expect(sendButton().hasAttribute('disabled')).toBe(false);
  });
});

it('RF-158 a total one byte over the limit is refused, a total at the limit is accepted', async () => {
  installFakeUploadServer();
  renderWorkbookTab({ ...happyAnswers(), 'GET /api/session': sessionWithLimit(1) });
  await screen.findByText('Accepted: .xlsx and .xlsm. At most 20 files and 1 MB in all.');

  chooseFiles(workbookFile('A.xlsx', megabyte - 10), workbookFile('B.xlsx', 11));
  expect((await screen.findByTestId('field-error')).textContent).toMatch(/limit is 1 MB/u);
  expect(sendButton().hasAttribute('disabled')).toBe(true);

  chooseFiles(workbookFile('A.xlsx', megabyte - 10), workbookFile('B.xlsx', 10));
  await waitFor(() => {
    expect(sendButton().hasAttribute('disabled')).toBe(false);
  });
  expect(screen.queryByTestId('field-error')).toBeNull();
});

it('RF-158 a limit that arrives after the files were chosen is applied to them', async () => {
  installFakeUploadServer();
  let release: (answer: Response) => void = () => undefined;
  const session = new Promise<Response>((resolve) => {
    release = resolve;
  });
  renderWorkbookTab({ ...happyAnswers(), 'GET /api/session': () => session });
  chooseFiles(workbookFile('Big.xlsx', 300 * megabyte));
  await waitFor(() => {
    expect(sendButton().hasAttribute('disabled')).toBe(false);
  });

  release(sessionWithLimit(100));

  expect((await screen.findByTestId('field-error')).textContent).toMatch(/limit is 100 MB/u);
  expect(sendButton().hasAttribute('disabled')).toBe(true);
});

it('RF-158 a 0-byte file is refused by name as empty', async () => {
  const text = await refusalOf(workbookFile('Fine.xlsx'), new File([], 'Nothing.xlsx'));

  expect(text).toContain('Nothing.xlsx is empty');
  expect(text).not.toContain('Fine.xlsx');
});

it('RF-158 two files with the same name, case ignored, are refused before sending', async () => {
  const text = await refusalOf(workbookFile('Pricing.xlsx'), workbookFile('PRICING.XLSX'));

  expect(text).toMatch(/two files are named Pricing\.xlsx/iu);
  expect(text).toContain('rename one');
});

it('RF-158 several refused files are each named', async () => {
  const text = await refusalOf(workbookFile('a.xls'), workbookFile('b.csv'));

  expect(text).toContain('a.xls');
  expect(text).toContain('b.csv');
});

it('RF-158 a refused set can be replaced by a good one', async () => {
  installFakeUploadServer();
  renderWorkbookTab();
  chooseFiles(workbookFile('old.xls'));
  await screen.findByTestId('field-error');

  await chooseValid('Good.xlsx');

  expect(screen.queryByTestId('field-error')).toBeNull();
});

it('RF-158 with no file chosen the button is disabled and says why, and submit sends nothing', () => {
  const server = installFakeUploadServer();
  const view = renderWorkbookTab(happyAnswers());

  expect(sendButton().hasAttribute('disabled')).toBe(true);
  expect(sendButton().getAttribute('title')).toBe('Choose one or more workbooks first.');
  fireEvent.submit(formOf());

  expect(server.requests).toHaveLength(0);
  expect(view.calls.filter((call) => call.method === 'POST')).toHaveLength(0);
});

it('RF-158 submitting a refused set sends nothing', async () => {
  const server = installFakeUploadServer();
  const view = renderWorkbookTab(happyAnswers());
  chooseFiles(workbookFile('Old.xls'));
  await screen.findByTestId('field-error');

  fireEvent.submit(formOf());

  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(server.requests).toHaveLength(0);
  expect(view.calls.filter((call) => call.method === 'POST')).toHaveLength(0);
});

it('RNF-010 the tab, the multiple file field and the button work from the keyboard', () => {
  renderWorkbookTab();
  fireEvent.click(screen.getByRole('tab', { name: 'Upload a zip' }));
  const zip = screen.getByRole('tab', { name: 'Upload a zip' });

  fireEvent.keyDown(zip, { key: 'ArrowRight' });

  expect(screen.getByRole('tab', { name: 'Excel workbooks' }).getAttribute('aria-selected')).toBe(
    'true',
  );
  const field = screen.getByLabelText('Workbook files');
  expect(field.getAttribute('type')).toBe('file');
  expect(field.hasAttribute('multiple')).toBe(true);
  expect(field.getAttribute('accept')).toBe('.xlsx,.xlsm');
  expect(field.tabIndex).toBe(0);
  expect(sendButton().tagName).toBe('BUTTON');
  expect(sendButton().getAttribute('type')).toBe('submit');
  expect(field.closest('form')).toBe(sendButton().closest('form'));
});

it('RF-150 a file name holding HTML is shown as text, never as markup', async () => {
  installFakeUploadServer();
  renderWorkbookTab();
  const hostile = '<img src=x onerror=alert(1)>';

  await chooseValid(`${hostile}.xlsx`);

  expect(screen.getAllByText(`${hostile}.xlsx`).length).toBeGreaterThan(0);
  expect(document.querySelector('img')).toBeNull();
  expect(screen.getByLabelText<HTMLInputElement>('Project name').value).toBe(hostile);
});

it('RF-158 a refused file with HTML in its name is shown as text in the refusal', async () => {
  const text = await refusalOf(workbookFile('<b onmouseover=x>.xls'));

  expect(text).toContain('<b onmouseover=x>.xls');
  expect(document.querySelector('b')).toBeNull();
});

it('RF-158 the chosen files are listed with their sizes, names isolated for right-to-left text', async () => {
  installFakeUploadServer();
  renderWorkbookTab();
  chooseFiles(workbookFile('Pricing.xlsx', 2_500_000), workbookFile('Costs.xlsm', 12));
  await waitFor(() => {
    expect(sendButton().hasAttribute('disabled')).toBe(false);
  });

  const items = screen.getAllByRole('listitem').map((item) => item.textContent);
  expect(items).toContain('Pricing.xlsx (2.5 MB) Waiting');
  expect(items).toContain('Costs.xlsm (12 B) Waiting');
  expect(document.querySelectorAll('bdi').length).toBeGreaterThanOrEqual(2);
});
