import { fireEvent, screen, waitFor } from '@testing-library/preact';
import { expect } from 'vitest';
import { ProjectsPage } from '../../../web/src/pages/ProjectsPage.js';
import { json, renderPage, type Answer, type RenderedPage } from './fake-api.js';
import type { FakeUploadServer } from './fake-upload-server.js';
import { projectOf } from './project-fixtures.js';

// P3-49, RF-150, RF-158, RFC-005 section 4.2: the Projects page with its Excel workbooks tab, over
// the fake API (project, batch and finish calls) and the fake upload server (one file per request).
// The batch endpoint (P3-48) is not built yet, so these fixtures are the contract the page is
// written against. A workbook starts with the zip local file header PK\x03\x04.

const noProjects = json(200, { projects: [], truncated: false });

/** The project `POST /api/projects` makes for workbooks: it has no source until a batch is finished. */
const sourcelessBook = projectOf('p-9', 'Pricing', {
  sourceUrl: '',
  sourceKind: 'workbook',
  source: null,
});

const batchOpened = json(201, { batchId: 'b-1' });

export const finishedBody = {
  workbooks: [
    { name: 'Pricing.xlsx', sheets: 4, cells: 1200, formulas: 310, macroModules: 0 },
    { name: 'Costs.xlsm', sheets: 2, cells: 90, formulas: 12, macroModules: 3 },
    { name: 'Rates.xlsx', sheets: 1, cells: 40, formulas: 0, macroModules: 0 },
  ],
  skipped: [{ name: 'Costs.xlsm', reason: 'Macro module Module9 is locked and was not read.' }],
  snapshotHash: 'b'.repeat(64),
  uploadedAt: '2026-10-19T08:00:00.000Z',
};

const threeNames = ['Pricing.xlsx', 'Costs.xlsm', 'Rates.xlsx'] as const;

export function workbookFile(name: string, size?: number): File {
  const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
  const file = new File([bytes], name);
  if (size !== undefined) Object.defineProperty(file, 'size', { value: size });
  return file;
}

export const batchRoute = '/api/projects/p-9/source/batches';
export const finishRoute = `${batchRoute}/b-1/finish`;
export const filesRoute = `${batchRoute}/b-1/files`;

/** Answers for a page whose batch calls all succeed; a test overrides the one it is about. */
export function happyAnswers(): Record<string, Answer> {
  return {
    'POST /api/projects': json(201, sourcelessBook),
    [`POST ${batchRoute}`]: batchOpened,
    [`POST ${finishRoute}`]: json(201, finishedBody),
  };
}

export function renderWorkbookTab(answers: Readonly<Record<string, Answer>> = {}): RenderedPage {
  const view = renderPage(<ProjectsPage />, {
    'GET /api/projects/overview': noProjects,
    ...answers,
  });
  fireEvent.click(screen.getByRole('tab', { name: 'Excel workbooks' }));
  return view;
}

/** The session answer of a server whose upload limit is `uploadMaxMb`. */
export const sessionWithLimit = (uploadMaxMb: number): Response =>
  json(200, {
    user: { id: 'u-1', userName: 'ana', displayName: 'Ana', role: 'user', state: 'Active' },
    csrfToken: 'csrf-0',
    uploadMaxMb,
  });

export function chooseFiles(...files: File[]): void {
  fireEvent.change(screen.getByLabelText('Workbook files'), { target: { files } });
}

export const sendButton = (): HTMLElement =>
  screen.getByRole('button', { name: /^Upload (workbooks|again)$/u });

export async function chooseValid(...names: string[]): Promise<void> {
  chooseFiles(...(names.length === 0 ? threeNames : names).map((name) => workbookFile(name)));
  await waitFor(() => {
    expect(sendButton().hasAttribute('disabled')).toBe(false);
  });
}

/** Waits for the file request number `count` and answers it. */
export async function answerFile(
  server: FakeUploadServer,
  count: number,
  status = 201,
  body: unknown = { name: 'x', size: 1 },
): Promise<void> {
  await waitFor(() => {
    expect(server.requests).toHaveLength(count);
  });
  server.pending().respond(status, body);
}

export function formOf(): HTMLFormElement {
  const form = screen.getByLabelText('Workbook files').closest('form');
  if (form === null) throw new Error('The workbook field is not in a form.');
  return form;
}

/** The paths of the POST requests the page made, in order. */
export const posts = (view: {
  readonly calls: readonly { readonly method: string; readonly path: string }[];
}): string[] => view.calls.filter((call) => call.method === 'POST').map((call) => call.path);

/** Clicks the button and answers the first `count` file requests with success. */
export async function sendAll(server: FakeUploadServer, count = 3): Promise<void> {
  fireEvent.click(sendButton());
  for (let index = 1; index <= count; index += 1) await answerFile(server, index);
}
