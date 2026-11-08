import { expect, it } from 'vitest';
import type { ProjectRepository } from '../../src/application/ports/project-repository.js';
import { sampleProject } from '../support/project-fixtures.js';

// RF-010, RF-1105, P8-134: every ProjectRepository adapter (PgProjectRepository,
// MemoryProjectRepository) renames a project the same way: only the name and the update time
// change, and only for its owner; another user's id and an unknown id find nothing.

const amy = '00000000-0000-4000-9000-0000000000a1';
const bob = '00000000-0000-4000-9000-0000000000b2';
const unknownId = '00000000-0000-4000-a000-00000000ffff';

type FreshProjects = () => Promise<ProjectRepository>;

export function projectRenameContract(name: string, fresh: FreshProjects): void {
  it(`RF-010 ${name} renames the owner's project and keeps everything but the name and the update time`, async () => {
    const projects = await fresh();
    const project = sampleProject({ userId: amy, ref: 'main', subpath: 'src' });
    await projects.insertOrFind(project);

    const renamed = await projects.rename({
      userId: amy,
      projectId: project.id,
      name: 'Order Desk',
      updatedAt: 9_000_000,
    });

    const expected = { ...project, name: 'Order Desk', updatedAt: 9_000_000 };
    expect(renamed).toEqual(expected);
    expect(await projects.find(amy, project.id)).toEqual(expected);
  });

  it(`RF-1105 ${name} renames nothing for another user's project id or an unknown id`, async () => {
    const projects = await fresh();
    const project = sampleProject({ userId: amy });
    await projects.insertOrFind(project);
    const change = { name: 'Taken', updatedAt: 9_000_000 };

    expect(
      await projects.rename({ ...change, userId: bob, projectId: project.id }),
    ).toBeUndefined();
    expect(await projects.rename({ ...change, userId: amy, projectId: unknownId })).toBeUndefined();
    expect(
      await projects.rename({ ...change, userId: amy, projectId: 'not-a-uuid' }),
    ).toBeUndefined();
    expect(await projects.find(amy, project.id)).toEqual(project);
  });

  it(`RF-010 ${name} stores a name with quotes and SQL text as plain text`, async () => {
    const projects = await fresh();
    const project = sampleProject({ userId: amy });
    await projects.insertOrFind(project);
    const odd = "Robert'); DROP TABLE projects;-- é";

    await projects.rename({ userId: amy, projectId: project.id, name: odd, updatedAt: 9_000_000 });

    expect((await projects.find(amy, project.id))?.name).toBe(odd);
    expect(await projects.list(amy)).toHaveLength(1);
  });
}
