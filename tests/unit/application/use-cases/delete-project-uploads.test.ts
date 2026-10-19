import { describe, expect, it } from 'vitest';
import { DeleteProject } from '../../../../src/application/use-cases/delete-project.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { MemoryProjectRepository } from '../../../../src/infrastructure/db/memory-project-repository.js';
import { MemoryRunIndex } from '../../../../src/infrastructure/db/memory-run-index.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { FakeUploadStore } from '../../../support/fake-upload-store.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { MemoryLogger } from '../../../support/memory-logger.js';
import { MemoryWorkspaceFolders } from '../../../support/memory-workspace-folders.js';
import { sampleRun } from '../../../support/run-fixtures.js';
import { amy, uploadProject } from '../../../support/store-upload-harness.js';

// RF-133, RF-1012: deleting an upload project deletes its snapshots; one with a run in progress stays.

async function setup() {
  const projects = new MemoryProjectRepository();
  const runs = new MemoryRunIndex();
  const uploads = new FakeUploadStore();
  const clock = new FixedClock('2026-10-19T08:30:00.000Z');
  const logger = new MemoryLogger(clock, new SecretMasker());
  const project = uploadProject();
  await projects.insertOrFind(project);
  const useCase = new DeleteProject({
    ...{ projects, runs, logger, uploads },
    folders: new MemoryWorkspaceFolders(),
  });
  return { useCase, project, projects, runs, uploads };
}

describe('DeleteProject an upload project', () => {
  it('RF-133 deletes every snapshot of the project once its rows are gone', async () => {
    const { useCase, project, projects, uploads } = await setup();

    const outcome = await useCase.execute({ actor: amy, projectId: project.id });

    expect(outcome.ok).toBe(true);
    expect(uploads.removedProjects).toEqual([project.id]);
    expect(await projects.find(amy.userId, project.id)).toBeUndefined();
  });

  it('RF-1012 keeps the snapshots when a run of the project is still in progress', async () => {
    const { useCase, project, runs, uploads } = await setup();
    await runs.insert(sampleRun({ projectId: project.id, userId: amy.userId }));

    const outcome = await useCase.execute({ actor: amy, projectId: project.id });

    expect(outcome).toEqual({ ok: false, error: ERROR_CODES.deleteRefusedInUse });
    expect(uploads.removedProjects).toEqual([]);
  });

  it('RF-1105 keeps the snapshots of a project that is not the actor own', async () => {
    const { useCase, project, uploads } = await setup();
    const bob = { userId: '00000000-0000-4000-9000-0000000000b2', role: 'user' } as const;

    const outcome = await useCase.execute({ actor: bob, projectId: project.id });

    expect(outcome).toEqual({ ok: false, error: ERROR_CODES.notFound });
    expect(uploads.removedProjects).toEqual([]);
  });
});
