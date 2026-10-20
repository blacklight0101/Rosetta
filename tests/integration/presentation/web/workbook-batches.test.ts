import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import {
  sampleBook,
  encryptedBook,
  formulaBook,
} from '../../../support/workbook-staging-harness.js';
import { bodyOf as jsonOf } from '../../../support/upload-route-harness.js';
import {
  batchesUrl,
  cancelBatch,
  createWorkbookProject,
  finishBatch,
  openBatch,
  putFile,
  useWorkbookServers,
} from '../../../support/workbook-route-harness.js';

// RF-150, RF-152, RFC-005 section 4.2: the batch routes over the real staging area. The shapes are
// the ones the Excel workbooks tab sends and reads (web/src/api/workbook-upload.ts).

const setup = useWorkbookServers();

describe('the batch routes', () => {
  it('RF-150 opens a batch, takes two files, finishes, and shows the workbooks as the source', async () => {
    const { amy } = await setup();
    const projectId = await createWorkbookProject(amy);
    const book = await sampleBook();

    const opened = await amy.request({ method: 'POST', url: batchesUrl(projectId) });
    const batchId = jsonOf(opened)['batchId'];
    if (typeof batchId !== 'string') throw new Error('no batch id');
    const first = await putFile(amy, { projectId, batchId }, { name: 'Pricing.xlsx', bytes: book });
    const second = await putFile(amy, { projectId, batchId }, { name: 'Rates.xlsm', bytes: book });
    const finished = await finishBatch(amy, { projectId, batchId });
    const shown = await amy.request({ method: 'GET', url: `/api/projects/${projectId}` });

    expect(opened.statusCode).toBe(201);
    expect(first.statusCode).toBe(201);
    expect(first.json()).toEqual({ name: 'Pricing.xlsx', size: book.length });
    expect(second.json()).toEqual({ name: 'Rates.xlsm', size: book.length });
    expect(finished.statusCode).toBe(201);
    expect(finished.json()).toMatchObject({
      workbooks: [
        { name: 'Pricing.xlsx', sheets: 1, cells: 4, formulas: 1, macroModules: 0 },
        { name: 'Rates.xlsm', sheets: 1, cells: 4, formulas: 1, macroModules: 0 },
      ],
      skipped: [],
      uploadedAt: '2026-10-11T09:00:00.000Z',
      codeChangedSinceLastRun: false,
    });
    expect(jsonOf(finished)['snapshotHash']).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(shown.json()).toMatchObject({
      sourceKind: 'workbook',
      source: { fileName: 'Pricing.xlsx, Rates.xlsm', workbooks: 2 },
    });
  });
});

describe('the batch routes (2)', () => {
  it('RF-150 takes the file name from X-File-Name, percent-encoded', async () => {
    const { amy } = await setup();
    const projectId = await createWorkbookProject(amy);
    const batchId = await openBatch(amy, projectId);

    const response = await putFile(
      amy,
      { projectId, batchId },
      { name: 'Café Costs.xlsx', bytes: await sampleBook() },
    );

    expect(response.json()).toMatchObject({ name: 'Café Costs.xlsx' });
  });

  it('RF-150 answers 400 RST-2000 to a body that is not application/octet-stream', async () => {
    const { amy, staging } = await setup();
    const projectId = await createWorkbookProject(amy);
    const batchId = await openBatch(amy, projectId);

    const response = await amy.request({
      method: 'PUT',
      url: `${batchesUrl(projectId)}/${batchId}/files`,
      payload: { name: 'x' },
      headers: { 'x-file-name': 'Pricing.xlsx' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: ERROR_CODES.requestInvalid });
    await staging.discard(batchId);
  });
});

describe('the batch routes (3)', () => {
  it('RF-150 answers 400 RST-2000 to a file without X-File-Name and RST-1930 to a broken one', async () => {
    const { amy } = await setup();
    const projectId = await createWorkbookProject(amy);
    const batchId = await openBatch(amy, projectId);
    const url = `${batchesUrl(projectId)}/${batchId}/files`;
    const send = (headers: Record<string, string>) =>
      amy.request({
        method: 'PUT',
        url,
        payload: Buffer.from('x'),
        headers: { 'content-type': 'application/octet-stream', ...headers },
      });

    const missing = await send({});
    const broken = await send({ 'x-file-name': '%E0%A4%A' });

    expect(missing.json()).toMatchObject({ code: ERROR_CODES.requestInvalid });
    expect(broken.json()).toMatchObject({ code: ERROR_CODES.uploadNameUnreadable });
  });
});

describe('the batch routes and what they refuse', () => {
  it('RF-150 refuses a second open batch with 409 RST-1919', async () => {
    const { amy } = await setup();
    const projectId = await createWorkbookProject(amy);
    await openBatch(amy, projectId);

    const second = await amy.request({ method: 'POST', url: batchesUrl(projectId) });

    expect(second.statusCode).toBe(409);
    expect(second.json()).toMatchObject({ code: ERROR_CODES.uploadInProgress });
  });

  it('RF-150 frees the project when the batch is cancelled, and the batch is then gone', async () => {
    const { amy } = await setup();
    const projectId = await createWorkbookProject(amy);
    const batchId = await openBatch(amy, projectId);

    const cancelled = await cancelBatch(amy, { projectId, batchId });
    const file = await putFile(
      amy,
      { projectId, batchId },
      { name: 'Pricing.xlsx', bytes: await sampleBook() },
    );
    const reopened = await amy.request({ method: 'POST', url: batchesUrl(projectId) });

    expect(cancelled.statusCode).toBe(204);
    expect(file.statusCode).toBe(404);
    expect(reopened.statusCode).toBe(201);
  });

  it('RF-150 refuses a finish with no file with 400 RST-2000', async () => {
    const { amy } = await setup();
    const projectId = await createWorkbookProject(amy);
    const batchId = await openBatch(amy, projectId);

    const finished = await finishBatch(amy, { projectId, batchId });

    expect(finished.statusCode).toBe(400);
    expect(finished.json()).toMatchObject({ code: ERROR_CODES.requestInvalid });
  });
});

describe('the batch routes and what they refuse (2)', () => {
  it('RF-150 answers a file or a finish after the finish with 404', async () => {
    const { amy } = await setup();
    const projectId = await createWorkbookProject(amy);
    const batchId = await openBatch(amy, projectId);
    const target = { projectId, batchId };
    await putFile(amy, target, { name: 'Pricing.xlsx', bytes: await sampleBook() });
    await finishBatch(amy, target);

    const file = await putFile(amy, target, { name: 'More.xlsx', bytes: await sampleBook() });
    const again = await finishBatch(amy, target);

    expect(file.statusCode).toBe(404);
    expect(again.statusCode).toBe(404);
  });

  it('RF-150 refuses a duplicate name with 400 RST-1928 and the third file past the count with RST-1924', async () => {
    const { amy } = await setup({ limits: { maxFiles: 2 } });
    const projectId = await createWorkbookProject(amy);
    const target = { projectId, batchId: await openBatch(amy, projectId) };
    const bytes = await sampleBook();
    await putFile(amy, target, { name: 'Pricing.xlsx', bytes });

    const duplicate = await putFile(amy, target, { name: 'pricing.XLSX', bytes });
    await putFile(amy, target, { name: 'Rates.xlsx', bytes });
    const third = await putFile(amy, target, { name: 'Costs.xlsx', bytes });

    expect(duplicate.statusCode).toBe(400);
    expect(duplicate.json()).toMatchObject({ code: ERROR_CODES.workbookDuplicateName });
    expect(third.statusCode).toBe(400);
    expect(third.json()).toMatchObject({ code: ERROR_CODES.workbookTooManyFiles });
  });
});

describe('the batch routes and what they refuse (3)', () => {
  it('RF-129 refuses the file that passes the total on the third file with 413 RST-1916 and keeps the others', async () => {
    const { amy } = await setup({ uploadMaxMb: 1 });
    const projectId = await createWorkbookProject(amy);
    const target = { projectId, batchId: await openBatch(amy, projectId) };
    const part = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(400 * 1024)]);
    await putFile(amy, target, { name: 'One.xlsx', bytes: part });
    await putFile(amy, target, { name: 'Two.xlsx', bytes: part });

    const third = await putFile(amy, target, { name: 'Three.xlsx', bytes: part });
    const again = await putFile(amy, target, { name: 'Three.xlsx', bytes: await sampleBook() });

    expect(third.statusCode).toBe(413);
    expect(third.json()).toMatchObject({ code: ERROR_CODES.uploadTooLarge });
    expect(again.statusCode).toBe(201);
  });
});

describe('the batch routes and a refused workbook', () => {
  it('RF-151 refuses the batch at the finish with the code and the file, publishes nothing and frees the project', async () => {
    const { amy } = await setup();
    const projectId = await createWorkbookProject(amy);
    const target = { projectId, batchId: await openBatch(amy, projectId) };
    await putFile(amy, target, { name: 'Pricing.xlsx', bytes: await sampleBook() });
    await putFile(amy, target, { name: 'Locked.xlsx', bytes: encryptedBook() });

    const finished = await finishBatch(amy, target);
    const shown = await amy.request({ method: 'GET', url: `/api/projects/${projectId}` });
    const reopened = await amy.request({ method: 'POST', url: batchesUrl(projectId) });

    expect(finished.statusCode).toBe(400);
    expect(finished.json()).toMatchObject({
      code: ERROR_CODES.workbookEncrypted,
      problems: [{ field: 'Locked.xlsx', code: ERROR_CODES.workbookEncrypted }],
    });
    expect(jsonOf(finished)['nextStep']).toContain('Remove the password');
    expect(shown.json()).toMatchObject({ source: null });
    expect(reopened.statusCode).toBe(201);
  });

  it('RF-151 names the file and the reason when one of two workbooks holds a formula over 8,192 characters', async () => {
    const { amy } = await setup();
    const projectId = await createWorkbookProject(amy);
    const target = { projectId, batchId: await openBatch(amy, projectId) };
    await putFile(amy, target, { name: 'Pricing.xlsx', bytes: await sampleBook() });
    await putFile(amy, target, { name: 'Long.xlsx', bytes: await formulaBook(8193) });

    const finished = await finishBatch(amy, target);
    const shown = await amy.request({ method: 'GET', url: `/api/projects/${projectId}` });

    expect(finished.statusCode).toBe(400);
    expect(finished.json()).toMatchObject({
      code: ERROR_CODES.workbookFormulaTooLong,
      problems: [{ field: 'Long.xlsx', code: ERROR_CODES.workbookFormulaTooLong }],
    });
    expect(jsonOf(finished)['message']).toContain('longer than 8,192');
    expect(shown.json()).toMatchObject({ source: null });
  });
});
