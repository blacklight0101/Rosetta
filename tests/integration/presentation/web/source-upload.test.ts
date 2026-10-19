import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import {
  createUploadProject,
  put,
  useUploadServers,
  zipBytes,
} from '../../../support/upload-route-harness.js';

// RF-128, RF-129: PUT /api/projects/:id/source stores the zip of an upload project and answers what
// was kept; the store is a fake here, the real one is exercised in source-upload-disk.test.ts.

const setup = useUploadServers();

describe('PUT /api/projects/:id/source', () => {
  it('RF-128 stores the zip and answers 201 with what was kept', async () => {
    const { amy, uploads } = await setup();
    const id = await createUploadProject(amy);

    const response = await put(amy, id);

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      files: 7,
      size: 4096,
      skipped: 3,
      snapshotHash: uploads.hash,
      fileName: 'OrderDesk.zip',
      uploadedAt: '2026-10-11T09:00:00.000Z',
      codeChangedSinceLastRun: false,
    });
  });

  it('RF-128 the project then shows its source and that the code did not change', async () => {
    const { amy } = await setup();
    const id = await createUploadProject(amy);
    await put(amy, id);

    const shown = await amy.request({ method: 'GET', url: `/api/projects/${id}` });

    expect(shown.json()).toMatchObject({
      sourceKind: 'upload',
      source: { fileName: 'OrderDesk.zip', uploadedAt: '2026-10-11T09:00:00.000Z' },
      codeChangedSinceLastRun: false,
    });
  });

  it('RF-129 gives the store the declared length and the limit of the server', async () => {
    const { amy, uploads } = await setup();
    const id = await createUploadProject(amy);

    await put(amy, id);

    expect(uploads.requests[0]).toMatchObject({
      declaredBytes: zipBytes.length,
      limitBytes: 5 * 1024 * 1024,
    });
  });
});

describe('PUT /api/projects/:id/source a request that is not an upload', () => {
  it('RF-128 takes the file name from X-File-Name, percent-encoded', async () => {
    const { amy, uploads } = await setup();
    const id = await createUploadProject(amy);

    await put(amy, id, { headers: { 'x-file-name': 'Caf%C3%A9.zip' } });

    expect(uploads.requests[0]?.fileName).toBe('Café.zip');
  });

  it('RF-128 takes application/x-zip-compressed too, which Windows browsers report for a zip', async () => {
    const { amy, uploads } = await setup();
    const id = await createUploadProject(amy);

    const response = await put(amy, id, {
      headers: { 'content-type': 'application/x-zip-compressed' },
    });

    expect(response.statusCode).toBe(201);
    expect(uploads.requests).toHaveLength(1);
  });

  it('RF-128 refuses a name that is not a zip with RST-1909 before reading the body', async () => {
    const { amy, uploads } = await setup();
    const id = await createUploadProject(amy);

    const response = await put(amy, id, { headers: { 'x-file-name': 'OrderDesk.rar' } });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: ERROR_CODES.zipNotReadable });
    expect(uploads.requests).toEqual([]);
  });
});

describe('PUT /api/projects/:id/source the file name header', () => {
  it('RF-128 refuses X-File-Name: %E0%A4%A with its own message, not "not a readable zip"', async () => {
    const { amy, uploads } = await setup();
    const id = await createUploadProject(amy);

    const response = await put(amy, id, { headers: { 'x-file-name': '%E0%A4%A' } });

    expect(response.statusCode).toBe(400);
    const body: unknown = response.json();
    expect(body).toMatchObject({ code: 'RST-1930' });
    expect(JSON.stringify(body)).not.toMatch(/readable zip/iu);
    expect(uploads.requests).toEqual([]);
  });

  it('RF-128 answers 400 RST-2000 to a body that is not application/zip', async () => {
    const { amy, uploads } = await setup();
    const id = await createUploadProject(amy);

    const response = await amy.request({
      method: 'PUT',
      url: `/api/projects/${id}/source`,
      payload: { name: 'x' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: ERROR_CODES.requestInvalid });
    expect(uploads.requests).toEqual([]);
  });
});
