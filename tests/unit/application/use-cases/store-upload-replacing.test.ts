import { describe, expect, it } from 'vitest';
import { uploadSnapshotKey } from '../../../../src/domain/sources/upload-name.js';
import { sampleRun } from '../../../support/run-fixtures.js';
import { amy, request, setup, uploadProject } from '../../../support/store-upload-harness.js';

// RF-128: replacing the source keeps the snapshots earlier runs use.

const oldKey = (id: string): string => uploadSnapshotKey(id, `sha256:${'cd'.repeat(32)}`);

const withOld = (id: string) =>
  uploadProject({
    id,
    upload: { fileName: 'Old.zip', uploadedAt: 1, snapshotKey: oldKey(id) },
  });

describe('StoreUpload replacing the source', () => {
  it('RF-128 deletes the earlier snapshot when no run uses it', async () => {
    const project = withOld('00000000-0000-4000-a000-0000000000c1');
    const { useCase, uploads } = await setup(project);

    await useCase.execute(request(project));

    expect(uploads.removed).toEqual([oldKey(project.id)]);
  });

  it('RF-128 keeps the earlier snapshot a run of the project used', async () => {
    const project = withOld('00000000-0000-4000-a000-0000000000c2');
    const { useCase, uploads, runs } = await setup(project);
    await runs.insert(
      sampleRun({
        projectId: project.id,
        userId: amy.userId,
        snapshotKey: oldKey(project.id),
        queueState: 'Ended',
        endState: 'Completed',
      }),
    );

    await useCase.execute(request(project));

    expect(uploads.removed).toEqual([]);
  });
});

describe('StoreUpload replacing the source while runs wait or the content is the same', () => {
  it('RF-128 keeps the earlier snapshot while a run of the project is queued or running', async () => {
    const project = withOld('00000000-0000-4000-a000-0000000000c3');
    const { useCase, uploads, runs } = await setup(project);
    await runs.insert(sampleRun({ projectId: project.id, userId: amy.userId }));

    await useCase.execute(request(project));

    expect(uploads.removed).toEqual([]);
  });

  it('RF-128 deletes nothing when the new content is the same snapshot', async () => {
    const id = '00000000-0000-4000-a000-0000000000c4';
    const first = await setup();
    const project = uploadProject({
      id,
      upload: {
        fileName: 'Old.zip',
        uploadedAt: 1,
        snapshotKey: uploadSnapshotKey(id, first.uploads.hash),
      },
    });
    const { useCase, uploads } = await setup(project);

    await useCase.execute(request(project));

    expect(uploads.removed).toEqual([]);
  });
});
