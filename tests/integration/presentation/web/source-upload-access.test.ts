import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import {
  createUploadProject,
  idOf,
  put,
  useUploadServers,
} from '../../../support/upload-route-harness.js';

// RF-1009, RF-1105, RF-133: who may call PUT /api/projects/:id/source and what it leaves in the audit.

const setup = useUploadServers();

describe('PUT /api/projects/:id/source who may call it', () => {
  it('RF-1009 without a session answers 401', async () => {
    const { test, amy } = await setup();
    const id = await createUploadProject(amy);

    const response = await test.server.inject({
      method: 'PUT',
      url: `/api/projects/${id}/source`,
      payload: Buffer.from('PK'),
      headers: { 'content-type': 'application/zip', origin: 'http://127.0.0.1:8080' },
    });

    expect(response.statusCode).toBe(401);
  });

  it('RF-1009 without the CSRF token answers 403 RST-2008 and stores nothing', async () => {
    const { amy, uploads } = await setup();
    const id = await createUploadProject(amy);

    const response = await put(amy, id, { csrf: false });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: ERROR_CODES.csrfTokenInvalid });
    expect(uploads.requests).toEqual([]);
  });

  it('RF-1009 from a foreign Origin answers 403 RST-2007 and stores nothing', async () => {
    const { amy, uploads } = await setup();
    const id = await createUploadProject(amy);

    const response = await put(amy, id, { origin: 'https://evil.example' });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: ERROR_CODES.originRefused });
    expect(uploads.requests).toEqual([]);
  });

  it('RF-1105 the project of another user answers 404 and stores nothing', async () => {
    const { amy, bob, uploads } = await setup();
    const id = await createUploadProject(amy);

    const response = await put(bob, id);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: ERROR_CODES.notFound });
    expect(uploads.requests).toEqual([]);
  });
});

describe('PUT /api/projects/:id/source the kind of project', () => {
  it('RF-128 a GitHub project takes no upload: 409', async () => {
    const { amy, uploads } = await setup();
    const github = await amy.request({
      method: 'POST',
      url: '/api/projects',
      payload: { url: 'https://github.com/owner/repo' },
    });

    const response = await put(amy, idOf(github));

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: ERROR_CODES.conflict });
    expect(uploads.requests).toEqual([]);
  });
});

describe('PUT /api/projects/:id/source the audit trail', () => {
  it('RF-133 writes one audit row for the upload and none for a refused one', async () => {
    const { test, amy, bob } = await setup();
    const id = await createUploadProject(amy);
    await put(bob, id);
    await put(amy, id);

    const rows = (await test.audit.list({ since: 0 })).filter(
      (row) => row.action === 'source.uploaded',
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ targetId: id, outcome: 'ok' });
  });
});
