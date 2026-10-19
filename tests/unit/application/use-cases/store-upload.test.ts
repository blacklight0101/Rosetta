import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import { uploadSnapshotKey } from '../../../../src/domain/sources/upload-name.js';
import { sampleProject } from '../../../support/project-fixtures.js';
import { amy, bob, limitBytes, request, setup } from '../../../support/store-upload-harness.js';

// RF-128, RF-129, RF-130, RF-133: Store upload attaches the stored zip to the user's upload project
// and writes the audit row.

describe('StoreUpload a stored zip', () => {
  it('RF-128 answers what was kept: files, size, skipped, hash, name and instant', async () => {
    const { useCase, project, uploads } = await setup();

    const outcome = await useCase.execute(request(project));

    expect(outcome).toEqual({
      ok: true,
      value: {
        files: 7,
        size: 4096,
        skipped: 3,
        snapshotHash: uploads.hash,
        fileName: 'OrderDesk.zip',
        uploadedAt: '2026-10-19T08:30:00.000Z',
      },
    });
  });

  it('RF-129 hands the store the limit, the declared length and the abort signal', async () => {
    const { useCase, project, uploads } = await setup();
    const controller = new AbortController();

    await useCase.execute(request(project, { signal: controller.signal, declaredBytes: 99 }));

    expect(uploads.requests[0]).toMatchObject({
      projectId: project.id,
      limitBytes,
      declaredBytes: 99,
      uploadedAt: '2026-10-19T08:30:00.000Z',
    });
    controller.abort();
    expect(uploads.requests[0]?.signal.aborted).toBe(true);
  });
});

describe('StoreUpload what it records', () => {
  it('RF-128 records the zip on the project', async () => {
    const { useCase, project, projects, uploads } = await setup();

    await useCase.execute(request(project));

    expect((await projects.find(amy.userId, project.id))?.upload).toEqual({
      fileName: 'OrderDesk.zip',
      uploadedAt: Date.parse('2026-10-19T08:30:00.000Z'),
      snapshotKey: uploadSnapshotKey(project.id, uploads.hash),
    });
  });

  it('RF-128 names the zip after the project when the page sent no name', async () => {
    const { useCase, project, uploads } = await setup();

    await useCase.execute(request(project, { fileName: undefined }));

    expect(uploads.requests[0]?.fileName).toBe('OrderDesk.zip');
  });

  it('RF-133 writes one audit row with the name, size and hash, never content', async () => {
    const { useCase, project, auditLog, uploads } = await setup();

    await useCase.execute(request(project));

    const rows = await auditLog.list({ since: 0 });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorUserId: amy.userId,
      action: 'source.uploaded',
      targetType: 'project',
      targetId: project.id,
      ip: '203.0.113.7',
      outcome: 'ok',
      detail: { fileName: 'OrderDesk.zip', size: 1234, files: 7, snapshotHash: uploads.hash },
    });
    expect(Object.keys(rows[0]?.detail ?? {}).sort()).toEqual([
      'fileName',
      'files',
      'keptBytes',
      'size',
      'snapshotHash',
    ]);
  });
});

describe('StoreUpload refusals', () => {
  it("RF-1105 another user's project and an unknown id are not found and nothing is read", async () => {
    const { useCase, project, uploads } = await setup();

    const foreign = await useCase.execute(request(project, { actor: bob }));
    const unknown = await useCase.execute(request(project, { projectId: 'not-a-uuid' }));

    expect(foreign).toEqual({ ok: false, error: ERROR_CODES.notFound });
    expect(unknown).toEqual({ ok: false, error: ERROR_CODES.notFound });
    expect(uploads.requests).toEqual([]);
  });

  it('RF-128 a GitHub project takes no upload', async () => {
    const github = sampleProject({ userId: amy.userId });
    const { useCase, uploads } = await setup(github);

    const outcome = await useCase.execute(request(github));

    expect(outcome).toEqual({ ok: false, error: ERROR_CODES.conflict });
    expect(uploads.requests).toEqual([]);
  });

  it('RF-128 a name that is not a zip is refused before anything is read', async () => {
    const { useCase, project, uploads } = await setup();

    const outcome = await useCase.execute(request(project, { fileName: 'OrderDesk.rar' }));

    expect(outcome).toEqual({ ok: false, error: ERROR_CODES.zipNotReadable });
    expect(uploads.requests).toEqual([]);
  });

  it('RF-129 a refusal of the store passes through, leaves the project as it was and writes no audit row', async () => {
    const { useCase, project, projects, uploads, auditLog } = await setup();
    uploads.failWith = new RosettaError(ERROR_CODES.uploadTooLarge);

    await expect(useCase.execute(request(project))).rejects.toMatchObject({ code: 'RST-1916' });

    expect((await projects.find(amy.userId, project.id))?.upload).toBeUndefined();
    expect(await auditLog.list({ since: 0 })).toEqual([]);
  });
});
