import { expect, it } from 'vitest';
import type {
  ProjectRepository,
  SettingsChange,
} from '../../src/application/ports/project-repository.js';
import type { Project } from '../../src/application/projects/project.js';
import type { ProjectSettings } from '../../src/application/projects/project-settings.js';
import { settingsWith, sampleProject } from '../support/project-fixtures.js';
import { parseProjectSettings } from '../../src/application/projects/project-settings.js';

// Architecture section 7: every ProjectRepository adapter (PgProjectRepository,
// MemoryProjectRepository) passes this suite. RF-010: unique on user, URL, ref and subpath;
// RF-1105: every operation is scoped by the owner, and another user's id finds nothing.

const amy = '00000000-0000-4000-9000-0000000000a1';
const bob = '00000000-0000-4000-9000-0000000000b2';
const unknownId = '00000000-0000-4000-a000-00000000ffff';

/** The repository holds its owners' rows, so a Pg adapter needs the users to exist first. */
export type FreshProjects = () => Promise<ProjectRepository>;

function storingTests(name: string, fresh: FreshProjects): void {
  it(`RF-010 ${name} stores a project and finds it by its owner and id`, async () => {
    const projects = await fresh();
    const project = sampleProject({ userId: amy, ref: 'main', subpath: 'src/Web' });

    const stored = await projects.insertOrFind(project);

    expect(stored).toEqual({ project, created: true });
    expect(await projects.find(amy, project.id)).toEqual(project);
  });

  it(`RF-010 ${name} returns the existing project for the same user, URL, ref and subpath`, async () => {
    const projects = await fresh();
    const first = sampleProject({ userId: amy, sourceUrl: 'https://github.com/o/r', ref: 'dev' });
    await projects.insertOrFind(first);

    const again = await projects.insertOrFind(
      sampleProject({ userId: amy, sourceUrl: 'https://github.com/o/r', ref: 'dev' }),
    );

    expect(again).toEqual({ project: first, created: false });
    expect(await projects.list(amy)).toEqual([first]);
  });

  it(`RF-010 ${name} keeps projects that differ in ref, subpath or user apart`, async () => {
    const projects = await fresh();
    const url = 'https://github.com/o/r';
    const results = await Promise.all([
      projects.insertOrFind(sampleProject({ userId: amy, sourceUrl: url })),
      projects.insertOrFind(sampleProject({ userId: amy, sourceUrl: url, ref: 'dev' })),
      projects.insertOrFind(sampleProject({ userId: amy, sourceUrl: url, subpath: 'src' })),
      projects.insertOrFind(sampleProject({ userId: bob, sourceUrl: url })),
    ]);

    expect(results.map((result) => result.created)).toEqual([true, true, true, true]);
  });
}

function scopingTests(name: string, fresh: FreshProjects): void {
  it(`RF-1105 ${name} lists only the projects of the user, newest first`, async () => {
    const projects = await fresh();
    const older = sampleProject({ userId: amy, createdAt: 1_000_000 });
    const newer = sampleProject({ userId: amy, createdAt: 2_000_000 });
    const foreign = sampleProject({ userId: bob });
    for (const project of [older, foreign, newer]) await projects.insertOrFind(project);

    expect(await projects.list(amy)).toEqual([newer, older]);
    expect(await projects.list(bob)).toEqual([foreign]);
  });

  it(`RF-1008 ${name} lists at most the limit asked for, the newest projects`, async () => {
    const projects = await fresh();
    const made = [1, 2, 3].map((number) =>
      sampleProject({ userId: amy, createdAt: number * 1_000_000 }),
    );
    for (const project of made) await projects.insertOrFind(project);

    expect(await projects.list(amy, 2)).toEqual([made[2], made[1]]);
    expect(await projects.list(amy, 10)).toHaveLength(3);
  });

  it(`RF-1105 ${name} finds nothing for another user's project id or an unknown id`, async () => {
    const projects = await fresh();
    const project = sampleProject({ userId: amy });
    await projects.insertOrFind(project);

    expect(await projects.find(bob, project.id)).toBeUndefined();
    expect(await projects.find(amy, unknownId)).toBeUndefined();
    expect(await projects.find(amy, 'not-a-uuid')).toBeUndefined();
  });
}

function parsedSettings(parallelism: number): ProjectSettings {
  const parsed = parseProjectSettings(settingsWith({ 'agents.parallelism': parallelism }));
  if (!parsed.ok) throw new Error('The settings were refused');
  return parsed.value;
}

function change(overrides: Partial<SettingsChange> = {}): SettingsChange {
  return {
    userId: amy,
    projectId: unknownId,
    settings: parsedSettings(3),
    updatedAt: 5_000_000,
    expectedVersion: undefined,
    ...overrides,
  };
}

function updatingTests(name: string, fresh: FreshProjects): void {
  it(`RF-002 ${name} replaces the settings and the update time of the owner's project and counts the version`, async () => {
    const projects = await fresh();
    const project = sampleProject({ userId: amy });
    await projects.insertOrFind(project);
    const settings = parsedSettings(3);

    const updated = await projects.updateSettings(
      change({ projectId: project.id, settings, expectedVersion: 1 }),
    );

    const expected = { ...project, settings, updatedAt: 5_000_000, settingsVersion: 2 };
    expect(updated).toEqual({ kind: 'updated', project: expected });
    expect(await projects.find(amy, project.id)).toEqual(expected);
  });

  it(`RF-1105 ${name} changes nothing for another user's project or an unknown id`, async () => {
    const projects = await fresh();
    const project = sampleProject({ userId: amy });
    await projects.insertOrFind(project);

    const foreign = await projects.updateSettings(
      change({ userId: bob, projectId: project.id, expectedVersion: 1 }),
    );
    const unknown = await projects.updateSettings(change({ expectedVersion: 1 }));

    expect(foreign).toEqual({ kind: 'missing' });
    expect(unknown).toEqual({ kind: 'missing' });
    expect(await projects.find(amy, project.id)).toEqual(project);
  });
}

function versionTests(name: string, fresh: FreshProjects): void {
  it(`RF-002 ${name} refuses a save made from an older version and keeps the stored settings`, async () => {
    const projects = await fresh();
    const project = sampleProject({ userId: amy });
    await projects.insertOrFind(project);
    await projects.updateSettings(change({ projectId: project.id, expectedVersion: 1 }));

    const stale = await projects.updateSettings(
      change({ projectId: project.id, settings: parsedSettings(5), expectedVersion: 1 }),
    );

    expect(stale).toEqual({ kind: 'stale', currentVersion: 2 });
    expect((await projects.find(amy, project.id))?.settings).toEqual(parsedSettings(3));
  });

  it(`RF-002 ${name} saves without a version unconditionally and still counts the version`, async () => {
    const projects = await fresh();
    const project = sampleProject({ userId: amy });
    await projects.insertOrFind(project);

    await projects.updateSettings(change({ projectId: project.id }));
    const second = await projects.updateSettings(
      change({ projectId: project.id, settings: parsedSettings(4) }),
    );

    expect(second).toMatchObject({ kind: 'updated', project: { settingsVersion: 3 } });
  });
}

/** A hook for `remove` that records whether the project was already gone when it ran. */
function recordingHook(projects: ProjectRepository): {
  readonly calls: string[];
  readonly hook: (id: string) => () => Promise<void>;
} {
  const calls: string[] = [];
  const hook = (id: string) => async (): Promise<void> => {
    const stillListed = (await projects.find(amy, id)) !== undefined;
    calls.push(stillListed ? `${id} still listed` : id);
  };
  return { calls, hook };
}

function removalTests(name: string, fresh: FreshProjects): void {
  it(`RF-1012 ${name} removes the owner's project and keeps the others`, async () => {
    const projects = await fresh();
    const doomed = sampleProject({ userId: amy });
    const kept = sampleProject({ userId: amy });
    for (const project of [doomed, kept]) await projects.insertOrFind(project);
    const { calls, hook } = recordingHook(projects);

    expect(await projects.remove(amy, doomed.id, hook(doomed.id))).toBe(true);

    expect(calls).toEqual([doomed.id]);
    expect(await projects.find(amy, doomed.id)).toBeUndefined();
    expect(await projects.list(amy)).toEqual([kept]);
    expect(await projects.remove(amy, doomed.id, hook(doomed.id))).toBe(false);
    expect(calls).toEqual([doomed.id]);
  });

  it(`RF-1105 ${name} removes nothing for another user's project, an unknown id or a bad id`, async () => {
    const projects = await fresh();
    const project = sampleProject({ userId: amy });
    await projects.insertOrFind(project);
    const { calls, hook } = recordingHook(projects);

    expect(await projects.remove(bob, project.id, hook(project.id))).toBe(false);
    expect(await projects.remove(amy, unknownId, hook(unknownId))).toBe(false);
    expect(await projects.remove(amy, 'not-a-uuid', hook('not-a-uuid'))).toBe(false);
    expect(calls).toEqual([]);
    expect(await projects.find(amy, project.id)).toEqual(project);
  });

  it(`RF-1012 ${name} has removed the project when the hook after the removal fails`, async () => {
    const projects = await fresh();
    const project = sampleProject({ userId: amy });
    await projects.insertOrFind(project);
    const failure = new Error('the folder could not be removed');

    await expect(projects.remove(amy, project.id, () => Promise.reject(failure))).rejects.toBe(
      failure,
    );

    expect(await projects.find(amy, project.id)).toBeUndefined();
  });
}

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

function sourceKindTests(name: string, fresh: FreshProjects): void {
  it(`RF-130 ${name} stores a project of kind github unless told otherwise`, async () => {
    const projects = await fresh();
    const project = sampleProject({ userId: amy });

    await projects.insertOrFind(project);

    expect(await projects.find(amy, project.id)).toMatchObject({ sourceKind: 'github' });
  });

  it(`RF-130 ${name} stores an upload project and finds it by its owner and id`, async () => {
    const projects = await fresh();
    const project = upload();

    const stored = await projects.insertOrFind(project);

    expect(stored).toEqual({ project, created: true });
    expect(await projects.find(amy, project.id)).toEqual(project);
    expect(await projects.find(bob, project.id)).toBeUndefined();
  });

  it(`RF-128 ${name} keeps two uploads of the same user apart`, async () => {
    const projects = await fresh();
    const first = upload();
    const second = upload();

    const results = [await projects.insertOrFind(first), await projects.insertOrFind(second)];

    expect(results.map((result) => result.created)).toEqual([true, true]);
    expect((await projects.list(amy)).map((project) => project.id).sort()).toEqual(
      [first.id, second.id].sort(),
    );
  });
}

function uploadRefusalTests(name: string, fresh: FreshProjects): void {
  it.each([
    ['a source address', { sourceUrl: 'https://github.com/o/r' }],
    ['a ref', { ref: 'main' }],
    ['a subpath', { subpath: 'src' }],
  ])(`RF-130 ${name} refuses an upload project that holds %s`, async (_what, overrides) => {
    const projects = await fresh();

    await expect(projects.insertOrFind(upload(overrides))).rejects.toThrow();
    expect(await projects.list(amy)).toEqual([]);
  });
}

export const projectOwners: readonly string[] = [amy, bob];

export function projectRepositoryContract(name: string, fresh: FreshProjects): void {
  storingTests(name, fresh);
  scopingTests(name, fresh);
  updatingTests(name, fresh);
  versionTests(name, fresh);
  removalTests(name, fresh);
  sourceKindTests(name, fresh);
  uploadRefusalTests(name, fresh);
}
