import { expect, it } from 'vitest';
import type { ProjectRepository } from '../../src/application/ports/project-repository.js';
import type { Project } from '../../src/application/projects/project.js';
import { sampleProject } from '../support/project-fixtures.js';

// RF-152, RFC-005 section 4.1: every ProjectRepository adapter (PgProjectRepository,
// MemoryProjectRepository) stores a project of kind `workbook` with no address, ref or subpath,
// keeps two of them apart and refuses one that holds a GitHub address.

const amy = '00000000-0000-4000-9000-0000000000a1';
const bob = '00000000-0000-4000-9000-0000000000b2';

type FreshProjects = () => Promise<ProjectRepository>;

const workbook = (overrides: Partial<Project> = {}): Project =>
  sampleProject({
    userId: amy,
    name: 'Pricing',
    sourceKind: 'workbook',
    sourceUrl: '',
    ref: '',
    subpath: '',
    ...overrides,
  });

export function projectWorkbookSourceContract(name: string, fresh: FreshProjects): void {
  it(`RF-152 ${name} stores a workbook project and finds it by its owner and id`, async () => {
    const projects = await fresh();
    const project = workbook();

    const stored = await projects.insertOrFind(project);

    expect(stored).toEqual({ project, created: true });
    expect(await projects.find(amy, project.id)).toEqual(project);
    expect(await projects.find(bob, project.id)).toBeUndefined();
  });

  it(`RF-152 ${name} keeps two workbook projects of the same user apart`, async () => {
    const projects = await fresh();
    const first = workbook();
    const second = workbook();

    const results = [await projects.insertOrFind(first), await projects.insertOrFind(second)];

    expect(results.map((result) => result.created)).toEqual([true, true]);
    expect((await projects.list(amy)).map((project) => project.id).sort()).toEqual(
      [first.id, second.id].sort(),
    );
  });

  it.each([
    ['a source address', { sourceUrl: 'https://github.com/o/r' }],
    ['a ref', { ref: 'main' }],
    ['a subpath', { subpath: 'src' }],
  ])(`RF-152 ${name} refuses a workbook project that holds %s`, async (_what, overrides) => {
    const projects = await fresh();

    await expect(projects.insertOrFind(workbook(overrides))).rejects.toThrow();
    expect(await projects.list(amy)).toEqual([]);
  });
}

export const workbookProjectOwners: readonly string[] = [amy, bob];
