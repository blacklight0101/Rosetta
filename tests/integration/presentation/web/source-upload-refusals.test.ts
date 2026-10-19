import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { describeError } from '../../../../src/domain/errors/descriptions.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import { uploadSnapshotKey } from '../../../../src/domain/sources/upload-name.js';
import { sampleRun } from '../../../support/run-fixtures.js';
import {
  createUploadProject,
  listedProject,
  overviewProject,
  put,
  useUploadServers,
} from '../../../support/upload-route-harness.js';

// RF-128, RF-129: what the page is told when the store refuses, and what the project says after a
// second upload.

const setup = useUploadServers();

describe('PUT /api/projects/:id/source refusals of the store', () => {
  it.each([
    [ERROR_CODES.uploadTooLarge, 413],
    [ERROR_CODES.uploadNoSpace, 507],
    [ERROR_CODES.uploadTimedOut, 408],
    [ERROR_CODES.uploadInProgress, 409],
    [ERROR_CODES.zipNotReadable, 400],
    [ERROR_CODES.zipTooLarge, 400],
    [ERROR_CODES.zipTooManyEntries, 400],
    [ERROR_CODES.zipRatioTooHigh, 400],
    [ERROR_CODES.zipEntryPathUnsafe, 400],
    [ERROR_CODES.zipEntryUnsupported, 400],
    [ERROR_CODES.zipEmpty, 400],
  ])('RF-129 %s answers %i with the code, message and next step', async (code, status) => {
    const { amy, uploads } = await setup();
    const id = await createUploadProject(amy);
    uploads.failWith = new RosettaError(code, 'internal detail that must not reach the page');

    const response = await put(amy, id);

    expect(response.statusCode).toBe(status);
    expect(response.json()).toEqual({ code, ...describeError(code) });
  });

  it('RF-128 a failed upload leaves a project with no source', async () => {
    const { amy, uploads } = await setup();
    const id = await createUploadProject(amy);
    uploads.failWith = new RosettaError(ERROR_CODES.zipEmpty);
    await put(amy, id);

    const shown = await amy.request({ method: 'GET', url: `/api/projects/${id}` });

    expect(shown.json()).toMatchObject({ source: null });
  });
});

describe('the project after a second upload', () => {
  it('RF-128 says the code changed once a run analysed the earlier zip', async () => {
    const { test, amy, amyId, uploads } = await setup();
    const id = await createUploadProject(amy);
    await put(amy, id);
    await test.runs.runs.insert(
      sampleRun({
        projectId: id,
        userId: amyId,
        snapshotKey: uploadSnapshotKey(id, uploads.hash),
        queueState: 'Ended',
      }),
    );
    uploads.hash = `sha256:${'cd'.repeat(32)}`;

    await put(amy, id);

    const shown = await amy.request({ method: 'GET', url: `/api/projects/${id}` });
    expect(shown.json()).toMatchObject({ codeChangedSinceLastRun: true });
    const overview = await amy.request({ method: 'GET', url: '/api/projects/overview' });
    expect(overviewProject(overview)).toMatchObject({
      sourceKind: 'upload',
      source: { fileName: 'OrderDesk.zip' },
      codeChangedSinceLastRun: true,
    });
    const list = await amy.request({ method: 'GET', url: '/api/projects' });
    expect(listedProject(list)).toMatchObject({ codeChangedSinceLastRun: true });
  });

  it('RF-128 says nothing changed when the run analysed the current zip', async () => {
    const { test, amy, amyId, uploads } = await setup();
    const id = await createUploadProject(amy);
    await put(amy, id);
    await test.runs.runs.insert(
      sampleRun({
        projectId: id,
        userId: amyId,
        snapshotKey: uploadSnapshotKey(id, uploads.hash),
        queueState: 'Ended',
      }),
    );

    const shown = await amy.request({ method: 'GET', url: `/api/projects/${id}` });

    expect(shown.json()).toMatchObject({ codeChangedSinceLastRun: false });
  });
});
