import { fireEvent, screen, waitFor } from '@testing-library/preact';
import { afterEach, expect, it, vi } from 'vitest';
import { installFakeUploadServer } from './fake-upload-server.js';
import { chooseFile, renderUploadTab, sizedFile, uploadButton, zipFile } from './zip-fixtures.js';

// RF-128, RF-134: what the Upload a zip tab checks before anything is sent: the extension, the
// first bytes (PK\x03\x04), an empty file and the size limit; plus the keyboard and the names that
// are long or hold HTML.

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.pushState({}, '', '/');
});

const problem = (): HTMLElement => {
  const element = screen.getByTestId('field-error');
  return element;
};

async function refusalOf(file: File): Promise<string> {
  const server = installFakeUploadServer();
  const view = renderUploadTab();
  chooseFile(file);

  const shown = await screen.findByTestId('field-error');
  expect(screen.getByLabelText('Zip file').getAttribute('aria-invalid')).toBe('true');
  expect(uploadButton().hasAttribute('disabled')).toBe(true);
  expect(server.requests).toHaveLength(0);
  expect(view.calls.filter((call) => call.method === 'POST')).toHaveLength(0);
  return shown.textContent;
}

it('RF-134 a file above the limit is refused before sending, with what to do', async () => {
  expect(await refusalOf(sizedFile('big.zip', 600_000_000))).toMatch(
    /600\.0 MB.*limit is 500 MB.*node_modules/su,
  );
});

it('RF-128 a 0-byte file is refused as empty', async () => {
  expect(await refusalOf(new File([], 'nothing.zip'))).toMatch(/empty/u);
});

it('RF-128 a .zip that is really text is refused by its first bytes', async () => {
  expect(
    await refusalOf(new File(['just some notes'], 'notes.zip', { type: 'application/zip' })),
  ).toMatch(/not a zip/u);
});

it('RF-128 a file that does not end in .zip is refused by its extension', async () => {
  expect(await refusalOf(new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], 'code.tar'))).toMatch(
    /ending in .zip/u,
  );
});

it('RF-128 a refused file can be replaced by a good one', async () => {
  installFakeUploadServer();
  renderUploadTab();
  chooseFile(new File([], 'nothing.zip'));
  await screen.findByTestId('field-error');

  chooseFile(zipFile('Good.zip'));

  await waitFor(() => {
    expect(uploadButton().hasAttribute('disabled')).toBe(false);
  });
  expect(screen.queryByTestId('field-error')).toBeNull();
});

it('RF-134 with no file chosen the button is disabled and says why', () => {
  renderUploadTab();

  expect(uploadButton().hasAttribute('disabled')).toBe(true);
  expect(uploadButton().getAttribute('title')).toBe('Choose a zip file first.');
});

it('RNF-010 the tabs and the form work from the keyboard', () => {
  renderUploadTab();
  fireEvent.click(screen.getByRole('tab', { name: 'GitHub repository' }));
  const github = screen.getByRole('tab', { name: 'GitHub repository' });

  fireEvent.keyDown(github, { key: 'ArrowRight' });

  const zipTab = screen.getByRole('tab', { name: 'Upload a zip' });
  expect(zipTab.getAttribute('aria-selected')).toBe('true');
  const field = screen.getByLabelText('Zip file');
  expect(field).toBeInstanceOf(HTMLInputElement);
  expect(field.getAttribute('type')).toBe('file');
  expect(field.getAttribute('accept')).toBe('.zip,application/zip');
  expect(uploadButton().tagName).toBe('BUTTON');
  expect(uploadButton().getAttribute('type')).toBe('submit');
  expect(screen.getByLabelText('Zip file').closest('form')).toBe(uploadButton().closest('form'));
});

it('RF-128 a name holding HTML is shown as text and a 60-character name is kept whole', async () => {
  installFakeUploadServer();
  renderUploadTab();
  const hostile = '<img src=x onerror=alert(1)>';
  const long = 'A'.repeat(56);

  chooseFile(zipFile(`${hostile}.zip`));
  await waitFor(() => {
    expect(uploadButton().hasAttribute('disabled')).toBe(false);
  });

  expect(screen.getByText(`${hostile}.zip`)).not.toBeNull();
  expect(document.querySelector('img')).toBeNull();

  chooseFile(zipFile(`${long}.zip`));
  await waitFor(() => {
    expect(screen.getByLabelText<HTMLInputElement>('Project name').value).toBe(long);
  });
  expect(screen.getByText(`${long}.zip`).textContent).toHaveLength(60);
});

function formOf(): HTMLFormElement {
  const form = screen.getByLabelText('Zip file').closest('form');
  if (form === null) throw new Error('The zip field is not in a form.');
  return form;
}

it('RF-128 a slow check of an earlier file does not clear the refusal of the file chosen after it', async () => {
  installFakeUploadServer();
  renderUploadTab();

  chooseFile(zipFile('First.zip'));
  chooseFile(new File([], 'nothing.zip'));

  await screen.findByTestId('field-error');
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(problem().textContent).toMatch(/empty/u);
  expect(uploadButton().hasAttribute('disabled')).toBe(true);
});

it('RF-128 submitting before the check has finished sends nothing', async () => {
  const server = installFakeUploadServer();
  const view = renderUploadTab();
  chooseFile(new File(['not a zip at all'], 'notes.zip'));

  fireEvent.submit(formOf());

  await screen.findByTestId('field-error');
  expect(server.requests).toHaveLength(0);
  expect(view.calls.filter((call) => call.method === 'POST')).toHaveLength(0);
});

it('RF-134 submitting with no file chosen sends nothing', () => {
  const server = installFakeUploadServer();
  const view = renderUploadTab();

  fireEvent.submit(formOf());

  expect(server.requests).toHaveLength(0);
  expect(view.calls.filter((call) => call.method === 'POST')).toHaveLength(0);
});
