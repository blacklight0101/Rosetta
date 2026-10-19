import { expect, it } from 'vitest';
import type { ProjectRepository } from '../../src/application/ports/project-repository.js';
import type { Project } from '../../src/application/projects/project.js';
import { sampleProject } from '../support/project-fixtures.js';

// RF-128, RF-1105: every ProjectRepository adapter (PgProjectRepository, MemoryProjectRepository)
// records the zip of an upload project the same way and only for its owner.

const amy = '00000000-0000-4000-9000-0000000000a1';
const bob = '00000000-0000-4000-9000-0000000000b2';
const unknownId = '00000000-0000-4000-a000-00000000ffff';

type FreshProjects = () => Promise<ProjectRepository>;

const upload = (overrides: Partial<Project> = {}): Project =>
  sampleProject({
    userId: amy,
    name: 'OrderDesk',
    sourceKind: 'upload',
    sourceUrl: '',
    ref: '',
    subpath: '',
    ...overrides,
  });

const zip = (name: string) => ({
  fileName: `${name}.zip`,
  uploadedAt: 6_000_000,
  snapshotKey: `upload__${unknownId}@0123456789abcdef`,
});

export function projectUploadSourceContract(name: string, fresh: FreshProjects): void {
  it(`RF-128 ${name} records the zip of an upload project and finds it again`, async () => {
    const projects = await fresh();
    const project = upload();
    await projects.insertOrFind(project);

    const attached = await projects.attachUpload({
      userId: amy,
      projectId: project.id,
      upload: zip('OrderDesk'),
      updatedAt: 7_000_000,
    });

    const expected = { ...project, upload: zip('OrderDesk'), updatedAt: 7_000_000 };
    expect(attached).toEqual(expected);
    expect(await projects.find(amy, project.id)).toEqual(expected);
  });

  it(`RF-128 ${name} replaces the zip when a source is uploaded again`, async () => {
    const projects = await fresh();
    const project = upload();
    await projects.insertOrFind(project);
    const first = { userId: amy, projectId: project.id, upload: zip('One'), updatedAt: 7_000_000 };
    await projects.attachUpload(first);

    await projects.attachUpload({ ...first, upload: zip('Two'), updatedAt: 8_000_000 });

    expect((await projects.find(amy, project.id))?.upload).toEqual(zip('Two'));
  });

  it(`RF-1105 ${name} records nothing for another user's project, an unknown id or a bad id`, async () => {
    const projects = await fresh();
    const project = upload();
    await projects.insertOrFind(project);
    const change = { userId: amy, projectId: project.id, upload: zip('X'), updatedAt: 7_000_000 };

    expect(await projects.attachUpload({ ...change, userId: bob })).toBeUndefined();
    expect(await projects.attachUpload({ ...change, projectId: unknownId })).toBeUndefined();
    expect(await projects.attachUpload({ ...change, projectId: 'not-a-uuid' })).toBeUndefined();
    expect(await projects.attachUpload({ ...change, userId: 'not-a-uuid' })).toBeUndefined();
    expect(await projects.find(amy, project.id)).toEqual(project);
  });

  projectUploadRefusalContract(name, fresh);
}

function projectUploadRefusalContract(name: string, fresh: FreshProjects): void {
  it(`RF-128 ${name} records nothing for a GitHub project`, async () => {
    const projects = await fresh();
    const project = sampleProject({ userId: amy });
    await projects.insertOrFind(project);

    const attached = await projects.attachUpload({
      userId: amy,
      projectId: project.id,
      upload: zip('X'),
      updatedAt: 7_000_000,
    });

    expect(attached).toBeUndefined();
    expect(await projects.find(amy, project.id)).toEqual(project);
  });
}
