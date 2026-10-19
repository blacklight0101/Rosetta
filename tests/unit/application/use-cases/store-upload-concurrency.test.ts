import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import { uploadSnapshotKey } from '../../../../src/domain/sources/upload-name.js';
import { amy, request, setup, uploadProject } from '../../../support/store-upload-harness.js';

// RF-128, RF-129, RF-133: two uploads at once, a project deleted during one, and the server
// shutting down.

describe('StoreUpload two uploads at once', () => {
  it('RF-128 refuses the second while the first runs, then accepts one again', async () => {
    const { useCase, project, uploads } = await setup();
    let release: () => void = () => undefined;
    uploads.gate = new Promise((resolve) => {
      release = resolve;
    });
    const first = useCase.execute(request(project));
    await Promise.resolve();

    const second = await useCase.execute(request(project));
    release();

    expect(second).toEqual({ ok: false, error: ERROR_CODES.uploadInProgress });
    expect((await first).ok).toBe(true);
    expect((await useCase.execute(request(project))).ok).toBe(true);
    expect(uploads.requests).toHaveLength(2);
  });

  it('RF-128 a failed upload frees the project for the next one', async () => {
    const { useCase, project, uploads } = await setup();
    uploads.failWith = new RosettaError(ERROR_CODES.zipNotReadable);
    await expect(useCase.execute(request(project))).rejects.toBeDefined();
    uploads.failWith = undefined;

    expect((await useCase.execute(request(project))).ok).toBe(true);
  });

  it('RF-128 two different projects upload at the same time', async () => {
    const { useCase, project, projects, uploads } = await setup();
    const other = uploadProject();
    await projects.insertOrFind(other);
    let release: () => void = () => undefined;
    uploads.gate = new Promise((resolve) => {
      release = resolve;
    });
    const first = useCase.execute(request(project));
    const second = useCase.execute(request(other));
    await Promise.resolve();
    release();

    expect((await first).ok && (await second).ok).toBe(true);
  });
});

describe('StoreUpload a project deleted during the upload', () => {
  it('RF-133 deletes the new snapshot and answers not found', async () => {
    const { useCase, project, projects, uploads, auditLog } = await setup();
    let release: () => void = () => undefined;
    uploads.gate = new Promise((resolve) => {
      release = resolve;
    });
    const pending = useCase.execute(request(project));
    await Promise.resolve();
    await projects.remove(amy.userId, project.id, () => Promise.resolve());
    release();

    expect(await pending).toEqual({ ok: false, error: ERROR_CODES.notFound });
    expect(uploads.removed).toEqual([uploadSnapshotKey(project.id, uploads.hash)]);
    expect(await auditLog.list({ since: 0 })).toEqual([]);
  });
});

describe('StoreUpload server shutdown', () => {
  it('RF-129 aborts the uploads in flight', async () => {
    const { useCase, project, uploads } = await setup();
    let release: () => void = () => undefined;
    uploads.gate = new Promise((resolve) => {
      release = resolve;
    });
    const pending = useCase.execute(request(project));
    await Promise.resolve();

    useCase.abortAll();
    release();
    await pending;

    expect(uploads.requests[0]?.signal.aborted).toBe(true);
  });
});
