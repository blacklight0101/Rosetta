import { fireEvent, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { projectSchema } from '../../../web/src/api/project-schemas.js';
import { ZipUploadForm } from '../../../web/src/pages/ZipUploadForm.js';
import { failure, json, renderPage, type Answer } from './fake-api.js';
import { installFakeUploadServer } from './fake-upload-server.js';
import { projectOf } from './project-fixtures.js';
import { chooseValid, renderUploadTab, sendOne, sourceless, summaryBody } from './zip-fixtures.js';

// RF-159, DEC-183, DEC-188: a zip that holds workbooks is accepted at once (202); the page then asks the
// state of its batch every second, shows the same progress and Cancel as the workbooks form, and the
// summary or the refusal at the end. A zip without workbooks keeps the upload bar and its summary.

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.history.pushState({}, '', '/');
});

const stateRoute = '/api/projects/p-9/source/batches/b-1';
const at = (progress: Record<string, unknown>, elapsedMs: number) => ({
  ...{ batchId: 'b-1', phase: 'processing', files: 1, elapsedMs },
  progress,
});
const rendering = {
  ...{ step: 'rendering', workbook: 1, workbooks: 2, sheet: 2, sheets: 6, cells: 300 },
};
const stored = {
  ...{ batchId: 'b-1', phase: 'stored', files: 1, elapsedMs: 9000 },
  summary: { ...summaryBody, fileName: 'OrderDesk.zip', uploadedAt: '2026-10-29T08:00:00.000Z' },
};

/** Answers the state with the first and then each next one, the last one for every read after it. */
function states(...list: Record<string, unknown>[]): Answer {
  let read = 0;
  return () => {
    const state = list[Math.min(read, list.length - 1)];
    read += 1;
    return json(200, state);
  };
}

async function tick(): Promise<void> {
  await vi.advanceTimersByTimeAsync(1000);
}

async function accepted(answers: Record<string, Answer>) {
  const server = installFakeUploadServer();
  const view = renderUploadTab({ 'POST /api/projects': json(201, sourceless), ...answers });
  await chooseValid();
  await sendOne(server);
  server.pending().progress(200, 200);
  server.pending().respond(202, at(rendering, 5000));
  return view;
}

it('RF-159 shows the steps, the workbook and sheet and the cells once the zip is accepted, with Cancel', async () => {
  await accepted({ [`GET ${stateRoute}`]: states(at(rendering, 6000), stored) });

  await waitFor(() => {
    expect(screen.getByTestId('processing-detail').textContent).toContain(
      'Workbook 1 of 2, sheet 2 of 6. 300 cells read.',
    );
  });
  expect(screen.getByText('Rendering sheets').dataset['state']).toBe('current');
  expect(screen.getByRole('button', { name: 'Cancel' })).not.toBeNull();
  expect(screen.queryByRole('progressbar', { name: 'Upload progress' })).toBeNull();
});

it('RF-159 ends with the summary of the zip and a way to start a run', async () => {
  await accepted({ [`GET ${stateRoute}`]: states(at(rendering, 6000), stored) });
  await screen.findByTestId('processing-detail');

  await tick();

  await screen.findByText(/70 files kept/u);
  expect(screen.queryByTestId('processing')).toBeNull();
  expect(screen.getByRole('link', { name: 'Start a run' })).not.toBeNull();
});

it('RF-158 shows a refusal after acceptance with its reason and next step, and offers Upload again', async () => {
  await accepted({
    [`GET ${stateRoute}`]: json(200, {
      ...{ batchId: 'b-1', phase: 'refused', files: 1, elapsedMs: 900 },
      refusal: {
        ...{ status: 400, code: 'RST-1922', message: 'Costs.xlsm is password-protected.' },
        nextStep: 'Remove the password in Excel and upload again.',
      },
    }),
  });

  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain('Costs.xlsm is password-protected.');
  expect(screen.getByRole('button', { name: 'Upload again' })).not.toBeNull();
});

it('RF-159 Cancel stops the work on the server, publishes nothing and offers Upload again', async () => {
  const view = await accepted({
    [`GET ${stateRoute}`]: states(at(rendering, 3000)),
    [`DELETE ${stateRoute}`]: new Response(null, { status: 204 }),
  });
  await screen.findByTestId('processing-detail');

  fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

  expect((await screen.findByRole('alert')).textContent).toContain('Nothing was published');
  expect(view.calls.some((call) => call.method === 'DELETE' && call.path === stateRoute)).toBe(
    true,
  );
  expect(screen.getByRole('button', { name: 'Upload again' })).not.toBeNull();
});

it('DEC-188 a Cancel the server answers with 409 because the zip was already stored shows the summary', async () => {
  await accepted({
    [`GET ${stateRoute}`]: states(at(rendering, 3000), stored),
    [`DELETE ${stateRoute}`]: json(409, stored),
  });
  await screen.findByTestId('processing-detail');

  fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
  await tick();

  await screen.findByText(/70 files kept/u);
  expect(screen.queryByText(/Nothing was published/u)).toBeNull();
});

it('RF-159 a zip the server no longer has ends the wait without a summary', async () => {
  let reads = 0;
  await accepted({
    [`GET ${stateRoute}`]: () => {
      reads += 1;
      return reads === 1 ? json(200, at(rendering, 3000)) : failure(404, 'RST-2003');
    },
  });
  await screen.findByTestId('processing-detail');

  await tick();

  expect((await screen.findByRole('alert')).textContent).toContain('stopped before it finished');
});

it('RF-159 keeps the upload bar and the summary when the zip holds no workbooks (201)', async () => {
  const server = installFakeUploadServer();
  renderUploadTab({ 'POST /api/projects': json(201, sourceless) });
  await chooseValid();
  await sendOne(server);

  server.pending().progress(200, 200);

  const bar = await screen.findByRole('progressbar', { name: 'Upload progress' });
  expect(bar.getAttribute('aria-valuenow')).toBe('100');
  expect(screen.queryByTestId('processing')).toBeNull();
  server.pending().respond(201, summaryBody);
  await screen.findByText(/70 files kept/u);
});

const project = projectSchema.parse(
  projectOf('p-9', 'OrderDesk', { sourceUrl: '', sourceKind: 'upload', source: null }),
);

it('RF-159 a form opened on a project whose zip is being stored shows the progress and then the summary', async () => {
  const onStored = vi.fn();
  renderPage(<ZipUploadForm existing={project} onStored={onStored} />, {
    'GET /api/projects/p-9/source/batches/current': json(200, at(rendering, 21_000)),
    [`GET ${stateRoute}`]: states(at(rendering, 22_000), stored),
  });

  const detail = await screen.findByTestId('processing-detail');
  expect(detail.textContent).toContain('Workbook 1 of 2');
  expect(detail.textContent).toContain('0:21');
  expect(screen.getByRole('button', { name: 'Cancel' })).not.toBeNull();
  await tick();
  await tick();
  await screen.findByText(/70 files kept/u);
  expect(onStored).toHaveBeenCalledTimes(1);
});

it('RF-159 a form opened on a project with no batch shows nothing of a batch', async () => {
  const view = renderPage(<ZipUploadForm existing={project} onStored={vi.fn()} />, {});

  await waitFor(() => {
    expect(view.calls.map((call) => call.path)).toContain(
      '/api/projects/p-9/source/batches/current',
    );
  });
  expect(screen.queryByTestId('processing')).toBeNull();
  expect(screen.queryByRole('alert')).toBeNull();
});
