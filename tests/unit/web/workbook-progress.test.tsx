import { fireEvent, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { projectSchema } from '../../../web/src/api/project-schemas.js';
import { WorkbookUploadForm } from '../../../web/src/pages/WorkbookUploadForm.js';
import { failure, json, renderPage, type Answer } from './fake-api.js';
import { installFakeUploadServer } from './fake-upload-server.js';
import { projectOf } from './project-fixtures.js';
import {
  chooseValid,
  happyAnswers,
  renderWorkbookTab,
  sendAll,
  stateRoute,
  storedState,
} from './workbook-fixtures.js';

// RF-159, RF-158, DEC-183: the Excel workbooks form while the server reads the batch. The page asks
// for the state every second and shows the step, the workbook and sheet, the cells and the time; a
// form opened on a project whose batch is still being read shows the same; Cancel stops it.

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const at = (progress: Record<string, unknown>, elapsedMs: number) => ({
  ...{ batchId: 'b-1', phase: 'processing', files: 3, elapsedMs },
  progress,
});
const rendering = {
  ...{ step: 'rendering', workbook: 2, workbooks: 3, sheet: 4, sheets: 9, cells: 1200 },
};
const saving = {
  ...{ step: 'saving', workbook: 3, workbooks: 3, sheet: 15, sheets: 15, cells: 12_377 },
};

/** Answers the state with `first` and then each next one, the last one for every read after it. */
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

it('RF-159 shows the steps, the workbook and sheet, the cells and the time, and asks again every second', async () => {
  const server = installFakeUploadServer();
  const view = renderWorkbookTab({
    ...happyAnswers(),
    [`GET ${stateRoute}`]: states(at(rendering, 7000), at(saving, 8000), storedState()),
  });
  await chooseValid();
  await sendAll(server);

  await waitFor(() => {
    expect(screen.getByTestId('processing-detail').textContent).toContain(
      'Workbook 2 of 3, sheet 4 of 9. 1,200 cells read.',
    );
  });
  expect(screen.getByTestId('processing-detail').textContent).toContain('0:07');
  const steps = screen.getAllByRole('listitem').filter((item) => item.dataset['state']);
  expect(steps.map((item) => [item.textContent, item.dataset['state']])).toEqual([
    ['Reading workbooks', 'done'],
    ['Rendering sheets', 'current'],
    ['Mapping dependencies', 'waiting'],
    ['Saving', 'waiting'],
  ]);

  await tick();
  expect((await screen.findByTestId('processing-detail')).textContent).toContain('12,377 cells');
  expect(screen.getByText('Saving').dataset['state']).toBe('current');
  await tick();
  await screen.findByText(/3 workbooks read/u);
  expect(screen.queryByTestId('processing')).toBeNull();
  expect(view.calls.filter((call) => call.path === stateRoute)).toHaveLength(3);
});

it('RF-159 tells a screen reader the step politely and not the counts or the clock', async () => {
  const server = installFakeUploadServer();
  renderWorkbookTab({
    ...happyAnswers(),
    [`GET ${stateRoute}`]: states(at(rendering, 7000), at({ ...rendering, cells: 5000 }, 8000)),
  });
  await chooseValid();
  await sendAll(server);

  const said = (): HTMLElement | undefined =>
    screen
      .getAllByRole('status')
      .find((element) => element.textContent === 'Rendering the sheets.');
  await waitFor(() => {
    expect(said()).toBeDefined();
  });
  const status = said();
  expect(status?.getAttribute('aria-live')).toBe('polite');
  await tick();
  expect(screen.getByTestId('processing-detail').textContent).toContain('5,000 cells');
  expect(status?.textContent).toBe('Rendering the sheets.');
  expect(screen.getAllByRole('status').every((element) => !/\d/u.test(element.textContent))).toBe(
    true,
  );
});

it('RF-158 shows a refusal after acceptance with the file, the reason and the next step, and offers Upload again', async () => {
  const server = installFakeUploadServer();
  renderWorkbookTab({
    ...happyAnswers(),
    [`GET ${stateRoute}`]: json(200, {
      ...{ batchId: 'b-1', phase: 'refused', files: 3, elapsedMs: 900 },
      refusal: {
        ...{ status: 400, code: 'RST-1922', message: 'Costs.xlsm is password-protected.' },
        nextStep: 'Remove the password in Excel and upload again.',
      },
    }),
  });
  await chooseValid();
  await sendAll(server);

  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain('Costs.xlsm is password-protected.');
  expect(alert.textContent).toContain('Remove the password in Excel and upload again.');
  expect(screen.getByRole('button', { name: 'Upload again' })).not.toBeNull();
});

it('RF-159 Cancel stops the batch on the server, publishes nothing and offers Upload again', async () => {
  const server = installFakeUploadServer();
  const view = renderWorkbookTab({
    ...happyAnswers(),
    [`GET ${stateRoute}`]: states(at(rendering, 3000)),
    [`DELETE ${stateRoute}`]: new Response(null, { status: 204 }),
  });
  await chooseValid();
  await sendAll(server);
  await screen.findByTestId('processing-detail');

  fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain('Nothing was published');
  await waitFor(() => {
    expect(view.calls.some((call) => call.method === 'DELETE' && call.path === stateRoute)).toBe(
      true,
    );
  });
  expect(screen.getByRole('button', { name: 'Upload again' })).not.toBeNull();
});

it('RF-159 a Cancel the server refuses because the batch was already stored shows the summary, not "nothing published"', async () => {
  const server = installFakeUploadServer();
  renderWorkbookTab({
    ...happyAnswers(),
    [`GET ${stateRoute}`]: states(at(rendering, 3000), storedState()),
    [`DELETE ${stateRoute}`]: json(409, storedState()),
  });
  await chooseValid();
  await sendAll(server);
  await screen.findByTestId('processing-detail');

  fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
  await tick();

  await screen.findByText(/3 workbooks read/u);
  expect(screen.queryByText(/Nothing was published/u)).toBeNull();
});

it('RF-159 a read of the state that fails once is tried again and the wait goes on', async () => {
  const server = installFakeUploadServer();
  const answers = [json(200, at(rendering, 3000)), failure(500, 'RST-5000')];
  renderWorkbookTab({
    ...happyAnswers(),
    [`GET ${stateRoute}`]: () => answers.shift() ?? json(200, storedState()),
  });
  await chooseValid();
  await sendAll(server);
  await screen.findByTestId('processing-detail');

  await tick();
  await tick();

  await screen.findByText(/3 workbooks read/u);
  expect(screen.queryByRole('alert')).toBeNull();
});

it('RF-159 a batch the server no longer has ends the wait without a summary', async () => {
  const server = installFakeUploadServer();
  let reads = 0;
  renderWorkbookTab({
    ...happyAnswers(),
    [`GET ${stateRoute}`]: () => {
      reads += 1;
      return reads === 1 ? json(200, at(rendering, 3000)) : failure(404, 'RST-2003');
    },
  });
  await chooseValid();
  await sendAll(server);
  await screen.findByTestId('processing-detail');

  await tick();

  expect((await screen.findByRole('alert')).textContent).toContain('stopped before it finished');
  expect(screen.queryByText(/workbooks read/u)).toBeNull();
});

const project = projectSchema.parse(
  projectOf('p-9', 'Pricing', { sourceUrl: '', sourceKind: 'workbook', source: null }),
);

it('RF-159 a form opened on a project whose batch is being read shows the progress and the summary', async () => {
  const onStored = vi.fn();
  renderPage(<WorkbookUploadForm existing={project} onStored={onStored} />, {
    'GET /api/projects/p-9/source/batches/current': json(200, at(rendering, 21_000)),
    'GET /api/projects/p-9/source/batches/b-1': states(at(saving, 22_000), storedState()),
  });

  const detail = await screen.findByTestId('processing-detail');
  expect(detail.textContent).toContain('Workbook 2 of 3');
  expect(detail.textContent).toContain('0:21');
  await tick();
  await tick();
  await screen.findByText(/3 workbooks read/u);
  expect(onStored).toHaveBeenCalledTimes(1);
});

it('RF-159 a form opened on a project whose batch was refused shows the refusal', async () => {
  renderPage(<WorkbookUploadForm existing={project} onStored={vi.fn()} />, {
    'GET /api/projects/p-9/source/batches/current': json(200, {
      ...{ batchId: 'b-1', phase: 'refused', files: 2, elapsedMs: 1000 },
      refusal: {
        ...{ status: 400, code: 'RST-1922', message: 'Costs.xlsm is password-protected.' },
        nextStep: 'Remove the password in Excel and upload again.',
      },
    }),
  });

  expect((await screen.findByRole('alert')).textContent).toContain('password-protected');
});

it('RF-159 a form opened on a project with no batch shows nothing of a batch', async () => {
  const view = renderPage(<WorkbookUploadForm existing={project} onStored={vi.fn()} />, {});

  await waitFor(() => {
    expect(view.calls.map((call) => call.path)).toContain(
      '/api/projects/p-9/source/batches/current',
    );
  });
  expect(screen.queryByTestId('processing')).toBeNull();
  expect(screen.queryByRole('alert')).toBeNull();
});
