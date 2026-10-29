import { describe, expect, it } from 'vitest';
import type { WorkbookProgress } from '../../../../src/application/ports/workbook-staging.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import type { TestBrowser } from '../../../support/test-browser.js';
import {
  bodyOf,
  createUploadProject,
  put,
  useUploadServers,
} from '../../../support/upload-route-harness.js';

// RF-159, RF-1105, DEC-183, DEC-188: a zip that holds workbooks is answered 202 before it is rendered;
// the page reads the state, the progress and the outcome from the batch endpoints of the project, and
// cancels from there. A zip without workbooks is still answered 201 with its summary.

const setup = useUploadServers();
const rendering: WorkbookProgress = {
  ...{ step: 'rendering', workbook: 1, workbooks: 2, sheet: 3, sheets: 5, cells: 400 },
};
const counts = { sheets: 2, nonEmptyCells: 30, formulas: 4, macroModules: 0, macrosSkipped: 0 };
const entry = {
  fileName: 'Pricing.xlsx',
  folder: 'Pricing.xlsx',
  sizeBytes: 2048,
  sha256: `sha256:${'12'.repeat(32)}`,
  counts,
};
const line = { name: 'Pricing.xlsx', sheets: 2, cells: 30, formulas: 4, macroModules: 0 };

const base = (id: string): string => `/api/projects/${id}/source/batches`;
const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function settled(browser: TestBrowser, id: string): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const body = bodyOf(await browser.request({ method: 'GET', url: `${base(id)}/current` }));
    if (body['phase'] === 'stored' || body['phase'] === 'refused') return body;
    await wait(10);
  }
  throw new Error('the zip did not end');
}

async function accepted() {
  const world = await setup();
  const { amy, uploads } = world;
  const id = await createUploadProject(amy);
  uploads.held = { entries: [entry], lines: [line], leftOut: [] };
  uploads.reports = [rendering];
  uploads.stopsOnAbort = true;
  let release: () => void = () => undefined;
  uploads.gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const answer = await put(amy, id);
  const batchId = String(bodyOf(answer)['batchId']);
  return { ...world, id, answer, batchId, release };
}

describe('PUT /api/projects/:id/source with workbooks in the zip', () => {
  it('RF-159 answers 202 with the batch at work before the zip is rendered, and the state shows the progress', async () => {
    const { amy, id, answer, batchId, release } = await accepted();

    const state = await amy.request({ method: 'GET', url: `${base(id)}/${batchId}` });
    const current = await amy.request({ method: 'GET', url: `${base(id)}/current` });
    release();

    expect(answer.statusCode).toBe(202);
    expect(answer.json()).toMatchObject({ phase: 'processing', files: 1 });
    expect(state.json()).toMatchObject({ phase: 'processing', progress: rendering });
    expect(Object.keys(bodyOf(state))).toContain('elapsedMs');
    expect(current.json()).toMatchObject({ batchId });
  });

  it('RF-159 the state ends stored with the summary, and the source of the project is the zip', async () => {
    const { amy, id, release } = await accepted();

    release();
    const ended = await settled(amy, id);
    const shown = await amy.request({ method: 'GET', url: `/api/projects/${id}` });

    expect(ended).toMatchObject({
      phase: 'stored',
      summary: { files: 7, workbooks: [line], fileName: 'OrderDesk.zip' },
    });
    expect(shown.json()).toMatchObject({ source: { workbooks: 1 } });
  });

  it('RF-158 the state ends refused with the code, message and next step of the error', async () => {
    const { amy, id, uploads, release } = await accepted();
    uploads.failWith = new RosettaError(ERROR_CODES.zipNotReadable);

    release();
    const ended = await settled(amy, id);

    expect(ended).toMatchObject({
      phase: 'refused',
      refusal: { status: 400, code: ERROR_CODES.zipNotReadable },
    });
  });
});

describe('PUT source with workbooks, then Cancel', () => {
  it('RF-159 Cancel during processing answers 204, publishes nothing and frees the project', async () => {
    const { amy, id, batchId, release } = await accepted();

    const cancelled = await amy.request({ method: 'DELETE', url: `${base(id)}/${batchId}` });
    release();
    await wait(30);
    const gone = await amy.request({ method: 'GET', url: `${base(id)}/${batchId}` });
    const shown = await amy.request({ method: 'GET', url: `/api/projects/${id}` });

    expect(cancelled.statusCode).toBe(204);
    expect(gone.statusCode).toBe(404);
    expect(shown.json()).toMatchObject({ source: null });
  });

  it('RF-159, DEC-188 Cancel after the end answers 409 with the state and keeps the source', async () => {
    const { amy, id, batchId, release } = await accepted();
    release();
    await settled(amy, id);

    const cancelled = await amy.request({ method: 'DELETE', url: `${base(id)}/${batchId}` });
    const shown = await amy.request({ method: 'GET', url: `/api/projects/${id}` });

    expect(cancelled.statusCode).toBe(409);
    expect(cancelled.json()).toMatchObject({ batchId, phase: 'stored' });
    expect(shown.json()).toMatchObject({ source: { workbooks: 1 } });
  });
});

describe('PUT source with workbooks, other callers', () => {
  it('RF-128 a second zip while the first is at work answers the upload-in-progress error', async () => {
    const { amy, id, release } = await accepted();

    const second = await put(amy, id);
    release();

    expect(second.statusCode).toBe(409);
    expect(second.json()).toMatchObject({ code: ERROR_CODES.uploadInProgress });
  });

  it("RF-1105 answers 404 to another user for the state, the current batch and the Cancel of the zip's batch", async () => {
    const { bob, id, batchId, release } = await accepted();

    const answers = [
      await bob.request({ method: 'GET', url: `${base(id)}/${batchId}` }),
      await bob.request({ method: 'GET', url: `${base(id)}/current` }),
      await bob.request({ method: 'DELETE', url: `${base(id)}/${batchId}` }),
    ];
    release();

    expect(answers.map((answer) => answer.statusCode)).toEqual([404, 404, 404]);
    expect(answers[0]?.json()).toMatchObject({ code: ERROR_CODES.notFound });
  });

  it('RF-128 a zip without workbooks is answered 201 with its summary and has no batch', async () => {
    const { amy, uploads } = await setup();
    const id = await createUploadProject(amy);

    const answer = await put(amy, id);
    const current = await amy.request({ method: 'GET', url: `${base(id)}/current` });

    expect(answer.statusCode).toBe(201);
    expect(answer.json()).toMatchObject({ files: 7, snapshotHash: uploads.hash });
    expect(current.statusCode).toBe(404);
  });

  it('RF-1009 the progress route of the old synchronous upload is gone', async () => {
    const { amy } = await setup();
    const id = await createUploadProject(amy);

    const old = await amy.request({ method: 'GET', url: `/api/projects/${id}/source/progress` });

    expect(old.statusCode).toBe(404);
  });
});
