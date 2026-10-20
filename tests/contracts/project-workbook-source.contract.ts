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

const pricing = {
  fileName: 'Pricing.xlsx, Rates.xlsm',
  uploadedAt: 6_000_000,
  snapshotKey: '',
  workbooks: 2,
};

/** RF-150, RF-152, P3-48: the source a workbook project holds after a batch, and the zip with workbooks. */
export function projectWorkbookAttachContract(name: string, fresh: FreshProjects): void {
  it(`RF-150 ${name} records the workbooks of a workbook project with their count`, async () => {
    const projects = await fresh();
    const project = workbook();
    await projects.insertOrFind(project);
    const upload = { ...pricing, snapshotKey: `workbook__${project.id}@0123456789abcdef` };

    const attached = await projects.attachUpload({
      userId: amy,
      projectId: project.id,
      upload,
      updatedAt: 7_000_000,
    });

    const expected = { ...project, upload, updatedAt: 7_000_000 };
    expect(attached).toEqual(expected);
    expect(await projects.find(amy, project.id)).toEqual(expected);
  });

  it(`RF-150 ${name} replaces the whole source when a workbook batch is uploaded again`, async () => {
    const projects = await fresh();
    const project = workbook();
    await projects.insertOrFind(project);
    const first = {
      ...pricing,
      snapshotKey: `workbook__${project.id}@0123456789abcdef`,
    };
    const change = { userId: amy, projectId: project.id, upload: first, updatedAt: 7_000_000 };
    await projects.attachUpload(change);
    const second = {
      ...first,
      fileName: 'Costs.xlsx',
      workbooks: 1,
      snapshotKey: `workbook__${project.id}@fedcba9876543210`,
    };

    await projects.attachUpload({ ...change, upload: second, updatedAt: 8_000_000 });

    expect((await projects.find(amy, project.id))?.upload).toEqual(second);
  });
}

/** RF-150: the zip that held workbooks, and the owner scope of a workbook source. */
export function projectWorkbookCountContract(name: string, fresh: FreshProjects): void {
  it(`RF-150 ${name} keeps the workbook count of a zip that held workbooks`, async () => {
    const projects = await fresh();
    const project = sampleProject({
      userId: amy,
      sourceKind: 'upload',
      sourceUrl: '',
      ref: '',
      subpath: '',
    });
    await projects.insertOrFind(project);
    const upload = {
      fileName: 'OrderDesk.zip',
      uploadedAt: 6_000_000,
      snapshotKey: `upload__${project.id}@0123456789abcdef`,
      workbooks: 3,
    };

    await projects.attachUpload({ userId: amy, projectId: project.id, upload, updatedAt: 7 });

    expect((await projects.find(amy, project.id))?.upload).toEqual(upload);
  });

  it(`RF-150 ${name} records a workbook source for its owner only`, async () => {
    const projects = await fresh();
    const project = workbook();
    await projects.insertOrFind(project);
    const upload = { ...pricing, snapshotKey: `workbook__${project.id}@0123456789abcdef` };

    const foreign = await projects.attachUpload({
      userId: bob,
      projectId: project.id,
      upload,
      updatedAt: 7_000_000,
    });

    expect(foreign).toBeUndefined();
    expect(await projects.find(amy, project.id)).toEqual(project);
  });
}
